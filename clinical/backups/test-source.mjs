// Synthetic identities for local tests only; never copied into hosted Auth tables.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
export const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
export const SA = "44444444-4444-4444-8444-444444444444",
  SB = "55555555-5555-4555-8555-555555555555";
export async function testSource({ migrationLimit = Infinity } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,aal text,created_at timestamptz,not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true))$$;
    insert into auth.users(id) values('${A}'),('${B}');
    insert into auth.sessions values('${SA}','${A}','aal2',now(),null),('${SB}','${B}','aal2',now(),null);`);
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .slice(0, migrationLimit))
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  await db.exec(
    `insert into clinical_private.authorized_clinicians values('${A}',true),('${B}',true)`,
  );
  async function asUser(
    user = A,
    aal = "aal2",
    session = user === B ? SB : SA,
    role = "authenticated",
  ) {
    await db.exec("reset role");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claim.session_id',$3,false)",
      [user, aal, session],
    );
    await db.exec(`set role ${role}`);
  }
  const rpc = async (name) =>
    (await db.query(`select public.${name}() as result`)).rows[0].result;
  return { db, asUser, rpc };
}
