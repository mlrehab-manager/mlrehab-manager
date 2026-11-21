import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testSource, A, B, SA } from "./test-source.mjs";
import { encryptBackup } from "./crypto.mjs";
import { validateSnapshot } from "./snapshot.mjs";
import { restoreEncryptedToSandbox } from "./restore-sandbox.mjs";
let source, snapshot;
const phrase = "Frase-sintetica-para-el-ensayo-aislado-2026";
before(async () => {
  source = await testSource();
});
after(async () => {
  await source?.db.close();
});
async function denied(code, fn) {
  await assert.rejects(fn, (error) => error.code === code);
}

test("backup RPCs reject anonymous, AAL1 and revoked sessions", async () => {
  for (const [user, aal, session, role] of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA, "authenticated"],
    [A, "aal2", B, "authenticated"],
  ]) {
    await source.asUser(user, aal, session, role);
    for (const name of [
      "clinical_backup_seed_test",
      "clinical_backup_export_test",
    ])
      await denied("42501", () => source.rpc(name));
  }
});

test("preparation is idempotent, covers active and archived records, and exports only the caller", async () => {
  await source.asUser(B);
  await source.rpc("clinical_backup_seed_test");
  await source.asUser();
  assert.deepEqual(await source.rpc("clinical_backup_seed_test"), {
    patients: 2,
    already_present: false,
  });
  assert.deepEqual(await source.rpc("clinical_backup_seed_test"), {
    patients: 2,
    already_present: true,
  });
  snapshot = validateSnapshot(await source.rpc("clinical_backup_export_test"));
  assert.equal(snapshot.patients.length, 2);
  assert.equal(snapshot.patient_versions.length, 4);
  assert.equal(snapshot.audit_events.length, 5);
  assert.equal(
    snapshot.patients.filter((p) => p.archived_at !== null).length,
    1,
  );
  assert.ok(snapshot.patients.every((p) => p.clinician_id === A));
  assert.ok(snapshot.audit_events.every((e) => e.actor_id === A));
  assert.ok(!JSON.stringify(snapshot).includes(B));
  assert.equal(snapshot.audit_events.at(-1).action, "backup.export");
});

test("encrypted database export restores exactly into a separate PostgreSQL database", async () => {
  const encrypted = await encryptBackup(snapshot, phrase);
  const restored = await restoreEncryptedToSandbox(encrypted, phrase);
  try {
    assert.notEqual(restored.db, source.db);
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.deepEqual(restored.counts, { patients: 2, versions: 4, events: 5 });
    assert.equal(
      (
        await restored.db.query(
          "select count(*)::int as n from patients where archived_at is null",
        )
      ).rows[0].n,
      1,
    );
    await restored.db.query(
      "insert into audit_events(actor_id,action,created_at) values($1,'restore.test',now())",
      [A],
    );
    const next = (
      await restored.db.query("select max(id)::text as id from audit_events")
    ).rows[0].id;
    assert.ok(BigInt(next) > BigInt(snapshot.audit_events.at(-1).id));
    await source.db.exec("reset role");
    assert.equal(
      (
        await source.db.query(
          "select count(*)::int as n from clinical_private.patients",
        )
      ).rows[0].n,
      4,
    );
    assert.equal(
      (
        await source.db.query(
          "select count(*)::int as n from clinical_private.audit_events where action='restore.test'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await restored.db.close();
  }
});

test("missing history, mixed ownership, duplicate IDs and missing audit changes cannot be restored", async () => {
  for (const mutate of [
    (s) => s.patient_versions.pop(),
    (s) => (s.patients[0].clinician_id = B),
    (s) => (s.patients[1].id = s.patients[0].id),
    (s) =>
      (s.audit_events = s.audit_events.filter(
        (e) => e.action !== "patient.create",
      )),
    (s) => (s.test_only = false),
    (s) => (s.created_at = "2026-02-31T12:00:00.000000Z"),
  ]) {
    const bad = structuredClone(snapshot);
    mutate(bad);
    await assert.rejects(
      restoreEncryptedToSandbox(await encryptBackup(bad, phrase), phrase),
      /copia de prueba/,
    );
  }
  await assert.rejects(
    restoreEncryptedToSandbox(
      await encryptBackup(snapshot, phrase),
      "Otra-frase-sintetica-que-no-corresponde",
    ),
    /descifrar/,
  );
});

test("payload numbers, bigint event IDs and microsecond timestamps survive without JavaScript rounding", async () => {
  await source.db.exec("reset role");
  await source.db
    .exec(`update clinical_private.patients set payload=payload||'{"large":9007199254740993,"decimal":1.234567890123456789}'::jsonb where clinician_id='${A}' and archived_at is null;
    update clinical_private.patient_versions v set payload=p.payload from clinical_private.patients p where p.id=v.patient_id and v.revision=p.revision and p.clinician_id='${A}' and p.archived_at is null;
    insert into clinical_private.audit_events(id,actor_id,action,created_at) overriding system value values(9007199254740993,'${A}','patient.list','2026-11-15T12:00:00.123456Z');
    select setval(pg_get_serial_sequence('clinical_private.audit_events','id'),9007199254740993,true);`);
  await source.asUser();
  const exact = await source.rpc("clinical_backup_export_test");
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(exact, phrase),
    phrase,
  );
  try {
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.ok(
      (
        await restored.db.query(
          "select payload::text as value from patients where archived_at is null",
        )
      ).rows[0].value.includes("9007199254740993"),
    );
    assert.ok(
      (
        await restored.db.query(
          "select payload::text as value from patients where archived_at is null",
        )
      ).rows[0].value.includes("1.234567890123456789"),
    );
    assert.equal(
      (
        await restored.db.query(
          "select to_char(created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as time from audit_events where id=9007199254740993",
        )
      ).rows[0].time,
      "2026-11-15T12:00:00.123456Z",
    );
  } finally {
    await restored.db.close();
  }
});

test("failed export audit rolls back and preparation never overwrites other data", async () => {
  await source.db.exec("reset role");
  await source.db.exec(
    "alter table clinical_private.audit_events add constraint fail_export check(action<>'backup.export') not valid",
  );
  const before = (
    await source.db.query(
      "select count(*)::int as n from clinical_private.audit_events",
    )
  ).rows[0].n;
  await source.asUser();
  await denied("23514", () => source.rpc("clinical_backup_export_test"));
  await source.db.exec("reset role");
  assert.equal(
    (
      await source.db.query(
        "select count(*)::int as n from clinical_private.audit_events",
      )
    ).rows[0].n,
    before,
  );
  await source.db.exec(
    "alter table clinical_private.audit_events drop constraint fail_export",
  );
  await source.asUser();
  await source.db.query(
    'select public.clinical_patient_create(\'{"name":"Otro registro ficticio fuera del ensayo"}\'::jsonb)',
  );
  await denied("22023", () => source.rpc("clinical_backup_seed_test"));
  await denied("22023", () => source.rpc("clinical_backup_export_test"));
});

test("an oversized audit collection is refused without truncation or a partial export event", async () => {
  await source.db.exec("reset role");
  const foreign = (
    await source.db.query(
      "select id from clinical_private.patients where clinician_id=$1 and payload->>'fixture' is null",
      [A],
    )
  ).rows[0].id;
  await source.db.query(
    "delete from clinical_private.audit_events where patient_id=$1",
    [foreign],
  );
  await source.db.query(
    "delete from clinical_private.patient_versions where patient_id=$1",
    [foreign],
  );
  await source.db.query("delete from clinical_private.patients where id=$1", [
    foreign,
  ]);
  await source.db.query(
    "insert into clinical_private.audit_events(actor_id,action) select $1,'patient.list' from generate_series(1,10000)",
    [A],
  );
  const before = (
    await source.db.query(
      "select count(*)::int as n from clinical_private.audit_events",
    )
  ).rows[0].n;
  await source.asUser();
  await denied("54000", () => source.rpc("clinical_backup_export_test"));
  await source.db.exec("reset role");
  assert.equal(
    (
      await source.db.query(
        "select count(*)::int as n from clinical_private.audit_events",
      )
    ).rows[0].n,
    before,
  );
});
