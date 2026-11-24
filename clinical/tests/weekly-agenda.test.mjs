import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import {
  HOURS,
  mondayOf,
  localInput,
  slotAppointments,
  hasVisibleSlot,
} from "../access/weekly-calendar.js";
let s, patient;
const week = (day) =>
  s.db
    .query("select public.clinical_agenda_week($1) as result", [day])
    .then((r) => r.rows[0].result);
const book = (start, minutes = 45) =>
  s.db
    .query(
      "select public.clinical_appointment_save_test(null,null,$1,$2,$3,'scheduled') as result",
      [patient.id, start, minutes],
    )
    .then((r) => r.rows[0].result);
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
test("weekly reads require current admitted AAL2 sessions and reject anonymous, wrong sessions and disabled users", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
  ]) {
    await s.asUser(...args);
    await denied("42501", () => week("2026-11-18"));
  }
  await s.db.exec("reset role");
  await s.db.query(
    "update clinical_private.authorized_clinicians set enabled=false where user_id=$1",
    [B],
  );
  await s.asUser(B);
  await denied("42501", () => week("2026-11-18"));
  await s.asUser();
  for (const value of [null, "2019-12-31", "2101-01-01"])
    await denied("22023", () => week(value));
});
test("one weekly read returns Monday-Friday bounds, keeps off-grid records and emits one audit event", async () => {
  const monday = await book("2026-11-16T08:00");
  const wednesday = await book("2026-11-18T14:00");
  const friday = await book("2026-11-20T23:30", 90);
  const saturday = await book("2026-11-21T10:00");
  await book("2026-11-23T09:00");
  const result = await week("2026-11-18");
  assert.equal(result.week_start, "2026-11-16");
  assert.equal(result.week_end, "2026-11-20");
  assert.deepEqual(
    result.appointments.map((a) => a.id),
    [monday.id, wednesday.id, friday.id, saturday.id],
  );
  assert.equal(result.patients.length, 1);
  const again = await week("2026-11-22");
  assert.equal(again.week_start, result.week_start);
  await s.db.exec("reset role");
  const audits = await s.db.query(
    "select count(*)::int n from clinical_private.audit_events where actor_id=$1 and action='agenda.read'",
    [A],
  );
  assert.equal(audits.rows[0].n, 2);
  await s.asUser();
});
test("week bounds handle year changes and Madrid daylight saving; other owners stay isolated", async () => {
  assert.equal((await week("2020-01-01")).week_start, "2019-12-30");
  const summer = await book("2026-07-20T08:00");
  const july = await week("2026-07-24");
  assert.equal(july.appointments[0].id, summer.id);
  assert.equal(july.appointments[0].starts_at, "2026-07-20T06:00:00.000000Z");
  await book("2026-10-25T09:00");
  assert.equal((await week("2026-10-19")).appointments.length, 1);
  await s.db.exec("reset role");
  await s.db.query(
    "update clinical_private.authorized_clinicians set enabled=true where user_id=$1",
    [B],
  );
  await s.asUser(B);
  const other = await week("2026-11-18");
  assert.equal(other.appointments.length, 0);
  assert.equal(other.patients.length, 0);
  await s.asUser();
});
test("weekly clinical mode returns clinical patients, preserves the invoker boundary and refuses suspension", async () => {
  const t = await testSource();
  try {
    await t.db.query(
      "update clinical_private.authorized_clinicians set data_mode='clinical',approval_reference='synthetic' where user_id=$1",
      [A],
    );
    await t.asUser();
    await t.db.query("select public.clinical_patient_register($1::jsonb,$2)", [
      JSON.stringify({ given_name: "Persona", family_name: "Sintética" }),
      crypto.randomUUID(),
    ]);
    const get = () =>
      t.db.query("select public.clinical_agenda_week('2026-11-18') as result");
    assert.equal(
      (await get()).rows[0].result.patients[0].name,
      "Persona Sintética",
    );
    await t.db.exec("reset role");
    assert.equal(
      (
        await t.db.query(
          "select prosecdef from pg_proc where oid='public.clinical_agenda_week(date)'::regprocedure",
        )
      ).rows[0].prosecdef,
      false,
    );
    await t.db.query(
      "update clinical_private.authorized_clinicians set data_mode='suspended' where user_id=$1",
      [A],
    );
    await t.asUser();
    await denied("42501", get);
  } finally {
    await t.db.close();
  }
});
test("grid slots exclude 14:00 and use interval overlap, keeping cancelled/off-grid records distinguishable", () => {
  assert.deepEqual(HOURS, [8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19]);
  assert.equal(mondayOf("2026-11-22"), "2026-11-16");
  const row = {
    id: "synthetic",
    starts_at: "2026-11-18T08:30:00Z",
    ends_at: "2026-11-18T10:15:00Z",
  };
  assert.equal(localInput(row.starts_at), "2026-11-18T09:30");
  assert.equal(slotAppointments([row], "2026-11-18", 9).length, 1);
  assert.equal(slotAppointments([row], "2026-11-18", 10).length, 1);
  assert.equal(slotAppointments([row], "2026-11-18", 11).length, 1);
  assert.equal(slotAppointments([row], "2026-11-18", 12).length, 0);
  assert.equal(
    hasVisibleSlot(
      {
        ...row,
        starts_at: "2026-11-18T13:00:00Z",
        ends_at: "2026-11-18T13:45:00Z",
      },
      "2026-11-16",
    ),
    false,
  );
  assert.equal(
    hasVisibleSlot(
      {
        ...row,
        starts_at: "2026-11-21T08:00:00Z",
        ends_at: "2026-11-21T08:45:00Z",
      },
      "2026-11-16",
    ),
    false,
  );
});
