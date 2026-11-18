// Node-only: always creates a NEW in-memory PostgreSQL database. No URL/target parameter.
import { PGlite } from "@electric-sql/pglite";
import { decryptBackup } from "./crypto.mjs";
import { validateSnapshot, snapshotDigest } from "./snapshot.mjs";
export async function restoreEncryptedToSandbox(encrypted, password) {
  const source = validateSnapshot(await decryptBackup(encrypted, password)),
    db = new PGlite();
  try {
    await db.exec(`begin;
      create table patients(id uuid primary key,clinician_id uuid not null,payload jsonb not null,revision integer not null check(revision>0),created_at timestamptz not null,updated_at timestamptz not null,archived_at timestamptz);
      create table patient_versions(patient_id uuid references patients(id),revision integer check(revision>0),payload jsonb not null,archived boolean not null,created_at timestamptz not null,primary key(patient_id,revision));
      create table audit_events(id bigint generated always as identity primary key,actor_id uuid not null,patient_id uuid references patients(id),action text not null,revision integer,created_at timestamptz not null,entity_type text,entity_id uuid);`);
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
    if (source.version >= 2) {
      await db.exec(`create table appointments(id uuid primary key,clinician_id uuid not null,patient_id uuid not null references patients(id),starts_at timestamptz not null,ends_at timestamptz not null,status text not null check(status in ('scheduled','cancelled','completed')),revision integer not null check(revision>0),created_at timestamptz not null,updated_at timestamptz not null,check(ends_at>starts_at));
        create table appointment_versions(appointment_id uuid references appointments(id),revision integer check(revision>0),payload jsonb not null,created_at timestamptz not null,primary key(appointment_id,revision));
        create table clinical_sessions(id uuid primary key,clinician_id uuid not null,patient_id uuid not null references patients(id),appointment_id uuid not null unique references appointments(id),evolution text not null,passive text not null,exercise text not null,revision integer not null check(revision>0),created_at timestamptz not null,updated_at timestamptz not null);
        create table session_versions(session_id uuid references clinical_sessions(id),revision integer check(revision>0),payload jsonb not null,created_at timestamptz not null,primary key(session_id,revision));`);
      for (const a of source.appointments)
        await db.query(
          "insert into appointments values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            a.id,
            a.clinician_id,
            a.patient_id,
            a.starts_at,
            a.ends_at,
            a.status,
            a.revision,
            a.created_at,
            a.updated_at,
          ],
        );
      for (const v of source.appointment_versions)
        await db.query(
          "insert into appointment_versions values($1,$2,$3::jsonb,$4)",
          [v.appointment_id, v.revision, v.payload_json, v.created_at],
        );
      for (const s of source.sessions)
        await db.query(
          "insert into clinical_sessions values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            s.id,
            s.clinician_id,
            s.patient_id,
            s.appointment_id,
            s.evolution,
            s.passive,
            s.exercise,
            s.revision,
            s.created_at,
            s.updated_at,
          ],
        );
      for (const v of source.session_versions)
        await db.query(
          "insert into session_versions values($1,$2,$3::jsonb,$4)",
          [v.session_id, v.revision, v.payload_json, v.created_at],
        );
    }
    if (source.version >= 3) {
      await db.exec(
        "create table custom_exercises(id uuid primary key,clinician_id uuid not null,name text not null,category text not null,regions text[] not null,created_at timestamptz not null)",
      );
      for (const e of source.custom_exercises)
        await db.query(
          "insert into custom_exercises values($1,$2,$3,$4,$5,$6)",
          [e.id, e.clinician_id, e.name, e.category, e.regions, e.created_at],
        );
    }
    if (source.version === 4) {
      await db.exec(
        "alter table custom_exercises add column revision integer,add column updated_at timestamptz,add column archived_at timestamptz;create table exercise_versions(exercise_id uuid references custom_exercises(id),revision integer,payload jsonb,created_at timestamptz,primary key(exercise_id,revision))",
      );
      for (const e of source.custom_exercises)
        await db.query(
          "update custom_exercises set revision=$2,updated_at=$3,archived_at=$4 where id=$1",
          [e.id, e.revision, e.updated_at, e.archived_at],
        );
      for (const v of source.exercise_versions)
        await db.query(
          "insert into exercise_versions values($1,$2,$3::jsonb,$4)",
          [v.exercise_id, v.revision, v.payload_json, v.created_at],
        );
    }
    for (const e of source.audit_events)
      await db.query(
        "insert into audit_events(id,actor_id,patient_id,action,revision,created_at,entity_type,entity_id) overriding system value values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          e.id,
          e.actor_id,
          e.patient_id,
          e.action,
          e.revision,
          e.created_at,
          e.entity_type ?? null,
          e.entity_id ?? null,
        ],
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
    // Identifiers below are code constants; every imported value above is a SQL parameter.
    async function rows(table, fields, times, order, casts = {}) {
      const projection = fields
        .map(
          (field) =>
            `'${field}',${times.includes(field) ? `to_char(${field} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` : (casts[field] ?? field)}`,
        )
        .join(",");
      return (
        await db.query(
          `select jsonb_build_object(${projection}) as record from ${table} order by ${order}`,
        )
      ).rows.map((r) => r.record);
    }
    const restored = {
      format: source.format,
      version: source.version,
      test_only: source.test_only,
      clinician_id: source.clinician_id,
      created_at: source.created_at,
      patients: await rows(
        "patients",
        [
          "id",
          "clinician_id",
          "payload_json",
          "revision",
          "created_at",
          "updated_at",
          "archived_at",
        ],
        ["created_at", "updated_at", "archived_at"],
        "id",
        { payload_json: "payload::text" },
      ),
      patient_versions: await rows(
        "patient_versions",
        ["patient_id", "revision", "payload_json", "archived", "created_at"],
        ["created_at"],
        "patient_id,revision",
        { payload_json: "payload::text" },
      ),
      audit_events: await rows(
        "audit_events",
        [
          "id",
          "actor_id",
          "patient_id",
          "action",
          "revision",
          "created_at",
          ...(source.version >= 2 ? ["entity_type", "entity_id"] : []),
        ],
        ["created_at"],
        "id",
        { id: "id::text" },
      ),
    };
    let agendaCounts = null;
    if (source.version >= 2) {
      Object.assign(restored, {
        appointments: await rows(
          "appointments",
          [
            "id",
            "clinician_id",
            "patient_id",
            "starts_at",
            "ends_at",
            "status",
            "revision",
            "created_at",
            "updated_at",
          ],
          ["starts_at", "ends_at", "created_at", "updated_at"],
          "id",
        ),
        appointment_versions: await rows(
          "appointment_versions",
          ["appointment_id", "revision", "payload_json", "created_at"],
          ["created_at"],
          "appointment_id,revision",
          { payload_json: "payload::text" },
        ),
        sessions: await rows(
          "clinical_sessions",
          [
            "id",
            "clinician_id",
            "patient_id",
            "appointment_id",
            "evolution",
            "passive",
            "exercise",
            "revision",
            "created_at",
            "updated_at",
          ],
          ["created_at", "updated_at"],
          "id",
        ),
        session_versions: await rows(
          "session_versions",
          ["session_id", "revision", "payload_json", "created_at"],
          ["created_at"],
          "session_id,revision",
          { payload_json: "payload::text" },
        ),
      });
      agendaCounts = {
        appointments: restored.appointments.length,
        appointmentVersions: restored.appointment_versions.length,
        sessions: restored.sessions.length,
        sessionVersions: restored.session_versions.length,
      };
    }
    if (source.version >= 3)
      restored.custom_exercises = await rows(
        "custom_exercises",
        [
          "id",
          "clinician_id",
          "name",
          "category",
          "regions",
          "created_at",
          ...(source.version === 4
            ? ["revision", "updated_at", "archived_at"]
            : []),
        ],
        ["created_at", "updated_at", "archived_at"],
        "id",
      );
    if (source.version === 4)
      restored.exercise_versions = await rows(
        "exercise_versions",
        ["exercise_id", "revision", "payload_json", "created_at"],
        ["created_at"],
        "exercise_id,revision",
        { payload_json: "payload::text" },
      );
    const sourceHash = await snapshotDigest(source),
      restoredHash = await snapshotDigest(restored);
    if (sourceHash !== restoredHash) throw new Error();
    await db.exec("commit");
    return {
      db,
      sourceHash,
      restoredHash,
      counts: {
        patients: restored.patients.length,
        versions: restored.patient_versions.length,
        events: restored.audit_events.length,
      },
      agendaCounts,
      exerciseVersionsCount:
        source.version === 4 ? restored.exercise_versions.length : null,
      exerciseCount:
        source.version >= 3 ? restored.custom_exercises.length : null,
    };
  } catch {
    await db.exec("rollback").catch(() => {});
    await db.close();
    throw new Error("No se ha podido restaurar la copia en el entorno aislado");
  }
}
