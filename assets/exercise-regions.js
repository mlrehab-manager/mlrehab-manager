/* Region tags organise the catalogue; they do not diagnose or prescribe. */
const EXERCISE_REGION_LABELS = {
  cervical: "Cuello / cervical",
  shoulder: "Hombro / escápula",
  "elbow-forearm": "Codo / antebrazo",
  "wrist-hand": "Muñeca / mano",
  trunk: "Tronco / columna dorsal y lumbar",
  hip: "Cadera",
  knee: "Rodilla",
  "ankle-foot": "Tobillo / pie",
};
function exerciseRegions(name) {
  const key = exerciseNameKey(name);
  const override = (data.exerciseRegions || []).find(
    (entry) => exerciseNameKey(entry.name) === key,
  );
  if (override) return override.regions;
  return (
    BUILTIN_EXERCISES.find((entry) => exerciseNameKey(entry.name) === key)
      ?.regions || []
  );
}
function regionSummary(regions) {
  return regions.length
    ? regions.map((id) => EXERCISE_REGION_LABELS[id]).join(" · ")
    : "Sin zona asignada";
}
function regionOptions() {
  return (
    '<option value="all">Todas las zonas</option>' +
    Object.entries(EXERCISE_REGION_LABELS)
      .map(([id, label]) => `<option value="${id}">${label}</option>`)
      .join("") +
    '<option value="unassigned">Sin zona asignada</option>'
  );
}
function matchesRegion(regions, filter) {
  return (
    filter === "all" ||
    (filter === "unassigned" ? !regions.length : regions.includes(filter))
  );
}
function regionCheckboxes(id, selected = [], legend = "Zonas corporales") {
  return `<fieldset class="region-choices" id="${id}"><legend>${legend}</legend><div>${Object.entries(
    EXERCISE_REGION_LABELS,
  )
    .map(
      ([region, label]) =>
        `<label><input type="checkbox" value="${region}" ${selected.includes(region) ? "checked" : ""}><span>${label}</span></label>`,
    )
    .join(
      "",
    )}</div><p class="formnote">Puedes marcar varias. Sin marcas, queda sin zona asignada.</p></fieldset>`;
}
function readRegionChoices(id) {
  return [...$(id).querySelectorAll("input:checked")].map(
    (input) => input.value,
  );
}
function setExerciseRegions(name, regions) {
  if (
    !Array.isArray(regions) ||
    regions.some((region) => !EXERCISE_REGION_IDS.includes(region))
  )
    return false;
  data.exerciseRegions = (data.exerciseRegions || []).filter(
    (entry) => exerciseNameKey(entry.name) !== exerciseNameKey(name),
  );
  data.exerciseRegions.push({ name, regions: [...new Set(regions)] });
  return true;
}
