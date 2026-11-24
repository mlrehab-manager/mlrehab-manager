import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "../backups/test-source.mjs";

let s;
const record = (details, id = crypto.randomUUID()) =>
  s.db
    .query(
      "select public.clinical_backup_check_record($1::jsonb,$2) as result",
      [JSON.stringify(details), id],
    )
    .then((r) => r.rows[0].result);
const denied = (code, work) => assert.rejects(work, (e) => e.code === code);
async function details() {
  const snapshot = await s.rpc("clinical_backup_export_test");
  return {
    version: snapshot.version,
    export_event_id: snapshot.audit_events
      .filter((e) => e.action === "backup.export")
      .at(-1).id,
    encrypted_sha256: "a".repeat(64),
    location: "icloud_drive",
    independent_copy: false,
    phrase_separate: false,
    verified_elsewhere: false,
  };
}
before(async () => {
  s = await testSource();
});
after(async () => {
  await s?.db.close();
});

test("backup check endpoints require current owner admission, AAL2 and a live session", async () => {
  for (const args of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA],
    [A, "aal2", B],
  ]) {
    await s.asUser(...args);
    await denied("42501", () => s.rpc("clinical_backup_check_status"));
    await denied("42501", () => record({}));
  }
});
test("partial custody is recorded honestly and a lost acknowledgement can be retried without duplicates", async () => {
  await s.asUser();
  assert.deepEqual(await s.rpc("clinical_backup_check_status"), {
    latest: null,
  });
  const d = await details(),
    id = crypto.randomUUID();
  const saved = await record(d, id);
  assert.deepEqual(saved.details, d);
  assert.equal(saved.data_mode, "test");
  assert.deepEqual(await record(d, id), saved);
  assert.deepEqual((await s.rpc("clinical_backup_check_status")).latest, saved);
  await denied("40001", () => record({ ...d, phrase_separate: true }, id));
  await s.db.exec("reset role");
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int n from clinical_private.backup_checks",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await s.db.query(
        "select count(*)::int n from information_schema.role_table_grants where table_schema='clinical_private' and table_name='backup_checks' and grantee in ('anon','authenticated')",
      )
    ).rows[0].n,
    0,
  );
  await s.asUser();
  await denied("42501", () =>
    s.db.query("select * from clinical_private.backup_checks"),
  );
});
test("unbounded text, extra patient content, invalid types, unsupported versions and non-export audit ids are refused", async () => {
  await s.asUser();
  const d = await details();
  for (const patch of [
    { patient_name: "FICTICIO" },
    { phrase: "no guardar" },
    { version: 4 },
    { version: 6 },
    { encrypted_sha256: "x".repeat(64) },
    { location: "Carpeta con nombre de paciente" },
    { independent_copy: "true" },
    { phrase_separate: null },
    { verified_elsewhere: 1 },
    { export_event_id: "99999999999999999999" },
    { export_event_id: "0" },
    { export_event_id: "1; drop table x" },
  ])
    await denied("22023", () => record({ ...d, ...patch }));
  const missing = { ...d };
  delete missing.phrase_separate;
  await denied("22023", () => record(missing));
  await s.rpc("clinical_patient_list_test");
  await s.db.exec("reset role");
  const readId = (
    await s.db.query(
      "select id::text id from clinical_private.audit_events where action='patient.list' and actor_id=$1 order by id desc limit 1",
      [A],
    )
  ).rows[0].id;
  await s.asUser();
  await denied("22023", () => record({ ...d, export_event_id: readId }));
});
test("another clinician cannot see or reuse a foreign export or request, and suspension closes both endpoints", async () => {
  await s.asUser();
  const d = await details(),
    id = crypto.randomUUID();
  await record(d, id);
  await s.asUser(B);
  assert.deepEqual(await s.rpc("clinical_backup_check_status"), {
    latest: null,
  });
  await denied("22023", () => record(d));
  const other = await details();
  await denied("42501", () => record(other, id));
  await s.db.exec("reset role");
  await s.db.query(
    "update clinical_private.authorized_clinicians set data_mode='suspended' where user_id=$1",
    [B],
  );
  await s.asUser(B);
  await denied("42501", () => s.rpc("clinical_backup_check_status"));
  await denied("42501", () => record(other));
});
test("operational receipts stay outside portable clinical collections and are not presented as restore evidence", async () => {
  await s.asUser();
  const snapshot = await s.rpc("clinical_backup_export_test");
  assert.ok(!Object.hasOwn(snapshot, "backup_checks"));
  assert.ok(!Object.hasOwn(snapshot, "phrase"));
  assert.equal(Object.keys(snapshot).length, 14);
});

test("clinical receipts require v6 and cannot enable clinical mode or bypass a suspended profile", async () => {
  const t = await testSource();
  try {
    await t.db.query(
      "update clinical_private.authorized_clinicians set data_mode='clinical',approval_reference='synthetic only' where user_id=$1",
      [A],
    );
    await t.asUser();
    const snapshot = await t.rpc("clinical_backup_export_test");
    const d = {
      version: 6,
      export_event_id: snapshot.audit_events.at(-1).id,
      encrypted_sha256: "b".repeat(64),
      location: "computer",
      independent_copy: true,
      phrase_separate: true,
      verified_elsewhere: true,
    };
    const call = (details) =>
      t.db.query("select public.clinical_backup_check_record($1::jsonb,$2)", [
        JSON.stringify(details),
        crypto.randomUUID(),
      ]);
    await denied("22023", () => call({ ...d, version: 5 }));
    await call(d);
    assert.equal(
      (await t.rpc("clinical_backup_check_status")).latest.data_mode,
      "clinical",
    );
    await t.db.exec("reset role");
    await t.db.query(
      "update clinical_private.authorized_clinicians set data_mode='suspended' where user_id=$1",
      [A],
    );
    await t.asUser();
    await denied("42501", () => call(d));
    await denied("42501", () => t.rpc("clinical_backup_check_status"));
  } finally {
    await t.db.close();
  }
});
