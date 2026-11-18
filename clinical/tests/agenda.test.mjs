import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
let s, patient, archived, other, winter, adjacent, session;
const query = async (sql, args = []) =>
  (await s.db.query(sql, args)).rows[0]?.result;
const book = (id, revision, pid, start, minutes = 60, status = "scheduled") =>
  query(
    "select public.clinical_appointment_save_test($1,$2,$3,$4,$5,$6) as result",
    [id, revision, pid, start, minutes, status],
  );
const saveSession = (
  id,
  revision,
  appt,
  evolution = "Evolución ficticia",
  passive = "Tratamiento pasivo ficticio",
  exercise = "Ejercicio ficticio",
) =>
  query(
    "select public.clinical_session_save_test($1,$2,$3,$4,$5,$6) as result",
    [id, revision, appt, evolution, passive, exercise],
  );
const denied = (code, fn) => assert.rejects(fn, (error) => error.code === code);
before(async () => {
  s = await testSource();
  await s.asUser(B);
  await s.rpc("clinical_backup_seed_test");
  other = (await s.rpc("clinical_patient_list_test")).find((p) => !p.archived);
  await s.asUser();
  await s.rpc("clinical_backup_seed_test");
  const p = await s.rpc("clinical_patient_list_test");
  patient = p.find((p) => !p.archived);
  archived = p.find((p) => p.archived);
});
after(async () => {
  await s?.db.close();
});

test("all agenda/session entry points reject anonymous, AAL1 and revoked sessions", async () => {
  for (const [actor, aal, sid, role] of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA, "authenticated"],
    [A, "aal2", B, "authenticated"],
  ]) {
    await s.asUser(actor, aal, sid, role);
    await denied("42501", () =>
      query("select public.clinical_agenda_list_test('2026-11-20') as result"),
    );
    await denied("42501", () =>
      book(null, null, patient.id, "2026-11-20T09:00"),
    );
    await denied("42501", () =>
      query("select public.clinical_session_get_test($1) as result", [A]),
    );
    await denied("42501", () => saveSession(null, null, A));
  }
});
test("clinic times use Madrid offsets, reject DST gaps/ambiguity and protect ownership", async () => {
  await s.asUser();
  winter = await book(null, null, patient.id, "2026-11-20T09:00");
  assert.equal(winter.starts_at, "2026-11-20T08:00:00.000000Z");
  const summer = await book(null, null, patient.id, "2026-07-20T09:00");
  assert.equal(summer.starts_at, "2026-07-20T07:00:00.000000Z");
  for (const local of ["2026-03-29T02:30", "2026-10-25T02:30"])
    await denied("22023", () => book(null, null, patient.id, local));
  await denied("42501", () =>
    book(null, null, archived.id, "2026-11-20T12:00"),
  );
  await denied("42501", () => book(null, null, other.id, "2026-11-20T12:00"));
});
test("overlaps are rejected, adjacent slots work and stale edits cannot overwrite rescheduling", async () => {
  await denied("23P01", () => book(null, null, patient.id, "2026-11-20T09:30"));
  adjacent = await book(null, null, patient.id, "2026-11-20T10:00");
  winter = await book(winter.id, 1, patient.id, "2026-11-20T11:30");
  assert.equal(winter.revision, 2);
  await denied("40001", () =>
    book(winter.id, 1, patient.id, "2026-11-20T12:30"),
  );
  await book(adjacent.id, 1, patient.id, "2026-11-20T10:00", 60, "cancelled");
  await book(null, null, patient.id, "2026-11-20T10:15", 30);
});
test("session creation completes the appointment atomically; updates retain history and reject duplicates/stale revisions", async () => {
  await denied("40001", () => saveSession(null, null, adjacent.id));
  session = await saveSession(null, null, winter.id);
  assert.equal(session.revision, 1);
  await denied("40001", () => saveSession(null, null, winter.id));
  session = await saveSession(
    session.id,
    1,
    winter.id,
    "Evolución ficticia revisada",
  );
  assert.equal(session.revision, 2);
  await denied("40001", () => saveSession(session.id, 1, winter.id));
  await denied("40001", () =>
    book(winter.id, 3, patient.id, "2026-11-20T14:00"),
  );
  await denied("23P01", () => book(null, null, patient.id, "2026-11-20T11:45"));
});
test("day boundaries and cross-midnight appointments follow clinic time and isolate users", async () => {
  const midnight = await book(null, null, patient.id, "2026-11-20T23:30", 60);
  const day = await query(
    "select public.clinical_agenda_list_test('2026-11-20') as result",
  );
  const next = await query(
    "select public.clinical_agenda_list_test('2026-11-21') as result",
  );
  assert.ok(day.appointments.some((a) => a.id === midnight.id));
  assert.ok(next.appointments.some((a) => a.id === midnight.id));
  assert.ok(
    day.appointments.some(
      (a) =>
        a.id === winter.id &&
        a.status === "completed" &&
        a.session_id === session.id,
    ),
  );
  await s.asUser(B);
  const own = await book(null, null, other.id, "2026-11-20T11:30");
  const list = await query(
    "select public.clinical_agenda_list_test('2026-11-20') as result",
  );
  assert.ok(list.appointments.every((a) => a.id === own.id));
  await denied("42501", () =>
    query("select public.clinical_session_get_test($1) as result", [winter.id]),
  );
  await denied("42501", () => saveSession(session.id, 2, winter.id));
  await s.asUser();
});
test("audit failure rolls back session text and version changes", async () => {
  await s.db.exec(
    "reset role;alter table clinical_private.audit_events add constraint fail_session_audit check(action<>'session.update') not valid",
  );
  await s.asUser();
  await denied("23514", () =>
    saveSession(session.id, 2, winter.id, "No debe confirmarse"),
  );
  await s.db.exec(
    "reset role;alter table clinical_private.audit_events drop constraint fail_session_audit",
  );
  const current = (
    await s.db.query(
      "select evolution,revision from clinical_private.clinical_sessions where id=$1",
      [session.id],
    )
  ).rows[0];
  assert.equal(current.evolution, "Evolución ficticia revisada");
  assert.equal(current.revision, 2);
  await s.asUser();
});
test("new tables deny direct clients even if an accidental permissive policy is added", async () => {
  for (const table of [
    "appointments",
    "appointment_versions",
    "clinical_sessions",
    "session_versions",
  ])
    await denied("42501", () =>
      s.db.query(`select * from clinical_private.${table}`),
    );
  await s.db.exec(
    "reset role;grant select on clinical_private.appointments to authenticated;create policy accidental on clinical_private.appointments for select to authenticated using(true)",
  );
  await s.asUser();
  assert.deepEqual(
    (await s.db.query("select * from clinical_private.appointments")).rows,
    [],
  );
  await s.db.exec(
    "reset role;revoke select on clinical_private.appointments from authenticated;drop policy accidental on clinical_private.appointments",
  );
  await s.asUser();
});
test("current snapshot restores all seven agenda collections and rejects broken session/history/entity links", async () => {
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(snapshot.version, 4);
  assert.ok(snapshot.appointments.length >= 3);
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.session_versions.length, 2);
  assert.ok(snapshot.appointments.every((a) => a.clinician_id === A));
  assert.ok(snapshot.sessions.every((a) => a.clinician_id === A));
  const phrase = "Frase-sintetica-para-restaurar-agenda-sesiones";
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, phrase),
    phrase,
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.equal(restored.agendaCounts.sessions, 1);
    assert.equal(
      (
        await restored.db.query(
          "select evolution from clinical_sessions where id=$1",
          [session.id],
        )
      ).rows[0].evolution,
      "Evolución ficticia revisada",
    );
    assert.equal(
      (
        await restored.db.query(
          "select count(*)::int as n from appointment_versions",
        )
      ).rows[0].n,
      snapshot.appointment_versions.length,
    );
  } finally {
    await restored.db.close();
  }
  for (const mutate of [
    (v) => v.session_versions.pop(),
    (v) => (v.appointments = []),
    (v) =>
      (v.audit_events.find((e) => e.action === "session.create").entity_id = B),
    (v) => (v.sessions[0].patient_id = other.id),
  ]) {
    const invalid = structuredClone(snapshot);
    mutate(invalid);
    assert.throws(() => validateSnapshot(invalid), /copia de prueba/);
  }
});
test("old version-1 files still decrypt, validate and restore without agenda tables", async () => {
  const old = JSON.parse(
    await readFile(
      new URL("../access-tests/backup-fixture.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(old.version, 1);
  const phrase = "Frase-sintetica-para-copia-anterior-v1";
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(old, phrase),
    phrase,
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.equal(restored.agendaCounts, null);
    assert.equal(
      (
        await restored.db.query(
          "select to_regclass('appointments') as table_name",
        )
      ).rows[0].table_name,
      null,
    );
  } finally {
    await restored.db.close();
  }
});
