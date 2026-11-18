import { MAX_PLAINTEXT_BYTES } from "./crypto.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const actions = new Set([
  "patient.list",
  "patient.read",
  "patient.create",
  "patient.update",
  "patient.archive",
  "backup.export",
  "agenda.read",
  "appointment.create",
  "appointment.update",
  "appointment.cancel",
  "appointment.complete",
  "session.read",
  "session.create",
  "session.update",
]);
const encoder = new TextEncoder();
function requireValue(ok) {
  if (!ok)
    throw new Error(
      "La copia de prueba no es completa o tiene un formato no válido",
    );
}
function keys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}
function timestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value.slice(0, 23) + "Z"
  );
}
function revision(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5000;
}
function payload(value) {
  requireValue(
    typeof value === "string" && encoder.encode(value).length <= 1048576,
  );
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    requireValue(false);
  }
  requireValue(
    parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.name === "string" &&
      [...parsed.name.trim()].length >= 1 &&
      [...parsed.name].length <= 150 &&
      parsed.testOnly === true &&
      parsed.fixture === "backup-roundtrip-v1",
  );
}

export function validateSnapshot(value) {
  requireValue(
    keys(value, [
      "format",
      "version",
      "test_only",
      "clinician_id",
      "created_at",
      "patients",
      "patient_versions",
      "audit_events",
      ...(value.version === 2
        ? [
            "appointments",
            "appointment_versions",
            "sessions",
            "session_versions",
          ]
        : []),
    ]),
  );
  requireValue(
    value.format === "mlrehab-clinical-test-snapshot" &&
      [1, 2].includes(value.version) &&
      value.test_only === true &&
      uuid.test(value.clinician_id) &&
      timestamp(value.created_at),
  );
  requireValue(
    Array.isArray(value.patients) &&
      value.patients.length === 2 &&
      Array.isArray(value.patient_versions) &&
      value.patient_versions.length >= 2 &&
      value.patient_versions.length <= 5000 &&
      Array.isArray(value.audit_events) &&
      value.audit_events.length <= 10000,
  );
  requireValue(
    encoder.encode(JSON.stringify(value)).length <= MAX_PLAINTEXT_BYTES,
  );
  const patients = new Map(),
    versions = new Map();
  for (const p of value.patients) {
    requireValue(
      keys(p, [
        "id",
        "clinician_id",
        "payload_json",
        "revision",
        "created_at",
        "updated_at",
        "archived_at",
      ]),
    );
    requireValue(
      uuid.test(p.id) &&
        !patients.has(p.id) &&
        p.clinician_id === value.clinician_id &&
        revision(p.revision) &&
        timestamp(p.created_at) &&
        timestamp(p.updated_at) &&
        (p.archived_at === null || timestamp(p.archived_at)),
    );
    payload(p.payload_json);
    patients.set(p.id, p);
    versions.set(p.id, new Map());
  }
  for (const v of value.patient_versions) {
    requireValue(
      keys(v, [
        "patient_id",
        "revision",
        "payload_json",
        "archived",
        "created_at",
      ]),
    );
    requireValue(
      patients.has(v.patient_id) &&
        revision(v.revision) &&
        typeof v.archived === "boolean" &&
        timestamp(v.created_at) &&
        !versions.get(v.patient_id).has(v.revision),
    );
    payload(v.payload_json);
    versions.get(v.patient_id).set(v.revision, v);
  }
  for (const p of patients.values()) {
    const history = versions.get(p.id);
    requireValue(history.size === p.revision);
    for (let i = 1; i <= p.revision; i++) requireValue(history.has(i));
    const latest = history.get(p.revision);
    requireValue(
      latest.payload_json === p.payload_json &&
        latest.archived === (p.archived_at !== null),
    );
  }
  const agenda = readAgenda(value, patients);
  const ids = new Set(),
    changes = new Set();
  for (const e of value.audit_events) {
    requireValue(
      keys(e, [
        "id",
        "actor_id",
        "patient_id",
        "action",
        "revision",
        "created_at",
        ...(value.version === 2 ? ["entity_type", "entity_id"] : []),
      ]),
    );
    requireValue(
      typeof e.id === "string" &&
        /^[1-9][0-9]{0,18}$/.test(e.id) &&
        BigInt(e.id) <= 9223372036854775807n &&
        !ids.has(e.id) &&
        e.actor_id === value.clinician_id &&
        actions.has(e.action) &&
        timestamp(e.created_at),
    );
    ids.add(e.id);
    if (e.action === "agenda.read") requireValue(value.version === 2);
    if (/^(appointment|session)\./.test(e.action)) {
      requireValue(value.version === 2);
      validateEntityAudit(e, agenda, changes);
      continue;
    }
    if (value.version === 2)
      requireValue(e.entity_type === null && e.entity_id === null);
    if (["patient.list", "backup.export", "agenda.read"].includes(e.action))
      requireValue(e.patient_id === null && e.revision === null);
    else {
      requireValue(
        patients.has(e.patient_id) &&
          revision(e.revision) &&
          versions.get(e.patient_id).has(e.revision),
      );
      changes.add(`${e.patient_id}:${e.revision}:${e.action}`);
    }
  }
  for (const v of value.patient_versions)
    requireValue(
      changes.has(
        `${v.patient_id}:${v.revision}:${v.archived ? "patient.archive" : v.revision === 1 ? "patient.create" : "patient.update"}`,
      ),
    );
  requireValue(value.audit_events.some((e) => e.action === "backup.export"));
  for (const [kind, config] of Object.entries(agenda))
    for (const rows of config.history.values())
      for (const v of rows.values()) {
        const action =
          kind === "session"
            ? v.revision === 1
              ? "session.create"
              : "session.update"
            : v.revision === 1
              ? "appointment.create"
              : v.status === "cancelled"
                ? "appointment.cancel"
                : v.status === "completed"
                  ? "appointment.complete"
                  : "appointment.update";
        requireValue(changes.has(`${kind}:${v.id}:${v.revision}:${action}`));
      }
  return structuredClone(value);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export async function snapshotDigest(value) {
  const s = validateSnapshot(value);
  const rows = {
    clinician_id: s.clinician_id,
    patients: s.patients.sort((a, b) => a.id.localeCompare(b.id)),
    patient_versions: s.patient_versions.sort(
      (a, b) =>
        a.patient_id.localeCompare(b.patient_id) || a.revision - b.revision,
    ),
    audit_events: s.audit_events.sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1,
    ),
  };
  if (s.version === 2)
    Object.assign(rows, {
      appointments: s.appointments.sort((a, b) => a.id.localeCompare(b.id)),
      appointment_versions: s.appointment_versions.sort(
        (a, b) =>
          a.appointment_id.localeCompare(b.appointment_id) ||
          a.revision - b.revision,
      ),
      sessions: s.sessions.sort((a, b) => a.id.localeCompare(b.id)),
      session_versions: s.session_versions.sort(
        (a, b) =>
          a.session_id.localeCompare(b.session_id) || a.revision - b.revision,
      ),
    });
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(canonical(rows))),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function readAgenda(snapshot, patients) {
  if (snapshot.version === 1) return {};
  for (const [name, limit] of [
    ["appointments", 500],
    ["appointment_versions", 2000],
    ["sessions", 500],
    ["session_versions", 2000],
  ])
    requireValue(
      Array.isArray(snapshot[name]) && snapshot[name].length <= limit,
    );
  const appointment = { rows: new Map(), history: new Map() },
    session = { rows: new Map(), history: new Map() };
  function validateRow(row, kind) {
    const expected =
      kind === "appointment"
        ? [
            "id",
            "clinician_id",
            "patient_id",
            "starts_at",
            "ends_at",
            "status",
            "revision",
            "created_at",
            "updated_at",
          ]
        : [
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
          ];
    requireValue(
      keys(row, expected) &&
        uuid.test(row.id) &&
        row.clinician_id === snapshot.clinician_id &&
        patients.has(row.patient_id) &&
        Number.isInteger(row.revision) &&
        row.revision >= 1 &&
        row.revision <= 2000 &&
        timestamp(row.created_at) &&
        timestamp(row.updated_at),
    );
    if (kind === "appointment") {
      requireValue(
        timestamp(row.starts_at) &&
          timestamp(row.ends_at) &&
          ["scheduled", "cancelled", "completed"].includes(row.status),
      );
      const minutes =
        (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000;
      requireValue(
        Number.isInteger(minutes) &&
          minutes >= 5 &&
          minutes <= 240 &&
          minutes % 5 === 0,
      );
    } else {
      const app = appointment.rows.get(row.appointment_id);
      requireValue(
        app && app.patient_id === row.patient_id && app.status === "completed",
      );
      for (const [field, max] of [
        ["evolution", 8000],
        ["passive", 4000],
        ["exercise", 4000],
      ])
        requireValue(
          typeof row[field] === "string" && [...row[field]].length <= max,
        );
    }
  }
  for (const [kind, config, list, versionsList, idKey] of [
    [
      "appointment",
      appointment,
      snapshot.appointments,
      snapshot.appointment_versions,
      "appointment_id",
    ],
    [
      "session",
      session,
      snapshot.sessions,
      snapshot.session_versions,
      "session_id",
    ],
  ]) {
    const appointmentSessions = new Set();
    for (const row of list) {
      validateRow(row, kind);
      requireValue(!config.rows.has(row.id));
      if (kind === "session") {
        requireValue(!appointmentSessions.has(row.appointment_id));
        appointmentSessions.add(row.appointment_id);
      }
      config.rows.set(row.id, row);
      config.history.set(row.id, new Map());
    }
    for (const version of versionsList) {
      requireValue(
        keys(version, [idKey, "revision", "payload_json", "created_at"]) &&
          config.rows.has(version[idKey]) &&
          Number.isInteger(version.revision) &&
          timestamp(version.created_at) &&
          typeof version.payload_json === "string" &&
          encoder.encode(version.payload_json).length <= 1048576,
      );
      let row;
      try {
        row = JSON.parse(version.payload_json);
      } catch {
        requireValue(false);
      }
      validateRow(row, kind);
      const current = config.rows.get(version[idKey]),
        history = config.history.get(version[idKey]);
      requireValue(
        row.id === version[idKey] &&
          row.revision === version.revision &&
          !history.has(row.revision) &&
          row.patient_id === current.patient_id &&
          row.created_at === current.created_at,
      );
      if (kind === "session")
        requireValue(row.appointment_id === current.appointment_id);
      history.set(row.revision, row);
    }
    for (const row of list) {
      const history = config.history.get(row.id);
      requireValue(history.size === row.revision);
      for (let i = 1; i <= row.revision; i++) requireValue(history.has(i));
      requireValue(
        JSON.stringify(canonical(history.get(row.revision))) ===
          JSON.stringify(canonical(row)),
      );
    }
  }
  for (const app of appointment.rows.values())
    requireValue(
      (app.status === "completed") ===
        [...session.rows.values()].some((s) => s.appointment_id === app.id),
    );
  return { appointment, session };
}
function validateEntityAudit(event, agenda, changes) {
  const kind = event.action.startsWith("appointment.")
    ? "appointment"
    : "session";
  const entity = agenda[kind].rows.get(event.entity_id),
    history = agenda[kind].history.get(event.entity_id);
  requireValue(
    event.entity_type === kind &&
      entity &&
      event.patient_id === entity.patient_id &&
      Number.isInteger(event.revision) &&
      history.has(event.revision),
  );
  changes.add(`${kind}:${event.entity_id}:${event.revision}:${event.action}`);
}
