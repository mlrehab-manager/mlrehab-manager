import { MAX_PLAINTEXT_BYTES } from "./crypto.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const actions = new Set([
  "patient.list",
  "patient.read",
  "patient.create",
  "patient.update",
  "patient.archive",
  "backup.export",
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
    ]),
  );
  requireValue(
    value.format === "mlrehab-clinical-test-snapshot" &&
      value.version === 1 &&
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
    if (["patient.list", "backup.export"].includes(e.action))
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
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(canonical(rows))),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
