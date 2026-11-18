import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
const create = async (s, name = "Nombre propio ficticio") =>
  (
    await s.db.query(
      "select public.clinical_exercise_create_test($1,'isometric',array['knee']) as r",
      [name],
    )
  ).rows[0].r;
const save = async (
  s,
  e,
  name = e.name,
  archived = false,
  revision = e.revision,
) =>
  (
    await s.db.query(
      "select public.clinical_exercise_save_test($1,$2,$3,'isometric',array['knee'],$4) as r",
      [e.id, revision, name, archived],
    )
  ).rows[0].r;
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
test("exercise edits require a live admitted AAL2 session, owner and current revision", async () => {
  const s = await testSource();
  try {
    await s.asUser();
    const e = await create(s);
    for (const [actor, aal, sid, role] of [
      ["", "aal2", SA, "anon"],
      [A, "aal1", SA, "authenticated"],
      [A, "aal2", B, "authenticated"],
    ]) {
      await s.asUser(actor, aal, sid, role);
      await denied("42501", () => save(s, e));
    }
    await s.asUser(B);
    await denied("42501", () => save(s, e));
    await s.asUser();
    await denied("40001", () => save(s, e, e.name, false, 0));
    await create(s, "Otro nombre ficticio");
    await denied("23505", () => save(s, e, "Otro nombre ficticio"));
    await denied("42501", () =>
      s.db.exec("select * from clinical_private.exercise_versions"),
    );
  } finally {
    await s.db.close();
  }
});
test("editing and archiving preserve historical session text and restore all exercise revisions", async () => {
  const s = await testSource();
  try {
    await s.asUser();
    await s.rpc("clinical_backup_seed_test");
    let e = await create(s);
    const original = e.name,
      p = (await s.rpc("clinical_patient_list_test")).find((p) => !p.archived);
    const appt = (
      await s.db.query(
        "select public.clinical_appointment_save_test(null,null,$1,'2026-11-20T09:00',45,'scheduled') as r",
        [p.id],
      )
    ).rows[0].r;
    await s.db.query(
      "select public.clinical_session_save_test(null,null,$1,'Evolución ficticia','', $2)",
      [appt.id, original],
    );
    e = await save(s, e, "Nombre propio ficticio revisado");
    e = await save(s, e, e.name, true);
    assert.equal(e.revision, 3);
    assert.ok(e.archived_at);
    await denied("40001", () => save(s, e));
    assert.equal(
      (
        await s.db.query("select public.clinical_session_get_test($1) as r", [
          appt.id,
        ])
      ).rows[0].r.exercise,
      original,
    );
    const snapshot = validateSnapshot(
      await s.rpc("clinical_backup_export_test"),
    );
    assert.equal(snapshot.version, 4);
    assert.equal(snapshot.exercise_versions.length, 3);
    const restored = await restoreEncryptedToSandbox(
      await encryptBackup(snapshot, "Frase ficticia de copia de ejercicios"),
      "Frase ficticia de copia de ejercicios",
    );
    try {
      assert.equal(restored.exerciseVersionsCount, 3);
      assert.equal(restored.sourceHash, restored.restoredHash);
    } finally {
      await restored.db.close();
    }
    for (const mutate of [
      (v) => v.exercise_versions.pop(),
      (v) => (v.custom_exercises[0].revision = 1),
      (v) =>
        (v.audit_events = v.audit_events.filter(
          (e) => e.action !== "exercise.archive",
        )),
    ]) {
      const bad = structuredClone(snapshot);
      mutate(bad);
      assert.throws(() => validateSnapshot(bad));
    }
  } finally {
    await s.db.close();
  }
});
test("failed audit rolls back exercise edits and their history", async () => {
  const s = await testSource();
  try {
    await s.asUser();
    const e = await create(s);
    await s.db.exec(
      "reset role;alter table clinical_private.audit_events add constraint block_update check(action<>'exercise.update') not valid",
    );
    await s.asUser();
    await denied("23514", () => save(s, e, "Cambio que debe revertirse"));
    assert.equal((await s.rpc("clinical_exercise_list_test"))[0].revision, 1);
    await s.db.exec("reset role");
    assert.equal(
      (
        await s.db.query(
          "select count(*)::int as n from clinical_private.exercise_versions",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await s.db.close();
  }
});
test("upgrade preserves existing v3 exercises and seeds their initial history; old encrypted files still restore", async () => {
  const s = await testSource({ migrationLimit: 8 });
  try {
    await s.asUser();
    await s.rpc("clinical_backup_seed_test");
    const e = await create(s),
      old = validateSnapshot(await s.rpc("clinical_backup_export_test"));
    assert.equal(old.version, 3);
    const restored = await restoreEncryptedToSandbox(
      await encryptBackup(old, "Frase ficticia para compatibilidad v3"),
      "Frase ficticia para compatibilidad v3",
    );
    await restored.db.close();
    await s.db.exec("reset role");
    await s.db.exec(
      await readFile(
        new URL(
          "../migrations/20261118212542_clinical_exercise_revisions_test.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await s.asUser();
    const row = (await s.rpc("clinical_exercise_list_test"))[0];
    assert.equal(row.name, e.name);
    assert.equal(row.created_at, e.created_at);
    assert.equal(row.updated_at, e.created_at);
    assert.equal(row.revision, 1);
    assert.equal(row.archived_at, null);
    const snapshot = validateSnapshot(
      await s.rpc("clinical_backup_export_test"),
    );
    assert.equal(snapshot.exercise_versions.length, 1);
  } finally {
    await s.db.close();
  }
});
