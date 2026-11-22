import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { validateSnapshot, snapshotDigest } from "../backups/snapshot.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
import {
  recoveryDataSql,
  destinationGuard,
  snapshotQuery,
} from "../recovery/restore-sql.mjs";
let s, patient, first;
const q = (sql, args = []) =>
  s.db.query(sql, args).then((r) => r.rows[0]?.result);
const save = (
  type,
  id = null,
  revision = null,
  start = "2026-11-16T09:00",
  status = "scheduled",
) =>
  q(
    "select public.clinical_appointment_save_typed($1,$2,$3,$4,45,$5,$6) as result",
    [id, revision, patient.id, start, status, type],
  );
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
before(async () => {
  s = await testSource();
  await s.asUser();
  await s.rpc("clinical_backup_seed_test");
  patient = (await s.rpc("clinical_patient_list_test")).find(
    (p) => !p.archived,
  );
});
after(async () => {
  await s?.db.close();
});
test("typed appointments reject missing permission, stale sessions and invalid types without creating rows", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
  ]) {
    await s.asUser(...args);
    await denied("42501", () => save("first_visit"));
  }
  await s.asUser();
  for (const value of [null, "", "blue", "Primera visita", "unclassified"])
    await denied("22023", () => save(value));
});
test("visit types are versioned atomically, weekly reads preserve them and old clients cannot erase them", async () => {
  first = await save("first_visit");
  assert.equal(first.visit_type, "first_visit");
  let edited = await save("gym", first.id, 1);
  assert.equal(edited.revision, 2);
  assert.equal(edited.visit_type, "gym");
  const legacy = await q(
    "select public.clinical_appointment_save_test($1,2,$2,'2026-11-16T09:00',45,'scheduled') as result",
    [first.id, patient.id],
  );
  assert.equal(legacy.visit_type, "gym");
  first = legacy;
  const weekly = await q(
    "select public.clinical_agenda_week('2026-11-18') as result",
  );
  assert.equal(weekly.appointments[0].visit_type, "gym");
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  const versions = snapshot.appointment_versions
    .filter((v) => v.appointment_id === first.id)
    .map((v) => JSON.parse(v.payload_json).visit_type);
  assert.deepEqual(versions, ["first_visit", "gym", "gym"]);
  await denied("40001", () => save("follow_up", first.id, 1));
  await s.asUser(B);
  await denied("42501", () => save("follow_up"));
  await s.asUser();
});
test("legacy appointments stay unclassified; classifying one does not rewrite previous versions", async () => {
  const legacy = await q(
    "select public.clinical_appointment_save_test(null,null,$1,'2026-11-17T11:00',45,'scheduled') as result",
    [patient.id],
  );
  assert.ok(!Object.hasOwn(legacy, "visit_type"));
  await save("first_visit", legacy.id, 1, "2026-11-17T11:00");
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  const versions = snapshot.appointment_versions.filter(
    (v) => v.appointment_id === legacy.id,
  );
  assert.ok(!Object.hasOwn(JSON.parse(versions[0].payload_json), "visit_type"));
  assert.equal(JSON.parse(versions[1].payload_json).visit_type, "first_visit");
});
test("type and schedule roll back together if the final version is rejected", async () => {
  await s.db.exec(
    "reset role;alter table clinical_private.appointment_versions add constraint reject_gym check(payload->>'visit_type' is distinct from 'gym') not valid",
  );
  await s.asUser();
  await denied("23514", () => save("gym", null, null, "2026-11-18T12:00"));
  await s.db.exec(
    "reset role;alter table clinical_private.appointment_versions drop constraint reject_gym",
  );
  await s.asUser();
  const weekly = await q(
    "select public.clinical_agenda_week('2026-11-18') as result",
  );
  assert.equal(weekly.appointments.length, 2);
});
test("typed sessions and all three types survive encrypted data and isolated service restoration", async () => {
  await save("follow_up", null, null, "2026-11-18T12:00");
  await q(
    "select public.clinical_session_save_test(null,null,$1,'Evolución sintética','','') as result",
    [first.id],
  );
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, "Frase sintética para comprobar tipos"),
    "Frase sintética para comprobar tipos",
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.deepEqual(
      (
        await restored.db.query(
          "select distinct visit_type from appointments order by visit_type",
        )
      ).rows.map((r) => r.visit_type),
      ["first_visit", "follow_up", "gym"],
    );
  } finally {
    await restored.db.close();
  }
  const target = await testSource();
  try {
    await target.db.exec("delete from clinical_private.authorized_clinicians");
    await target.db.exec(destinationGuard("visit-types-target"));
    await target.db.exec(
      (await recoveryDataSql(snapshot, "visit-types-target")).sql,
    );
    assert.equal(
      await snapshotDigest(
        (await target.db.query(snapshotQuery(snapshot))).rows[0].snapshot,
      ),
      await snapshotDigest(snapshot),
    );
  } finally {
    await target.db.close();
  }
  const invalid = structuredClone(snapshot);
  invalid.appointments[0].visit_type = "invalid";
  assert.throws(() => validateSnapshot(invalid));
});
