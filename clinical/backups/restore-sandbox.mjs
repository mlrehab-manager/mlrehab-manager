// Node-only: always creates a NEW in-memory PostgreSQL database. No URL/target parameter.
import { PGlite } from "@electric-sql/pglite";
import { decryptBackup } from "./crypto.mjs";
import { validateSnapshot, snapshotDigest } from "./snapshot.mjs";

export async function restoreEncryptedToSandbox(encrypted, password) {
  const source = validateSnapshot(await decryptBackup(encrypted, password));
  const db = new PGlite();
  try {
    await db.exec(`begin;
      create table patients(id uuid primary key,clinician_id uuid not null,payload jsonb not null,revision integer not null check(revision>0),created_at timestamptz not null,updated_at timestamptz not null,archived_at timestamptz);
      create table patient_versions(patient_id uuid references patients(id),revision integer check(revision>0),payload jsonb not null,archived boolean not null,created_at timestamptz not null,primary key(patient_id,revision));
      create table audit_events(id bigint generated always as identity primary key,actor_id uuid not null,patient_id uuid references patients(id),action text not null,revision integer,created_at timestamptz not null);`);
    for (const p of source.patients)
      await db.query(
        "insert into patients values($1,$2,$3::jsonb,$4,$5,$6,$7)",
        [
          p.id,
          p.clinician_id,
          p.payload_json,
          p.revision,
          p.created_at,
          p.updated_at,
          p.archived_at,
        ],
      );
    for (const v of source.patient_versions)
      await db.query(
        "insert into patient_versions values($1,$2,$3::jsonb,$4,$5)",
        [v.patient_id, v.revision, v.payload_json, v.archived, v.created_at],
      );
    for (const e of source.audit_events)
      await db.query(
        "insert into audit_events overriding system value values($1,$2,$3,$4,$5,$6)",
        [e.id, e.actor_id, e.patient_id, e.action, e.revision, e.created_at],
      );
    await db.query(
      "select setval(pg_get_serial_sequence('audit_events','id'),$1::bigint,true)",
      [
        source.audit_events.reduce(
          (max, e) => (BigInt(e.id) > BigInt(max) ? e.id : max),
          "1",
        ),
      ],
    );
    const restored = {
      ...source,
      patients: (
        await db.query(
          `select jsonb_build_object('id',id,'clinician_id',clinician_id,'payload_json',payload::text,'revision',revision,'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'updated_at',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'archived_at',to_char(archived_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) as record from patients order by id`,
        )
      ).rows.map((r) => r.record),
      patient_versions: (
        await db.query(
          `select jsonb_build_object('patient_id',patient_id,'revision',revision,'payload_json',payload::text,'archived',archived,'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) as record from patient_versions order by patient_id,revision`,
        )
      ).rows.map((r) => r.record),
      audit_events: (
        await db.query(
          `select jsonb_build_object('id',id::text,'actor_id',actor_id,'patient_id',patient_id,'action',action,'revision',revision,'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) as record from audit_events order by id`,
        )
      ).rows.map((r) => r.record),
    };
    const sourceHash = await snapshotDigest(source),
      restoredHash = await snapshotDigest(restored);
    if (sourceHash !== restoredHash)
      throw new Error("Los datos restaurados no coinciden con la copia");
    await db.exec("commit");
    return {
      db,
      sourceHash,
      restoredHash,
      counts: {
        patients: source.patients.length,
        versions: source.patient_versions.length,
        events: source.audit_events.length,
      },
    };
  } catch (error) {
    await db.exec("rollback").catch(() => {});
    await db.close();
    throw new Error("No se ha podido restaurar la copia en el entorno aislado");
  }
}
