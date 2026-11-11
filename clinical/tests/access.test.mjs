import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  C = "33333333-3333-4333-8333-333333333333";
let patient;
before(async () => {
  db = new PGlite();
  // Test-only stand-ins for Supabase's verified request identity, never deployment code.
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
 insert into auth.users values('${A}'),('${B}'),('${C}');`);
  await db.exec(
    await readFile(
      new URL("../migrations/001_private_patients.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../migrations/002_private_rpc_boundary.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "insert into clinical_private.authorized_clinicians(user_id,enabled) values($1,true),($2,true)",
    [A, B],
  );
});
after(async () => {
  await db?.close();
});
async function asUser(user = A, aal = "aal2", role = "authenticated") {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false)",
    [user, aal],
  );
  await db.exec(`set role ${role}`);
}
async function rpc(sql, args = []) {
  return (await db.query(sql, args)).rows[0]?.result;
}
async function rejects(code, sql, args = []) {
  await assert.rejects(db.query(sql, args), (error) => error.code === code);
}

test("anonymous, unadmitted and single-factor accounts cannot use the API", async () => {
  for (const [user, aal, role] of [
    ["", "aal2", "anon"],
    [C, "aal2", "authenticated"],
    [A, "aal1", "authenticated"],
    [A, "", "authenticated"],
  ]) {
    await asUser(user, aal, role);
    await rejects("42501", "select public.clinical_patient_list() as result");
    await rejects("42501", "select public.clinical_patient_create($1::jsonb)", [
      JSON.stringify({ name: "Ficticio" }),
    ]);
    await rejects("42501", "select public.clinical_patient_get($1)", [A]);
    await rejects(
      "42501",
      "select public.clinical_patient_save($1,1,$2::jsonb)",
      [A, JSON.stringify({ name: "Ficticio" })],
    );
    await rejects("42501", "select public.clinical_patient_archive($1,1)", [A]);
  }
});
test("an admitted MFA account creates and reads only its own records", async () => {
  await asUser();
  patient = await rpc(
    "select public.clinical_patient_create($1::jsonb) as result",
    [
      JSON.stringify({
        name: "Paciente ficticio A",
        history: "Texto clínico ficticio",
      }),
    ],
  );
  assert.equal(patient.revision, 1);
  const found = await rpc("select public.clinical_patient_get($1) as result", [
    patient.id,
  ]);
  assert.equal(found.payload.name, "Paciente ficticio A");
  await asUser(B);
  assert.deepEqual(
    await rpc("select public.clinical_patient_list() as result"),
    [],
  );
  await rejects("42501", "select public.clinical_patient_get($1)", [
    patient.id,
  ]);
  await rejects(
    "40001",
    "select public.clinical_patient_save($1,1,$2::jsonb)",
    [patient.id, JSON.stringify({ name: "Intento ajeno" })],
  );
  await rejects("40001", "select public.clinical_patient_archive($1,1)", [
    patient.id,
  ]);
});
test("direct table access, self-enrollment, history and audit tampering are denied", async () => {
  await asUser();
  for (const sql of [
    "select * from clinical_private.patients",
    "select * from clinical_private.patient_versions",
    "delete from clinical_private.audit_events",
    `insert into clinical_private.authorized_clinicians values('${C}',true)`,
    "select clinical_private.require_clinician()",
  ])
    await rejects("42501", sql);
  await db.exec("reset role");
  // Deliberately simulate an accidental grant: default-deny RLS must still protect rows.
  await db.exec(
    "grant select on clinical_private.patients to authenticated;create policy accidental_permissive on clinical_private.patients for select to authenticated using(true);",
  );
  await asUser();
  assert.deepEqual(
    (await db.query("select * from clinical_private.patients")).rows,
    [],
  );
  await db.exec(
    "reset role;revoke select on clinical_private.patients from authenticated;drop policy accidental_permissive on clinical_private.patients;",
  );
});
test("stale edits are rejected by the database without overwriting a newer revision", async () => {
  await asUser();
  const updated = await rpc(
    "select public.clinical_patient_save($1,1,$2::jsonb) as result",
    [patient.id, JSON.stringify({ name: "Paciente ficticio A actualizado" })],
  );
  assert.equal(updated.revision, 2);
  await rejects(
    "40001",
    "select public.clinical_patient_save($1,1,$2::jsonb)",
    [patient.id, JSON.stringify({ name: "Versión antigua" })],
  );
  assert.equal(
    (
      await rpc("select public.clinical_patient_get($1) as result", [
        patient.id,
      ])
    ).payload.name,
    "Paciente ficticio A actualizado",
  );
  await db.exec("reset role");
  const versions = (
    await db.query(
      "select revision from clinical_private.patient_versions where patient_id=$1 order by revision",
      [patient.id],
    )
  ).rows;
  assert.deepEqual(versions, [{ revision: 1 }, { revision: 2 }]);
});
test("archiving preserves versions and removes the record from active listings", async () => {
  await asUser();
  const archived = await rpc(
    "select public.clinical_patient_archive($1,2) as result",
    [patient.id],
  );
  assert.equal(archived.revision, 3);
  assert.deepEqual(
    await rpc("select public.clinical_patient_list() as result"),
    [],
  );
  await rejects(
    "40001",
    "select public.clinical_patient_save($1,3,$2::jsonb)",
    [patient.id, JSON.stringify({ name: "No reabrir" })],
  );
  const found = await rpc("select public.clinical_patient_get($1) as result", [
    patient.id,
  ]);
  assert.ok(found.archived_at);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from clinical_private.patient_versions where patient_id=$1",
        [patient.id],
      )
    ).rows[0].n,
    3,
  );
  const columns = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='clinical_private' and table_name='audit_events'",
    )
  ).rows.map((r) => r.column_name);
  assert.ok(!columns.includes("payload"));
  const events = (
    await db.query(
      "select action from clinical_private.audit_events where patient_id=$1",
      [patient.id],
    )
  ).rows.map((r) => r.action);
  assert.ok(events.includes("patient.create"));
  assert.ok(events.includes("patient.read"));
  assert.ok(events.includes("patient.update"));
  assert.ok(events.includes("patient.archive"));
});
test("revoking an account blocks even an existing MFA session; input and paging are bounded", async () => {
  await asUser();
  for (const payload of [null, [], { name: "" }, { name: "x".repeat(151) }])
    await rejects("22023", "select public.clinical_patient_create($1::jsonb)", [
      JSON.stringify(payload),
    ]);
  await rejects("22023", "select public.clinical_patient_list(null,1000)");
  await db.exec("reset role");
  await db.query(
    "update clinical_private.authorized_clinicians set enabled=false where user_id=$1",
    [A],
  );
  await asUser();
  await rejects("42501", "select public.clinical_patient_list()");
});

test("audit failure rolls back the record and revision snapshot instead of allowing an unaudited write", async () => {
  await db.exec("reset role");
  await db.query(
    "update clinical_private.authorized_clinicians set enabled=true where user_id=$1",
    [A],
  );
  const count = async () =>
    Number(
      (await db.query("select count(*) as n from clinical_private.patients"))
        .rows[0].n,
    );
  const before = await count();
  await db.exec(
    "alter table clinical_private.audit_events add constraint reject_new_audit check(false) not valid",
  );
  await asUser();
  await rejects("23514", "select public.clinical_patient_create($1::jsonb)", [
    JSON.stringify({ name: "No debe persistir" }),
  ]);
  await db.exec("reset role");
  assert.equal(await count(), before);
  await db.exec(
    "alter table clinical_private.audit_events drop constraint reject_new_audit",
  );
});

test("public wrappers are invoker-only and privileged implementations stay in the private schema", async () => {
  await db.exec("reset role");
  const result = await db.query(
    "select n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'clinical_patient_%'",
  );
  assert.equal(result.rows.filter((row) => row.nspname === "public").length, 5);
  assert.equal(
    result.rows.filter((row) => row.nspname === "clinical_private").length,
    5,
  );
  for (const row of result.rows)
    assert.equal(row.prosecdef, row.nspname === "clinical_private");
});
