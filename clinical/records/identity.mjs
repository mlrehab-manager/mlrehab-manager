export const IDENTITY_FIELDS = [
  "given_name",
  "family_name",
  "birth_date",
  "phone",
  "email",
];
export const NOTE_FIELDS = [
  "reason",
  "precautions",
  "history",
  "exam",
  "diagnosis",
  "goals",
];
const text = (value) => value.trim().replace(/\s+/gu, " ");
export function normalizeIdentity(value, requireNames = true) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !IDENTITY_FIELDS.includes(k))
  )
    throw new Error("Identificación no válida");
  const result = {};
  for (const field of IDENTITY_FIELDS) {
    const raw = Object.hasOwn(value, field) ? value[field] : "";
    if (typeof raw !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(raw))
      throw new Error("La identificación requiere texto");
    const v = text(raw);
    if (
      ["given_name", "family_name"].includes(field) &&
      ([...v].length > 80 || (requireNames && !v))
    )
      throw new Error("Revisa nombre y apellidos");
    if (field === "birth_date" && v) {
      const date = new Date(v + "T00:00:00Z");
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value]),
      );
      const localDay = `${parts.year}-${parts.month}-${parts.day}`;
      if (
        !/^\d{4}-\d{2}-\d{2}$/u.test(v) ||
        !Number.isFinite(+date) ||
        date.toISOString().slice(0, 10) !== v ||
        v > localDay ||
        v.startsWith("0000")
      )
        throw new Error("Fecha de nacimiento no válida");
    }
    if (
      field === "phone" &&
      ([...v].length > 32 ||
        (v &&
          (!/^[+0-9 ()/.-]+$/u.test(v) ||
            !/^\+?[0-9]{6,15}$/u.test(v.replace(/[ ()/.-]/gu, "")))))
    )
      throw new Error("Teléfono no válido");
    if (
      field === "email" &&
      ([...v].length > 254 || (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)))
    )
      throw new Error("Correo no válido");
    result[field] = v;
  }
  return result;
}
export function validateClinicalPatient(value) {
  const keys = ["record_type", "name", ...IDENTITY_FIELDS, ...NOTE_FIELDS];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    value.record_type !== "clinical-patient-v1"
  )
    throw new Error("Ficha clínica no válida");
  const identity = normalizeIdentity(
    Object.fromEntries(IDENTITY_FIELDS.map((k) => [k, value[k]])),
  );
  if (
    IDENTITY_FIELDS.some((k) => identity[k] !== value[k]) ||
    value.name !== `${identity.given_name} ${identity.family_name}`
  )
    throw new Error("Identificación no canónica");
  for (const field of NOTE_FIELDS) {
    const max = ["history", "exam"].includes(field)
      ? 8000
      : field === "precautions"
        ? 4000
        : 2000;
    if (typeof value[field] !== "string" || [...value[field]].length > max)
      throw new Error("Campo clínico no válido");
  }
  return value;
}
