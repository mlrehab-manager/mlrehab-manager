import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
import { readFile } from "node:fs/promises";
let s, active, archived, foreign;
const patch = (id, revision, fields) =>
  s.db.query(
    "select public.clinical_patient_save_fields_test($1,$2,$3::jsonb) as result",
    [id, revision, JSON.stringify(fields)],
  );
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
before(async () => {
  s = await testSource();
  await s.asUser(B);
  await s.rpc("clinical_backup_seed_test");
  foreign = (await s.rpc("clinical_patient_list_test")).find(
    (p) => !p.archived,
  );
  await s.asUser();
  await s.rpc("clinical_backup_seed_test");
  const rows = await s.rpc("clinical_patient_list_test");
  active = rows.find((p) => !p.archived);
  archived = rows.find((p) => p.archived);
});
after(async () => {
  await s?.db.close();
});
test("intake edits require admitted live AAL2, ownership, active state and current revision", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
  ]) {
    await s.asUser(...args);
    await denied("42501", () =>
      patch(active.id, 2, { reason: "Motivo ficticio" }),
    );
  }
  await s.asUser();
  for (const p of [archived, foreign])
    await denied("40001", () =>
      patch(p.id, p.revision, { precautions: "Texto ficticio" }),
    );
  await denied("40001", () =>
    patch(active.id, 1, { reason: "Versión ficticia antigua" }),
  );
});
test("intake fields validate type and bounds without weakening the editable-field allowlist", async () => {
  await s.asUser();
  for (const fields of [
    { reason: null },
    { reason: [] },
    { precautions: {} },
    { reason: "x".repeat(2001) },
    { precautions: "x".repeat(4001) },
    { reason: "Ejemplo", testOnly: false },
    { reason: "Ejemplo", name: "Cambio no permitido" },
  ])
    await denied("22023", () => patch(active.id, 2, fields));
  const result = (
    await patch(active.id, 2, {
      reason: "x".repeat(2000),
      precautions: "y".repeat(4000),
    })
  ).rows[0].result;
  assert.equal(result.revision, 3);
});
test("intake saves preserve prior text and exact unknown data and recover through the encrypted copy", async () => {
  await s.db.exec("reset role");
  await s.db.query(
    `update clinical_private.patients set payload=payload||'{"untouched":{"number":9007199254740993}}'::jsonb where id=$1`,
    [active.id],
  );
  await s.db.query(
    "update clinical_private.patient_versions v set payload=p.payload from clinical_private.patients p where p.id=v.patient_id and p.id=$1 and v.revision=p.revision",
    [active.id],
  );
  await s.asUser();
  await patch(active.id, 3, {
    reason: "Motivo ficticio de rodilla",
    precautions: "Antecedente ficticio anotado",
  });
  const snap = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  const p = snap.patients.find((p) => p.id === active.id),
    payload = JSON.parse(p.payload_json);
  assert.equal(payload.history, "Historia ficticia revisada · recuperación 🧪");
  assert.equal(payload.reason, "Motivo ficticio de rodilla");
  assert.ok(p.payload_json.includes("9007199254740993"));
  assert.equal(snap.version, 5);
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snap, "Frase ficticia de anamnesis ampliada"),
    "Frase ficticia de anamnesis ampliada",
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    const row = (
      await restored.db.query("select payload from patients where id=$1", [
        active.id,
      ])
    ).rows[0];
    assert.equal(row.payload.precautions, "Antecedente ficticio anotado");
  } finally {
    await restored.db.close();
  }
  for (const [field, value] of [
    ["reason", 3],
    ["precautions", "x".repeat(4001)],
  ]) {
    const bad = structuredClone(snap),
      p = bad.patients.find((p) => p.id === active.id),
      data = JSON.parse(p.payload_json);
    data[field] = value;
    p.payload_json = JSON.stringify(data);
    bad.patient_versions.find(
      (v) => v.patient_id === p.id && v.revision === p.revision,
    ).payload_json = p.payload_json;
    assert.throws(() => validateSnapshot(bad));
  }
  const old = JSON.parse(
    await readFile(
      new URL(
        "../access-tests/backup-patient-workflow-fixture.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(validateSnapshot(old).version, 5);
});
test("failed audit rolls back intake text and its revision; optional fields can be explicitly cleared", async () => {
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events add constraint fail_intake_audit check(action<>'patient.update') not valid",
  );
  await s.asUser();
  await denied("23514", () =>
    patch(active.id, 4, { precautions: "No confirmar" }),
  );
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events drop constraint fail_intake_audit",
  );
  const p = (
    await s.db.query(
      "select revision,payload from clinical_private.patients where id=$1",
      [active.id],
    )
  ).rows[0];
  assert.equal(p.revision, 4);
  assert.equal(p.payload.precautions, "Antecedente ficticio anotado");
  await s.asUser();
  await patch(active.id, 4, { reason: "", precautions: "" });
  const snap = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(
    JSON.parse(snap.patients.find((p) => p.id === active.id).payload_json)
      .reason,
    "",
  );
});
test("upgrading from the previous schema leaves existing patient rows and history untouched", async () => {
  const old = await testSource({ migrationLimit: 10 });
  try {
    await old.asUser();
    await old.rpc("clinical_backup_seed_test");
    const p = (await old.rpc("clinical_patient_list_test")).find(
      (p) => !p.archived,
    );
    await old.db.exec("reset role");
    const sql =
      "select payload::text as payload,revision,created_at,updated_at from clinical_private.patients where id=$1";
    const before = (await old.db.query(sql, [p.id])).rows[0];
    await old.db.exec(
      await readFile(
        new URL(
          "../migrations/20261122090429_clinical_patient_intake_test.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual((await old.db.query(sql, [p.id])).rows[0], before);
    await old.asUser();
    await old.db.query(
      "select public.clinical_patient_save_fields_test($1,$2,$3::jsonb)",
      [
        p.id,
        p.revision,
        JSON.stringify({ reason: "Motivo ficticio tras ampliar" }),
      ],
    );
    const snap = validateSnapshot(await old.rpc("clinical_backup_export_test"));
    assert.equal(
      JSON.parse(snap.patients.find((r) => r.id === p.id).payload_json).history,
      "Historia ficticia revisada · recuperación 🧪",
    );
  } finally {
    await old.db.close();
  }
});
