import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { validateSnapshot, snapshotDigest } from "../backups/snapshot.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
import {
  destinationGuard,
  recoveryDataSql,
  snapshotQuery,
} from "../recovery/restore-sql.mjs";
let s, p, second, appointment, snapshot;
const identity = {
  given_name: "Persona",
  family_name: "Sintética",
  birth_date: "1990-01-02",
  phone: "+34 000 000 000",
  email: "synthetic@example.invalid",
};
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
const call = async (name, args = []) =>
  (
    await s.db.query(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
      args,
    )
  ).rows[0].result;
const register = (i = identity, id = crypto.randomUUID()) =>
  call("clinical_patient_register", [JSON.stringify(i), id]);
const patch = (id, rev, fields) =>
  call("clinical_patient_save_fields_test", [id, rev, JSON.stringify(fields)]);
async function mode(next, user = A, reference = "synthetic-local-approval") {
  await s.db.exec("reset role");
  await s.db.query(
    "update clinical_private.authorized_clinicians set data_mode=$1,approval_reference=$2 where user_id=$3",
    [next, reference, user],
  );
}
before(async () => {
  s = await testSource();
});
after(async () => {
  await s?.db.close();
});
test("clinical creation is disabled by default and cannot be self-enabled by a client", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
    [A, "aal2", SA],
  ]) {
    await s.asUser(...args);
    await denied("42501", () => register());
  }
  await s.asUser();
  assert.deepEqual(await s.rpc("clinical_access_check"), {
    authorized: true,
    data_mode: "test",
  });
  await denied("42501", () =>
    s.db.query(
      "update clinical_private.authorized_clinicians set data_mode='clinical' where user_id=$1",
      [A],
    ),
  );
});
test("activation needs a review reference and cannot mix an existing test dataset into clinical mode", async () => {
  await denied("23514", () => mode("clinical", A, null));
  await s.asUser(B);
  await s.rpc("clinical_backup_seed_test");
  await denied("23514", () => mode("clinical", B));
  await mode("clinical");
  await s.asUser();
  assert.deepEqual(await s.rpc("clinical_access_check"), {
    authorized: true,
    data_mode: "clinical",
  });
  await denied("42501", () =>
    call("clinical_patient_create_test", [
      "No crear demo",
      crypto.randomUUID(),
    ]),
  );
  await denied("22023", () =>
    call("clinical_patient_create", [
      JSON.stringify({ name: "Registro sin modelo clínico" }),
    ]),
  );
});
test("clinical identities normalize whitespace, retry safely and allow namesakes with distinct immutable IDs", async () => {
  await s.asUser();
  p = await register({ ...identity, given_name: "  Persona  " });
  assert.equal(p.revision, 1);
  assert.equal((await register(identity, p.id)).already_present, true);
  second = await register(identity);
  assert.notEqual(second.id, p.id);
  await denied("40001", () =>
    register({ ...identity, family_name: "Otro apellido" }, p.id),
  );
  const rows = await s.rpc("clinical_patient_list_test");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, rows[1].name);
  assert.equal(rows[0].birth_date, identity.birth_date);
  await s.asUser(B);
  await denied("42501", () => register(identity, p.id));
  await s.asUser();
});
test("identity types, dates, lengths, contact formats and unknown keys are rejected by the server", async () => {
  for (const data of [
    { given_name: "" },
    { family_name: null },
    { given_name: "x".repeat(81) },
    { birth_date: "2099-01-01" },
    { birth_date: "2001-02-29" },
    { phone: "call me" },
    { email: "bad@@mail.invalid" },
    { given_name: "A\nB" },
    { data_mode: "clinical" },
  ])
    await denied("22023", () => register({ ...identity, ...data }));
  await denied("22023", () => patch(p.id, 1, { name: "Direct name override" }));
  await denied("22023", () =>
    patch(p.id, 1, { fixture: "backup-roundtrip-v1" }),
  );
  await denied("22023", () => patch(p.id, 1, { alias: "No alias clínico" }));
});
test("clinical edits derive the display name, preserve notes and reject stale or foreign updates", async () => {
  await patch(p.id, 1, {
    reason: "Motivo sintético",
    precautions: "Precaución sintética",
    history: "Historia sintética",
  });
  await patch(p.id, 2, { family_name: "Sintética revisada", phone: "" });
  await denied("40001", () => patch(p.id, 2, { history: "Cambio desfasado" }));
  await denied("40001", () => patch(B, 1, { reason: "Ajeno" }));
  const row = await call("clinical_patient_get", [p.id]);
  assert.equal(row.payload.name, "Persona Sintética revisada");
  assert.equal(row.payload.history, "Historia sintética");
  assert.equal(row.payload.phone, "");
  assert.equal(row.payload.testOnly, undefined);
});
test("clinical patients participate in agenda and sessions; pending appointments prevent archive", async () => {
  appointment = await call("clinical_appointment_save_test", [
    null,
    null,
    p.id,
    "2026-11-23T10:00",
    45,
    "scheduled",
  ]);
  await denied("23514", () => call("clinical_patient_archive_test", [p.id, 3]));
  const day = await call("clinical_agenda_list_test", ["2026-11-23"]);
  assert.equal(day.patients.length, 2);
  assert.equal(day.appointments[0].patient_name, "Persona Sintética revisada");
  await call("clinical_session_save_test", [
    null,
    null,
    appointment.id,
    "Evolución sintética",
    "Pasivo sintético",
    "Ejercicio sintético",
  ]);
  await call("clinical_patient_archive_test", [p.id, 3]);
  await denied("40001", () => patch(p.id, 4, { history: "Archivado" }));
  const session = await call("clinical_session_get_test", [appointment.id]);
  assert.equal(session.exercise, "Ejercicio sintético");
});
test("clinical snapshot v6 encrypts and restores all data without test markers and rejects mixed formats", async () => {
  snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(snapshot.version, 6);
  assert.equal(snapshot.data_mode, "clinical");
  assert.equal(snapshot.test_only, undefined);
  assert.equal(snapshot.sessions.length, 1);
  const r = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, "Synthetic clinical snapshot phrase"),
    "Synthetic clinical snapshot phrase",
  );
  try {
    assert.equal(r.sourceHash, r.restoredHash);
  } finally {
    await r.db.close();
  }
  for (const change of [
    { test_only: true },
    { format: "mlrehab-clinical-test-snapshot" },
    { data_mode: "test" },
    { version: 5 },
  ])
    assert.throws(() =>
      validateSnapshot({ ...structuredClone(snapshot), ...change }),
    );
});
test("clinical service restore is explicit, refuses the working project and starts suspended until verified", async () => {
  const target = await testSource();
  try {
    await assert.rejects(() =>
      recoveryDataSql(snapshot, "clinical-unit-target"),
    );
    await assert.rejects(() =>
      recoveryDataSql(snapshot, "clinical-unit-target", {
        allowClinical: "false",
      }),
    );
    await assert.rejects(() =>
      recoveryDataSql(snapshot, "jrrnvjrwrphmconrkayc", {
        allowClinical: true,
      }),
    );
    await target.db.exec("delete from clinical_private.authorized_clinicians");
    await target.db.exec(destinationGuard("clinical-unit-target"));
    await target.db.exec(
      (
        await recoveryDataSql(snapshot, "clinical-unit-target", {
          allowClinical: true,
        })
      ).sql,
    );
    const readback = (await target.db.query(snapshotQuery(snapshot))).rows[0]
      .snapshot;
    assert.equal(
      await snapshotDigest(readback),
      await snapshotDigest(snapshot),
    );
    await target.asUser();
    await denied("42501", () => target.rpc("clinical_access_check"));
    await target.db.exec("reset role");
    await target.db.query(
      "update clinical_private.authorized_clinicians set enabled=true,data_mode='clinical',approval_reference='synthetic-recovery-verification' where user_id=$1",
      [A],
    );
    await target.asUser();
    assert.equal((await target.rpc("clinical_patient_list_test")).length, 2);
  } finally {
    await target.db.close();
  }
});
test("suspension blocks old RPCs too, and mode transitions cannot silently revert to test mode", async () => {
  await mode("suspended");
  await s.asUser();
  for (const [name, args] of [
    ["clinical_access_check", []],
    ["clinical_patient_list", []],
    ["clinical_patient_get", [p.id]],
    ["clinical_session_get_test", [appointment.id]],
    ["clinical_backup_export_test", []],
  ])
    await denied("42501", () => call(name, args));
  await denied("22023", () => mode("test"));
  await mode("clinical");
  await s.asUser();
  assert.equal((await s.rpc("clinical_access_check")).data_mode, "clinical");
});
test("mode changes and clinical writes roll back if their audit cannot be recorded", async () => {
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.mode_events add constraint reject_mode_event check(false) not valid",
  );
  await denied("23514", () => mode("suspended"));
  await s.db.exec(
    "alter table clinical_private.mode_events drop constraint reject_mode_event",
  );
  await s.asUser();
  assert.equal((await s.rpc("clinical_access_check")).data_mode, "clinical");
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events add constraint reject_clinical_write check(action<>'patient.update') not valid",
  );
  await s.asUser();
  await denied("23514", () => patch(second.id, 1, { history: "No confirmar" }));
  await s.db.exec("reset role");
  await s.db.exec(
    "alter table clinical_private.audit_events drop constraint reject_clinical_write",
  );
  await s.asUser();
  assert.equal((await call("clinical_patient_get", [second.id])).revision, 1);
  await s.db.exec("reset role");
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int as n from clinical_private.mode_events where clinician_id=$1",
        [A],
      )
    ).rows[0].n,
    3,
  );
});

test("birth dates follow the clinic day even if the database session uses another timezone", async () => {
  await s.db.exec("reset role;set time zone 'Etc/GMT+12'");
  try {
    const date = (
      await s.db.query(
        "select to_char(statement_timestamp() at time zone 'Europe/Madrid','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    const value = (
      await s.db.query(
        "select clinical_private.patient_identity($1::jsonb) as value",
        [JSON.stringify({ ...identity, birth_date: date })],
      )
    ).rows[0].value;
    assert.equal(value.birth_date, date);
  } finally {
    await s.db.exec("set time zone 'UTC'");
    await s.asUser();
  }
});
