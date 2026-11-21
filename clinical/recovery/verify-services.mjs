// Synthetic recovery with actual GoTrue, PostgREST and PostgreSQL; no hosted credentials.
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { startServices, images } from "./local-services.mjs";
import { recoverySchema } from "./schema.mjs";
import {
  destinationGuard,
  recoveryDataSql,
  snapshotQuery,
} from "./restore-sql.mjs";
import { encryptBackup, decryptBackup } from "../backups/crypto.mjs";
import { validateSnapshot, snapshotDigest } from "../backups/snapshot.mjs";
const started = Date.now(),
  owner = process.argv[2] ?? randomUUID();
if (!/^[0-9a-f-]{36}$/.test(owner))
  throw new Error("Invalid synthetic identity");
const directory = new URL("../../work/service-recovery/", import.meta.url);
await mkdir(directory, { recursive: true });
const client = (service, admin = false) =>
  createClient(service.url, admin ? service.serviceKey : service.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(time).digest(),
    offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function rpc(c, name, args) {
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(`RPC ${name}: ${error.code}`);
  return data;
}
async function enroll(c) {
  const { data, error } = await c.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Synthetic recovery",
  });
  if (error) throw new Error("Synthetic MFA enrollment failed");
  const response = await c.auth.mfa.challengeAndVerify({
    factorId: data.id,
    code: totp(data.totp.secret),
  });
  if (response.error) throw new Error("Synthetic MFA verification failed");
}
async function account(service) {
  const admin = client(service, true),
    password = randomBytes(32).toString("hex");
  const response = await admin.auth.admin.createUser({
    id: owner,
    email: "recovery@example.invalid",
    password,
    email_confirm: true,
  });
  if (response.error || response.data.user?.id !== owner)
    throw new Error("Synthetic Auth identity was not recreated");
  const c = client(service);
  const login = await c.auth.signInWithPassword({
    email: "recovery@example.invalid",
    password,
  });
  if (login.error) throw new Error("Synthetic password sign-in failed");
  return c;
}
let source,
  target,
  snapshot,
  sourceHash,
  phrase = randomBytes(48).toString("base64"),
  sourceToken;
const schema = await recoverySchema();
try {
  console.log(JSON.stringify({ phase: "starting-source-services" }));
  source = await startServices("source");
  source.psql(schema.sql);
  await source.reload();
  const c = await account(source);
  source.psql(
    `insert into clinical_private.authorized_clinicians values('${owner}',true)`,
  );
  const denied = await c.rpc("clinical_access_check");
  if (denied.error?.code !== "42501")
    throw new Error("AAL1 access was not denied");
  await enroll(c);
  await rpc(c, "clinical_backup_seed_test");
  const patient = await rpc(c, "clinical_patient_create_test", {
    p_alias: "Caso de recuperación ampliada",
    p_request_id: crypto.randomUUID(),
  });
  const duplicate = await rpc(c, "clinical_patient_create_test", {
    p_alias: "Caso de recuperación ampliada",
    p_request_id: patient.id,
  });
  if (!duplicate.already_present)
    throw new Error("Repeated create was not idempotent");
  await rpc(c, "clinical_patient_save_fields_test", {
    p_id: patient.id,
    p_expected_revision: 1,
    p_fields: {
      alias: "Caso de recuperación revisado",
      history: "Historia ficticia",
    },
  });
  const appt = await rpc(c, "clinical_appointment_save_test", {
    p_id: null,
    p_expected_revision: null,
    p_patient_id: patient.id,
    p_start_local: "2026-11-20T09:00",
    p_minutes: 45,
    p_status: "scheduled",
  });
  const exercise = await rpc(c, "clinical_exercise_create_test", {
    p_name: "Nombre ficticio original",
    p_category: "isometric",
    p_regions: ["knee"],
  });
  await rpc(c, "clinical_session_save_test", {
    p_id: null,
    p_expected_revision: null,
    p_appointment_id: appt.id,
    p_evolution: "Evolución ficticia de recuperación",
    p_passive: "Pasivo ficticio",
    p_exercise: exercise.name,
  });
  for (const [revision, name, archived] of [
    [1, "Nombre ficticio revisado", false],
    [2, "Nombre ficticio revisado", true],
  ])
    await rpc(c, "clinical_exercise_save_test", {
      p_id: exercise.id,
      p_expected_revision: revision,
      p_name: name,
      p_category: "isometric",
      p_regions: ["knee"],
      p_archived: archived,
    });
  snapshot = validateSnapshot(await rpc(c, "clinical_backup_export_test"));
  sourceHash = await snapshotDigest(snapshot);
  sourceToken = (await c.auth.getSession()).data.session.access_token;
  await writeFile(
    new URL("synthetic.mlrehab", directory),
    await encryptBackup(snapshot, phrase),
    { mode: 0o600 },
  );
  snapshot = null;
  await source.cleanup();
  source = null;
  console.log(JSON.stringify({ phase: "source-closed-starting-fresh-target" }));
  target = await startServices("target");
  target.psql(schema.sql);
  target.psql(destinationGuard("local-recovery-target"));
  await target.reload();
  const recovered = await account(target);
  await enroll(recovered);
  snapshot = validateSnapshot(
    await decryptBackup(
      await readFile(new URL("synthetic.mlrehab", directory), "utf8"),
      phrase,
    ),
  );
  phrase = null;
  const restore = await recoveryDataSql(snapshot, "local-recovery-target");
  target.psql(restore.sql);
  await writeFile(
    new URL("synthetic-hosted-restore.sql", directory),
    (await recoveryDataSql(snapshot, "wtlwhokxgskktjcqqtzn")).sql,
    { mode: 0o600 },
  );
  const readback = validateSnapshot(
      JSON.parse(target.psql(snapshotQuery(snapshot))),
    ),
    restoredHash = await snapshotDigest(readback);
  if (restoredHash !== sourceHash)
    throw new Error("Recovered data digest does not match");
  if ((await recovered.rpc("clinical_access_check")).error?.code !== "42501")
    throw new Error("Restored account was enabled too early");
  target.psql(
    `update clinical_private.authorized_clinicians set enabled=true where user_id='${owner}'`,
  );
  await rpc(recovered, "clinical_access_check");
  const restoredPatients = await rpc(recovered, "clinical_patient_list_test");
  if (
    restoredPatients.length !== 3 ||
    !restoredPatients.some(
      (p) =>
        p.id === patient.id &&
        p.name === "FICTICIO · Caso de recuperación revisado",
    )
  )
    throw new Error("New patient workflow did not survive restoration");
  const day = await rpc(recovered, "clinical_agenda_list_test", {
    p_day: "2026-11-20",
  });
  if (day.appointments.length !== 1)
    throw new Error("Recovered agenda read failed");
  const session = await rpc(recovered, "clinical_session_get_test", {
    p_appointment_id: appt.id,
  });
  if (session.exercise !== "Nombre ficticio original")
    throw new Error("Historical session text changed");
  const anon = client(target);
  if ((await anon.rpc("clinical_access_check")).error?.code !== "42501")
    throw new Error("Anonymous access not denied");
  const foreign = await fetch(
    target.url + "/rest/v1/rpc/clinical_access_check",
    {
      method: "POST",
      headers: {
        apikey: target.anonKey,
        Authorization: "Bearer " + sourceToken,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  sourceToken = null;
  if (foreign.status !== 401) throw new Error("Old-project JWT accepted");
  const token = (await recovered.auth.getSession()).data.session.access_token;
  await recovered.auth.signOut({ scope: "local" });
  const revoked = await fetch(
    target.url + "/rest/v1/rpc/clinical_access_check",
    {
      method: "POST",
      headers: {
        apikey: target.anonKey,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  const rejection = await revoked.json();
  if (![401, 403].includes(revoked.status) || rejection.code !== "42501")
    throw new Error("Revoked session accepted");
  const security = JSON.parse(
    target.psql(
      `select json_build_object('rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clinical_private' and c.relkind='r' and c.relrowsecurity),'client_table_grants',(select count(*) from information_schema.role_table_grants where table_schema='clinical_private' and grantee in ('anon','authenticated','PUBLIC'))) `,
    ),
  );
  if (security.rls_tables !== 10 || security.client_table_grants !== 0)
    throw new Error("Restored security boundary differs");
  const report = {
    tested_at: new Date().toISOString(),
    test_only: true,
    passed: true,
    services: images,
    migration_manifest: schema.manifest,
    schema_sha256: schema.sha256,
    source_closed_before_restore: true,
    source_hash: sourceHash,
    restored_hash: restoredHash,
    counts: restore.counts,
    security,
    snapshot_version: 5,
    patient_creation_idempotent: true,
    real_auth_and_rest: true,
    auth_created_via_admin_api: true,
    password_and_mfa_recreated: true,
    no_managed_auth_sql_writes: true,
    aal1_denied: true,
    admission_disabled_until_verified: true,
    old_project_jwt_denied: true,
    revoked_session_denied: true,
    elapsed_seconds: Math.round((Date.now() - started) / 1000),
    limits: [
      "Local core services, not hosted Supabase disaster recovery",
      "Synthetic account only; human identity verification and lost-provider-account recovery are not tested",
      "No SMTP, Storage, hosting, offsite custody, automatic backups or RPO/RTO guarantee",
    ],
  };
  await writeFile(
    new URL("../verification/SERVICE_RECOVERY_REPORT.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      source_closed_before_restore: true,
      data_collections: Object.keys(restore.counts).length,
      real_auth_and_rest: true,
      elapsed_seconds: report.elapsed_seconds,
    }),
  );
} finally {
  phrase = null;
  sourceToken = null;
  if (source) await source.cleanup();
  if (target) await target.cleanup();
}
