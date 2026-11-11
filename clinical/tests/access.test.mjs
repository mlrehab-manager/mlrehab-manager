import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  C = "33333333-3333-4333-8333-333333333333";
const SA = "44444444-4444-4444-8444-444444444444";
const SB = "55555555-5555-4555-8555-555555555555";
let patient;
before(async () => {
  db = new PGlite();
  // Test-only stand-ins for Supabase's verified request identity, never deployment code.
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key, email_confirmed_at timestamptz default now(), banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),aal text,created_at timestamptz,not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true)) $$;
 insert into auth.users(id) values('${A}'),('${B}'),('${C}');
 insert into auth.sessions values('${SA}','${A}','aal2',now(),null),('${SB}','${B}','aal2',now(),null);`);
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query(
    "insert into clinical_private.authorized_clinicians(user_id,enabled) values($1,true),($2,true)",
    [A, B],
  );
});
after(async () => {
  await db?.close();
});
async function asUser(
  user = A,
  aal = "aal2",
  role = "authenticated",
  session = user === B ? SB : SA,
) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claim.session_id',$3,false)",
    [user, aal, session],
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

async function deniedEverywhere() {
  for (const sql of [
    "select public.clinical_access_check()",
    "select public.clinical_patient_list()",
    'select public.clinical_patient_create(\'{"name":"No debe crearse"}\'::jsonb)',
    `select public.clinical_patient_get('${A}')`,
    `select public.clinical_patient_save('${A}',1,'{\"name\":\"No debe guardarse\"}'::jsonb)`,
    `select public.clinical_patient_archive('${A}',1)`,
  ])
    await rejects("42501", sql);
}

test("missing, malformed, nonexistent and foreign session claims cannot use any endpoint", async () => {
  for (const session of ["", "not-a-uuid", C, SB]) {
    await asUser(A, "aal2", "authenticated", session);
    await deniedEverywhere();
  }
});

test("revocation, provider expiry, eight-hour limit and downgraded MFA block a previously admitted session", async () => {
  for (const mutation of [
    `delete from auth.sessions where id='${SA}'`,
    `update auth.sessions set not_after=now()-interval '1 second' where id='${SA}'`,
    `update auth.sessions set created_at=now()-interval '8 hours 1 second' where id='${SA}'`,
    `update auth.sessions set aal='aal1' where id='${SA}'`,
  ]) {
    await db.exec("reset role");
    await db.exec(mutation);
    await asUser();
    await deniedEverywhere();
    await db.exec("reset role");
    await db.query(
      "insert into auth.sessions(id,user_id,aal,created_at,not_after) values($1,$2,'aal2',now(),null) on conflict(id) do update set aal='aal2',created_at=now(),not_after=null",
      [SA, A],
    );
  }
});

test("provider banning and removal of confirmed-email status also reject an existing JWT", async () => {
  for (const mutation of [
    `update auth.users set banned_until=now()+interval '1 hour' where id='${A}'`,
    `update auth.users set email_confirmed_at=null where id='${A}'`,
  ]) {
    await db.exec("reset role");
    await db.exec(mutation);
    await asUser();
    await deniedEverywhere();
    await db.exec("reset role");
    await db.query(
      "update auth.users set banned_until=null,email_confirmed_at=now() where id=$1",
      [A],
    );
  }
});

test("access check returns only a boolean without clinical reads, writes or elevated public code", async () => {
  await db.exec("reset role");
  const counts = () =>
    db.query(
      "select (select count(*) from clinical_private.patients) as patients, (select count(*) from clinical_private.audit_events) as events",
    );
  const before = (await counts()).rows;
  await asUser();
  assert.deepEqual(
    await rpc("select public.clinical_access_check() as result"),
    { authorized: true },
  );
  for (const table of ["auth.sessions", "auth.users"])
    await rejects("42501", `select * from ${table}`);
  await db.exec("reset role");
  assert.deepEqual((await counts()).rows, before);
  assert.equal(
    (
      await db.query(
        "select prosecdef from pg_proc where oid='public.clinical_access_check()'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','public.clinical_access_check()','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await asUser("", "aal2", "anon");
  await rejects("42501", "select public.clinical_access_check()");
});
