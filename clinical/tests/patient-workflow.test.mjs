import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
import { readFile } from "node:fs/promises";
let s;
const q = async (sql, args = []) =>
  (await s.db.query(sql, args)).rows[0]?.result;
const create = (alias, id = crypto.randomUUID()) =>
  q("select public.clinical_patient_create_test($1,$2) as result", [alias, id]);
const archive = (id, rev) =>
  q("select public.clinical_patient_archive_test($1,$2) as result", [id, rev]);
const save = (id, rev, fields) =>
  q(
    "select public.clinical_patient_save_fields_test($1,$2,$3::jsonb) as result",
    [id, rev, JSON.stringify(fields)],
  );
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
before(async () => {
  s = await testSource();
});
after(async () => {
  await s?.db.close();
});
test("new create and archive endpoints reject anonymous, AAL1, revoked and foreign identities", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
  ]) {
    await s.asUser(...args);
    await denied("42501", () => create("Caso no admitido"));
    await denied("42501", () => archive(A, 1));
  }
  await s.asUser(B);
  const p = await create("Caso ajeno");
  await s.asUser();
  await denied("42501", () => create("Caso ajeno", p.id));
  await denied("42501", () => archive(p.id, 1));
});
test("empty v5 exports restore without creating example patients", async () => {
  await s.asUser();
  const snap = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(snap.version, 5);
  assert.equal(snap.patients.length, 0);
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snap, "Frase ficticia de copia vacía 2026"),
    "Frase ficticia de copia vacía 2026",
  );
  try {
    assert.equal(restored.counts.patients, 0);
    assert.equal(restored.sourceHash, restored.restoredHash);
  } finally {
    await restored.db.close();
  }
});
test("create normalizes aliases, records one audited revision and safely retries a lost acknowledgment", async () => {
  await s.asUser();
  const id = crypto.randomUUID(),
    p = await create("  Caso\u00a0de ensayo  ", id);
  assert.equal(p.revision, 1);
  assert.equal(p.already_present, false);
  const retry = await create("Caso de ensayo", id);
  assert.equal(retry.already_present, true);
  await denied("40001", () => create("Otro caso", id));
  await denied("23505", () => create("CASO DE ENSAYO"));
  for (const alias of [
    "",
    "  ",
    "x".repeat(81),
    "Caso\nincorrecto",
    "Caso\u0085incorrecto",
  ])
    await denied("22023", () => create(alias));
  const got = await q("select public.clinical_patient_get($1) as result", [id]);
  assert.equal(got.payload.name, "FICTICIO · Caso de ensayo");
  assert.equal(got.payload.testOnly, true);
  await s.db.exec("reset role");
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int as n from clinical_private.patient_versions where patient_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  await s.asUser(B);
  await create("Caso de ensayo");
  await s.asUser();
});
test("new aliases and clinical drafts preserve unknown payloads and reject stale or archived writes", async () => {
  await s.asUser();
  const p = await create("Caso editable");
  await s.db.exec("reset role");
  await s.db.query(
    `update clinical_private.patients set payload=payload||'{"unknown":{"exact":9007199254740993}}'::jsonb where id=$1`,
    [p.id],
  );
  await s.db.query(
    "update clinical_private.patient_versions v set payload=p.payload from clinical_private.patients p where p.id=v.patient_id and p.id=$1",
    [p.id],
  );
  await s.asUser();
  assert.equal(
    (
      await save(p.id, 1, {
        alias: "Caso editado",
        history: "Historia ficticia",
        goals: "Objetivo ficticio",
      })
    ).revision,
    2,
  );
  await denied("40001", () => save(p.id, 1, { history: "Cambio desfasado" }));
  await denied("22023", () => save(p.id, 2, { name: "Identidad directa" }));
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.ok(
    snapshot.patients
      .find((x) => x.id === p.id)
      .payload_json.includes("9007199254740993"),
  );
  await archive(p.id, 2);
  await denied("40001", () => save(p.id, 3, { history: "No permitido" }));
  const got = await q("select public.clinical_patient_get($1) as result", [
    p.id,
  ]);
  assert.ok(got.archived_at);
  assert.equal(got.payload.alias, "Caso editado");
});
test("archiving cannot orphan scheduled appointments and retains completed sessions in a full multi-patient copy", async () => {
  await s.asUser();
  const p = await create("Caso con cita");
  const a = await q(
    "select public.clinical_appointment_save_test(null,null,$1,'2026-11-21T10:00',45,'scheduled') as result",
    [p.id],
  );
  await denied("23514", () => archive(p.id, 1));
  const got = await q("select public.clinical_patient_get($1) as result", [
    p.id,
  ]);
  assert.equal(got.archived_at, null);
  assert.equal(got.revision, 1);
  await q(
    "select public.clinical_session_save_test(null,null,$1,'Evolución ficticia','Pasivo ficticio','Ejercicio ficticio') as result",
    [a.id],
  );
  await archive(p.id, 1);
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(snapshot.patients.length, 3);
  assert.equal(snapshot.sessions.length, 1);
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, "Frase sintética de recuperación 2026"),
    "Frase sintética de recuperación 2026",
  );
  try {
    assert.equal(restored.counts.patients, 3);
    assert.equal(restored.sourceHash, restored.restoredHash);
  } finally {
    await restored.db.close();
  }
  assert.equal((await s.rpc("clinical_backup_seed_test")).patients, 3);
});
test("an audit failure rolls back new patient creation and archiving", async () => {
  await s.asUser();
  const p = await create("Caso sin archivar");
  const id = crypto.randomUUID();
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events add constraint reject_workflow_audit check(false) not valid",
  );
  await s.asUser();
  await denied("23514", () => create("Caso sin guardar", id));
  await denied("23514", () => archive(p.id, 1));
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events drop constraint reject_workflow_audit",
  );
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int as n from clinical_private.patients where id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
  const row = (
    await s.db.query(
      "select revision,archived_at from clinical_private.patients where id=$1",
      [p.id],
    )
  ).rows[0];
  assert.equal(row.revision, 1);
  assert.equal(row.archived_at, null);
});
test("list and full exports include more than fifty patients without silent truncation, and old v4 files remain valid", async () => {
  await s.asUser();
  for (let i = 0; i < 50; i++) await create("Caso adicional " + i);
  assert.equal((await s.rpc("clinical_patient_list_test")).length, 54);
  assert.equal(
    validateSnapshot(await s.rpc("clinical_backup_export_test")).patients
      .length,
    54,
  );
  const old = JSON.parse(
    await readFile(
      new URL(
        "../access-tests/backup-exercise-revisions-fixture.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(validateSnapshot(old).version, 4);
});
test("the 500-patient cap refuses creation and oversized lists/exports without trimming", async () => {
  await s.asUser();
  for (let i = 54; i < 500; i++) await create("Caso de límite " + i);
  assert.equal((await s.rpc("clinical_patient_list_test")).length, 500);
  await denied("54000", () => create("No debe caber"));
  await q(
    'select public.clinical_patient_create(\'{"name":"FICTICIO · Registro de prueba administrativo","fixture":"backup-roundtrip-v1","testOnly":true}\'::jsonb) as result',
  );
  await denied("54000", () => s.rpc("clinical_patient_list_test"));
  await denied("54000", () => s.rpc("clinical_backup_export_test"));
});
