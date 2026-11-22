import { test } from "node:test";
import assert from "node:assert/strict";
import { testSource } from "../backups/test-source.mjs";
import { validateSnapshot, snapshotDigest } from "../backups/snapshot.mjs";
import { recoverySchema } from "./schema.mjs";
import {
  destinationGuard,
  recoveryDataSql,
  snapshotQuery,
} from "./restore-sql.mjs";
async function fixture() {
  const s = await testSource();
  await s.asUser();
  await s.rpc("clinical_backup_seed_test");
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  return { s, snapshot };
}
test("recovery schema is deterministic and contains only application migrations, without Auth fixtures", async () => {
  const a = await recoverySchema(),
    b = await recoverySchema();
  assert.equal(a.manifest.length, 14);
  assert.equal(a.sha256, b.sha256);
  assert.ok(!a.sql.includes("create table auth.users"));
  assert.ok(!a.sql.includes("create role anon"));
  assert.ok(a.sql.includes("El destino ya contiene"));
});
test("restoration refuses the working project, absent destination markers and occupied destinations", async () => {
  const { s, snapshot } = await fixture();
  try {
    assert.throws(() => destinationGuard("jrrnvjrwrphmconrkayc"));
    await assert.rejects(() =>
      recoveryDataSql(snapshot, "jrrnvjrwrphmconrkayc"),
    );
    await s.db.exec("reset role");
    const restore = await recoveryDataSql(snapshot, "unit-target");
    await assert.rejects(() => s.db.exec(restore.sql));
    await s.db.exec("rollback");
    await s.db.exec(destinationGuard("unit-target"));
    await assert.rejects(() => s.db.exec(restore.sql));
    await s.db.exec("rollback");
    assert.equal(
      (
        await s.db.query(
          "select count(*)::int as n from clinical_private.patients",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await s.db.close();
  }
});
test("an empty marked target restores data atomically, verifies it and keeps access disabled", async () => {
  const { s, snapshot } = await fixture(),
    target = await testSource();
  try {
    await target.db.exec("delete from clinical_private.authorized_clinicians");
    await target.db.exec(destinationGuard("unit-target"));
    const restore = await recoveryDataSql(snapshot, "unit-target");
    await target.db.exec(restore.sql);
    const readback = (await target.db.query(snapshotQuery(snapshot))).rows[0]
      .snapshot;
    assert.equal(
      await snapshotDigest(readback),
      await snapshotDigest(snapshot),
    );
    assert.equal(
      (
        await target.db.query(
          "select enabled from clinical_private.authorized_clinicians",
        )
      ).rows[0].enabled,
      false,
    );
    await target.asUser();
    await assert.rejects(
      () => target.rpc("clinical_access_check"),
      (e) => e.code === "42501",
    );
    await target.db.exec("reset role");
    await assert.rejects(() => target.db.exec(restore.sql));
    await target.db.exec("rollback");
  } finally {
    await s.db.close();
    await target.db.close();
  }
});
test("SQL-looking payload text remains data and an incompatible old file is rejected before SQL generation", async () => {
  const fixtureData = await fixture(),
    s = fixtureData.s,
    target = await testSource();
  let snapshot = fixtureData.snapshot;
  try {
    const p = snapshot.patients.find((p) => !p.archived_at);
    await s.db.query(
      "select public.clinical_patient_save_fields_test($1,$2,$3::jsonb)",
      [
        p.id,
        p.revision,
        JSON.stringify({
          history: "Ficticio '\\'; drop schema clinical_private cascade; --",
        }),
      ],
    );
    snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
    await target.db.exec("delete from clinical_private.authorized_clinicians");
    await target.db.exec(destinationGuard("unit-target"));
    await target.db.exec((await recoveryDataSql(snapshot, "unit-target")).sql);
    assert.equal(
      (
        await target.db.query(
          "select count(*)::int as n from clinical_private.patients",
        )
      ).rows[0].n,
      2,
    );
    const old = { ...snapshot, version: 3 };
    delete old.exercise_versions;
    await assert.rejects(() => recoveryDataSql(old, "unit-target"));
  } finally {
    await s.db.close();
    await target.db.close();
  }
});
