import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
let s, active, archived, foreign;
const patch = (id, revision, fields) =>
  s.db.query(
    "select public.clinical_patient_save_fields_test($1,$2,$3::jsonb) as result",
    [id, revision, JSON.stringify(fields)],
  );
const denied = (code, fn) => assert.rejects(fn, (error) => error.code === code);
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

test("test-patient entry points require a live admitted AAL2 identity", async () => {
  for (const [user, aal, session, role] of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA, "authenticated"],
    [A, "aal2", B, "authenticated"],
  ]) {
    await s.asUser(user, aal, session, role);
    await denied("42501", () => s.rpc("clinical_patient_list_test"));
    await denied("42501", () =>
      patch(active.id, 2, { history: "Texto ficticio" }),
    );
  }
});
test("lists include archived fixtures and isolate owners", async () => {
  await s.asUser();
  const rows = await s.rpc("clinical_patient_list_test");
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((p) => p.archived).length, 1);
  assert.ok(rows.every((p) => p.id !== foreign.id));
});
test("field updates preserve unknown fields, treatment, numeric precision and revision history", async () => {
  await s.db.exec("reset role");
  await s.db.query(
    "update clinical_private.patients set payload=payload||'{\"exact\":9007199254740993}'::jsonb where id=$1",
    [active.id],
  );
  await s.db.query(
    "update clinical_private.patient_versions v set payload=p.payload from clinical_private.patients p where p.id=v.patient_id and p.id=$1 and v.revision=p.revision",
    [active.id],
  );
  await s.asUser();
  assert.equal(
    (
      await patch(active.id, 2, {
        history: "Historia ficticia guardada",
        exam: "Exploración ficticia",
      })
    ).rows[0].result.revision,
    3,
  );
  await s.db.exec("reset role");
  const p = (
    await s.db.query(
      "select payload->>'history' as history,payload->'treatment' as treatment,payload::text as full,revision from clinical_private.patients where id=$1",
      [active.id],
    )
  ).rows[0];
  assert.equal(p.history, "Historia ficticia guardada");
  assert.ok(p.full.includes("9007199254740993"));
  assert.deepEqual(p.treatment, {
    passive: "Movilización ficticia",
    exercises: ["Isométrico de cuádriceps"],
  });
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int as n from clinical_private.patient_versions where patient_id=$1",
        [active.id],
      )
    ).rows[0].n,
    3,
  );
  await s.asUser();
  await denied("40001", () =>
    patch(active.id, 2, { history: "Texto antiguo" }),
  );
});
test("unknown keys, non-text values and oversized fields cannot change names, ownership or test markers", async () => {
  await s.asUser();
  for (const fields of [
    {},
    { name: "Nombre distinto" },
    { clinician_id: B },
    { testOnly: false },
    { fixture: "other" },
    { history: null },
    { exam: [] },
    { history: "x".repeat(8001) },
    { goals: "x".repeat(2001) },
  ])
    await denied("22023", () => patch(active.id, 3, fields));
});
test("archived and foreign patients cannot be edited, and a failed audit rolls back the update", async () => {
  await s.asUser();
  await denied("40001", () =>
    patch(archived.id, 2, { history: "No archivar cambios" }),
  );
  await denied("40001", () =>
    patch(foreign.id, 2, { history: "No tocar otro propietario" }),
  );
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events add constraint fail_patient_update check(action<>'patient.update') not valid",
  );
  await s.asUser();
  await denied("23514", () =>
    patch(active.id, 3, { history: "No debe confirmarse" }),
  );
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events drop constraint fail_patient_update",
  );
  assert.equal(
    (
      await s.db.query(
        "select revision from clinical_private.patients where id=$1",
        [active.id],
      )
    ).rows[0].revision,
    3,
  );
});
test("edited records remain exportable and restore with all versions and audit events", async () => {
  await s.asUser();
  const snapshot = await s.rpc("clinical_backup_export_test");
  const phrase = "Frase-sintetica-para-el-paciente-de-prueba";
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, phrase),
    phrase,
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.equal(restored.counts.versions, 5);
    assert.equal(
      (
        await restored.db.query(
          "select payload->>'history' as history from patients where id=$1",
          [active.id],
        )
      ).rows[0].history,
      "Historia ficticia guardada",
    );
  } finally {
    await restored.db.close();
  }
});
