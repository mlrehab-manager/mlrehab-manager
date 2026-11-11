/* Pure validation shared by browser persistence and regression tests. */
let recoverySource = null;
let storageBaseline = null;
let startupMessage =
  "Demo: solo datos ficticios. Almacenamiento local sin cifrar.";
function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T12:00:00");
  return !isNaN(d) && localDate(d) === value;
}
function validateExerciseNames(value) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (name) => typeof name !== "string" || !name.trim() || name.length > 150,
    )
  )
    throw Error("Catálogo o selección de ejercicios no válidos.");
  const keys = new Set();
  return value
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => {
      const key = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es");
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
}
const EXERCISE_CATEGORY_IDS = [
  "isometric",
  "dynamic",
  "concentric",
  "eccentric",
  "plyometric",
  "other",
];
function validateExerciseClassifications(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw Error("Clasificaciones de ejercicios no válidas.");
  const seen = new Set();
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !EXERCISE_CATEGORY_IDS.includes(entry.category)
    )
      throw Error("Clasificación de ejercicio no válida.");
    const name = validateExerciseNames([entry.name])[0];
    const key = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    if (seen.has(key)) throw Error("Clasificación de ejercicio duplicada.");
    seen.add(key);
    return { name, category: entry.category };
  });
}
const EXERCISE_REGION_IDS = [
  "cervical",
  "shoulder",
  "elbow-forearm",
  "wrist-hand",
  "trunk",
  "hip",
  "knee",
  "ankle-foot",
];
function validateExerciseRegions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Error("Zonas de ejercicios no válidas.");
  const seen = new Set();
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !Array.isArray(entry.regions) ||
      entry.regions.some((region) => !EXERCISE_REGION_IDS.includes(region))
    )
      throw Error("Zona de ejercicio no válida.");
    const name = validateExerciseNames([entry.name])[0];
    const key = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    if (seen.has(key)) throw Error("Zonas de ejercicio duplicadas.");
    seen.add(key);
    return { name, regions: [...new Set(entry.regions)] };
  });
}
function validateData(source) {
  const fail = () => {
    throw Error(
      "Formato de copia inválido: revisa pacientes, sesiones y citas.",
    );
  };
  if (
    !source ||
    !Array.isArray(source.patients) ||
    !Array.isArray(source.appointments)
  )
    fail();
  const ids = new Set(),
    appointments = new Set(),
    slots = new Set();
  const patients = source.patients.map((p) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^P\d+$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim()
    )
      fail();
    ids.add(p.id);
    for (const [key, value] of Object.entries(p)) {
      if (
        key !== "notes" &&
        key !== "documents" &&
        key !== "therapeuticExercises" &&
        typeof value !== "string"
      )
        fail();
    }
    if (p.notes !== undefined && !Array.isArray(p.notes)) fail();
    const notes = (p.notes || []).map((n) => {
      if (
        !n ||
        !validDate(n.date) ||
        typeof n.text !== "string" ||
        !n.text.trim()
      )
        fail();
      return { date: n.date, text: n.text };
    });
    if (
      p.documents !== undefined &&
      (!Array.isArray(p.documents) ||
        p.documents.some((d) => typeof d !== "string"))
    )
      fail();
    return {
      ...p,
      notes,
      documents: p.documents || [],
      passiveTreatment: p.passiveTreatment || "",
      therapeuticExercises: validateExerciseNames(p.therapeuticExercises),
    };
  });
  const appts = source.appointments.map((a) => {
    if (
      !a ||
      typeof a.id !== "string" ||
      !/^A\d+$/.test(a.id) ||
      appointments.has(a.id) ||
      !ids.has(a.patientId) ||
      !validDate(a.date) ||
      !Number.isInteger(a.hour) ||
      a.hour < 8 ||
      a.hour > 19
    )
      fail();
    const slot = a.date + ":" + a.hour;
    if (slots.has(slot)) fail();
    slots.add(slot);
    appointments.add(a.id);
    return { id: a.id, patientId: a.patientId, date: a.date, hour: a.hour };
  });
  function next(items, requested) {
    const max = Math.max(0, ...items.map((p) => Number(p.id.slice(1))));
    if (!Number.isSafeInteger(max) || max >= Number.MAX_SAFE_INTEGER - 1)
      fail();
    return Math.max(
      max + 1,
      Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
    );
  }
  return {
    patients,
    exerciseCatalog: validateExerciseNames(source.exerciseCatalog),
    exerciseRegions: validateExerciseRegions(source.exerciseRegions),
    exerciseClassifications: validateExerciseClassifications(
      source.exerciseClassifications,
    ),
    appointments: appts,
    nextPatient: next(patients, source.nextPatient),
    nextAppt: next(appts, source.nextAppt),
  };
}
function loadData(fallback) {
  let raw = null;
  try {
    raw = localStorage.getItem("mlrehab-demo-v1");
    storageBaseline = raw;
    return raw === null
      ? structuredClone(fallback)
      : validateData(JSON.parse(raw));
  } catch (error) {
    recoverySource = raw;
    startupMessage =
      raw === null
        ? "No se puede acceder al almacenamiento. Exporta tus cambios antes de salir."
        : "Los datos guardados no son válidos. Se muestra una demo temporal; el original se conserva. Ve a Copias de prueba para recuperarlo.";
    return structuredClone(fallback);
  }
}
function storageMessage(message) {
  document.getElementById("storageStatus").textContent = message;
}
if (typeof module !== "undefined")
  module.exports = { validateData, validDate, localDate };
