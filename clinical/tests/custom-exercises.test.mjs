import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testSource, A, B, SA } from "../backups/test-source.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
import { encryptBackup } from "../backups/crypto.mjs";
import { restoreEncryptedToSandbox } from "../backups/restore-sandbox.mjs";
let s, exercise;
const create = (
  name = "Ejercicio propio ficticio",
  category = "isometric",
  regions = ["knee", "hip"],
) =>
  s.db
    .query("select public.clinical_exercise_create_test($1,$2,$3) as result", [
      name,
      category,
      regions,
    ])
    .then((r) => r.rows[0].result);
const denied = (code, fn) => assert.rejects(fn, (e) => e.code === code);
before(async () => {
  s = await testSource();
  await s.asUser();
  await s.rpc("clinical_backup_seed_test");
});
after(async () => s?.db.close());
test("personal catalogue requires admitted live AAL2 and is isolated between owners", async () => {
  for (const [actor, aal, sid, role] of [
    ["", "aal2", SA, "anon"],
    [A, "aal1", SA, "authenticated"],
    [A, "aal2", B, "authenticated"],
  ]) {
    await s.asUser(actor, aal, sid, role);
    await denied("42501", () => create());
    await denied("42501", () => s.rpc("clinical_exercise_list_test"));
  }
  await s.asUser();
  exercise = await create();
  assert.equal(exercise.name, "Ejercicio propio ficticio");
  assert.deepEqual(exercise.regions, ["hip", "knee"]);
  await s.asUser(B);
  assert.deepEqual(await s.rpc("clinical_exercise_list_test"), []);
  await create();
  await s.asUser();
  assert.equal((await s.rpc("clinical_exercise_list_test")).length, 1);
});
test("names normalize accents/case/spaces and invalid names, categories or regions cannot be stored", async () => {
  await create("Flexión   propia ficticia");
  await denied("23505", () => create("FLEXION propia ficticia"));
  for (const [name, category, regions] of [
    ["", "other", []],
    ["\u00a0\u2003", "other", []],
    ["Control\u0085ficticio", "other", []],
    ["Ficticio", "other", [["hip"]]],
    ["x".repeat(121), "other", []],
    ["Nombre\ncon salto", "other", []],
    ["Ficticio", "invalido", []],
    ["Ficticio", "other", ["unknown"]],
    ["Ficticio", "other", [null]],
    ["Ficticio", "other", null],
  ])
    await denied("22023", () => create(name, category, regions));
  const multi = await create(
    "Ejercicio ficticio con zonas repetidas",
    "dynamic",
    ["hip", "knee", "hip"],
  );
  assert.deepEqual(multi.regions, ["hip", "knee"]);
  const empty = await create("Ejercicio ficticio sin zona", "other", []);
  assert.deepEqual(empty.regions, []);
});
test("clients cannot read/write catalogue tables or execute internal helpers, even with an accidental read grant", async () => {
  await denied("42501", () =>
    s.db.exec("select * from clinical_private.custom_exercises"),
  );
  await denied("42501", () =>
    s.db.exec("select clinical_private.exercise_name_key('x')"),
  );
  await s.db.exec(
    "reset role;grant select on clinical_private.custom_exercises to authenticated;create policy accidental on clinical_private.custom_exercises for select to authenticated using(true)",
  );
  await s.asUser();
  assert.deepEqual(
    (await s.db.query("select * from clinical_private.custom_exercises")).rows,
    [],
  );
  await s.db.exec(
    "reset role;revoke select on clinical_private.custom_exercises from authenticated;drop policy accidental on clinical_private.custom_exercises",
  );
  await s.asUser();
  await denied("42501", () =>
    s.db.exec("update clinical_private.custom_exercises set name='no'"),
  );
  await denied("42501", () =>
    s.db.exec("delete from clinical_private.custom_exercises"),
  );
});
test("audit failure rolls back the exercise and the catalogue cap refuses without truncation", async () => {
  await s.db.exec(
    "reset role;alter table clinical_private.audit_events add constraint block_catalog_audit check(action<>'exercise.create') not valid",
  );
  await s.asUser();
  await denied("23514", () => create("Debe revertirse"));
  await s.db.exec(
    "reset role;alter table clinical_private.audit_events drop constraint block_catalog_audit",
  );
  await s.asUser();
  assert.ok(
    !(await s.rpc("clinical_exercise_list_test")).some(
      (e) => e.name === "Debe revertirse",
    ),
  );
  await s.db.exec(
    `reset role;begin;insert into clinical_private.custom_exercises(clinician_id,name,category,regions) select '${A}','Límite ficticio '||i,'other',array[]::text[] from generate_series(1,500) i`,
  );
  try {
    await s.asUser();
    await denied("54000", () => create("Exceso ficticio"));
  } finally {
    await s.db.exec("rollback");
    await s.asUser();
  }
});
test("version-3 encrypted restoration includes the personal catalogue and validates names, ownership and audit links", async () => {
  const snapshot = validateSnapshot(await s.rpc("clinical_backup_export_test"));
  assert.equal(snapshot.version, 4);
  assert.equal(snapshot.custom_exercises.length, 4);
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(snapshot, "Frase ficticia para restauracion segura"),
    "Frase ficticia para restauracion segura",
  );
  try {
    assert.equal(restored.exerciseCount, 4);
    assert.equal(restored.sourceHash, restored.restoredHash);
    assert.equal(
      (
        await restored.db.query(
          "select name from custom_exercises where id=$1",
          [exercise.id],
        )
      ).rows[0].name,
      exercise.name,
    );
  } finally {
    await restored.db.close();
  }
  for (const mutate of [
    (v) => (v.custom_exercises[0].clinician_id = B),
    (v) => (v.custom_exercises[0].regions = ["unknown"]),
    (v) => (v.custom_exercises[0].name = ""),
    (v) => v.custom_exercises.push({ ...v.custom_exercises[0], id: B }),
    (v) =>
      (v.audit_events = v.audit_events.filter(
        (e) => e.action !== "exercise.create",
      )),
  ]) {
    const bad = structuredClone(snapshot);
    mutate(bad);
    assert.throws(() => validateSnapshot(bad));
  }
});
test("legacy version-2 files remain restorable without an invented personal catalogue", async () => {
  const old = JSON.parse(
    await readFile(
      new URL("../access-tests/backup-agenda-fixture.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(validateSnapshot(old).version, 2);
  const restored = await restoreEncryptedToSandbox(
    await encryptBackup(old, "Frase ficticia de compatibilidad antigua"),
    "Frase ficticia de compatibilidad antigua",
  );
  try {
    assert.equal(restored.exerciseCount, null);
    assert.equal(restored.sourceHash, restored.restoredHash);
  } finally {
    await restored.db.close();
  }
});
