// Administrative, synthetic-only restoration. No endpoint or execution against a URL.
import { validateSnapshot, snapshotDigest } from "../backups/snapshot.mjs";
const protectedProject = "jrrnvjrwrphmconrkayc";
const ref = (value) => {
  if (
    typeof value !== "string" ||
    !/^[-a-z0-9]{3,64}$/.test(value) ||
    value === protectedProject
  )
    throw new Error("Destino de recuperación no admitido");
  return value;
};
const literal = (value) =>
  value === null
    ? "null"
    : typeof value === "boolean"
      ? String(value)
      : typeof value === "number"
        ? String(value)
        : Array.isArray(value)
          ? `array[${value.map(literal).join(",")}]::text[]`
          : `E'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const collections = [
  [
    "patients",
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
    "id",
  ],
  [
    "patient_versions",
    "patient_versions",
    ["patient_id", "revision", "payload_json", "archived", "created_at"],
    "patient_id,revision",
  ],
  [
    "appointments",
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
    "id",
  ],
  [
    "appointment_versions",
    "appointment_versions",
    ["appointment_id", "revision", "payload_json", "created_at"],
    "appointment_id,revision",
  ],
  [
    "sessions",
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
    "id",
  ],
  [
    "session_versions",
    "session_versions",
    ["session_id", "revision", "payload_json", "created_at"],
    "session_id,revision",
  ],
  [
    "custom_exercises",
    "custom_exercises",
    [
      "id",
      "clinician_id",
      "name",
      "category",
      "regions",
      "created_at",
      "revision",
      "updated_at",
      "archived_at",
    ],
    "id",
  ],
  [
    "exercise_versions",
    "exercise_versions",
    ["exercise_id", "revision", "payload_json", "created_at"],
    "exercise_id,revision",
  ],
  [
    "audit_events",
    "audit_events",
    [
      "id",
      "actor_id",
      "patient_id",
      "action",
      "revision",
      "created_at",
      "entity_type",
      "entity_id",
    ],
    "id",
  ],
];
export function destinationGuard(project) {
  ref(project);
  return `begin;create schema recovery_admin;revoke all on schema recovery_admin from public,anon,authenticated;
 create table recovery_admin.destination(project_ref text primary key,stage text not null check(stage in ('schema_ready','data_restored')),snapshot_hash text);
 alter table recovery_admin.destination enable row level security;
 create policy deny_clients on recovery_admin.destination as restrictive for all to anon,authenticated using(false) with check(false);
 revoke all on recovery_admin.destination from public,anon,authenticated;
 insert into recovery_admin.destination values(${literal(project)},'schema_ready',null);commit;`;
}
export function snapshotQuery(snapshot) {
  const root = [
    "format",
    snapshot.format,
    "version",
    4,
    "test_only",
    true,
    "clinician_id",
    snapshot.clinician_id,
    "created_at",
    snapshot.created_at,
  ]
    .map(literal)
    .join(",");
  const lists = collections.map(([name, table, fields, order]) => {
    const values = fields
      .flatMap((f) => [
        literal(f),
        f === "payload_json"
          ? "payload::text"
          : f === "id" && table === "audit_events"
            ? "id::text"
            : f.endsWith("_at")
              ? `clinical_private.backup_time(${f})`
              : f,
      ])
      .join(",");
    return `${literal(name)},(select coalesce(jsonb_agg(jsonb_build_object(${values}) order by ${order}),'[]'::jsonb) from clinical_private.${table})`;
  });
  return `select jsonb_build_object(${root},${lists.join(",")}) as snapshot`;
}
export async function recoveryDataSql(input, project) {
  ref(project);
  const snapshot = validateSnapshot(input);
  if (snapshot.version !== 4)
    throw new Error(
      "Este procedimiento de servicio requiere una copia versión 4",
    );
  const hash = await snapshotDigest(snapshot),
    expected = JSON.stringify(snapshot),
    identity = literal(snapshot.clinician_id);
  // Temporary CHECK tables let PostgreSQL verify within the same transaction, before commit.
  const sql = [
    `begin;select pg_advisory_xact_lock(hashtextextended('isolated-clinical-restore',0));`,
    `create temp table recovery_checks(ok boolean not null check(ok)) on commit drop;`,
    `insert into recovery_checks select count(*)=1 from recovery_admin.destination where project_ref=${literal(project)} and stage='schema_ready';`,
    `insert into recovery_checks select count(*)=1 from auth.users where id=${identity}::uuid and email_confirmed_at is not null and banned_until is null;`,
    `insert into recovery_checks select not exists(select 1 from clinical_private.authorized_clinicians) ${collections.map(([, t]) => `and not exists(select 1 from clinical_private.${t})`).join(" ")};`,
    `insert into clinical_private.authorized_clinicians(user_id,enabled) values(${identity},false);`,
  ];
  for (const [name, table, fields] of collections)
    for (const row of snapshot[name]) {
      const columns = fields
          .map((f) => (f === "payload_json" ? "payload" : f))
          .join(","),
        values = fields
          .map((f) => literal(row[f]) + (f === "payload_json" ? "::jsonb" : ""))
          .join(",");
      sql.push(
        `insert into clinical_private.${table}(${columns})${table === "audit_events" ? " overriding system value" : ""} values(${values});`,
      );
    }
  sql.push(
    `select setval(pg_get_serial_sequence('clinical_private.audit_events','id'),(select max(id) from clinical_private.audit_events),true);`,
    `create temp table recovery_exact(snapshot jsonb not null check(snapshot=${literal(expected)}::jsonb)) on commit drop;`,
    `insert into recovery_exact ${snapshotQuery(snapshot)};`,
    `update recovery_admin.destination set stage='data_restored',snapshot_hash=${literal(hash)} where project_ref=${literal(project)};commit;`,
  );
  return {
    sql: sql.join("\n"),
    hash,
    counts: Object.fromEntries(
      collections.map(([name]) => [name, snapshot[name].length]),
    ),
  };
}
