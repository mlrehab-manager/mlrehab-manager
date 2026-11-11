/* A local catalogue of names only; no prescriptions, dosages or external service. */
const INITIAL_EXERCISES = [
  "Retracción cervical",
  "Flexión cervical",
  "Rotación cervical",
  "Inclinación lateral cervical",
  "Rotación torácica en decúbito lateral",
  "Extensión torácica sobre rodillo",
  "Movilidad de columna en gato-camello",
  "Basculación pélvica",
  "Puente de glúteos",
  "Puente de glúteos unilateral",
  "Bird dog",
  "Dead bug",
  "Plancha frontal",
  "Plancha lateral",
  "Press Pallof",
  "Flexión de hombro asistida con bastón",
  "Abducción de hombro asistida con bastón",
  "Péndulo de hombro",
  "Deslizamiento de brazos en pared",
  "Rotación externa de hombro con banda",
  "Rotación interna de hombro con banda",
  "Remo con banda elástica",
  "Retracción escapular",
  "Serrato anterior en pared",
  "Flexiones en pared",
  "Flexiones de brazos",
  "Elevación de hombro en plano escapular",
  "Flexión de codo con mancuerna",
  "Extensión de codo con banda",
  "Pronación y supinación de antebrazo",
  "Flexión de muñeca con mancuerna",
  "Extensión de muñeca con mancuerna",
  "Prensión de pelota",
  "Oposición del pulgar",
  "Deslizamientos tendinosos de la mano",
  "Flexión de cadera en bipedestación",
  "Abducción de cadera en decúbito lateral",
  "Abducción de cadera con banda",
  "Extensión de cadera en bipedestación",
  "Clamshell",
  "Marcha lateral con banda",
  "Sentadilla",
  "Sentadilla a silla",
  "Sentadilla dividida",
  "Zancada hacia atrás",
  "Subida a escalón",
  "Bajada de escalón",
  "Peso muerto rumano",
  "Peso muerto rumano unilateral",
  "Elevación de pierna recta",
  "Contracción isométrica de cuádriceps",
  "Extensión de rodilla sentado",
  "Flexión de rodilla en decúbito prono",
  "Deslizamiento de talón",
  "Elevación de talones de pie",
  "Elevación de talón unilateral",
  "Elevación de talones sentado",
  "Dorsiflexión de tobillo con banda",
  "Inversión de tobillo con banda",
  "Eversión de tobillo con banda",
  "Movilidad de tobillo rodilla a pared",
  "Equilibrio unipodal",
  "Marcha en tándem",
  "Transferencias de peso",
  "Sentarse y levantarse",
  "Marcha de puntillas",
  "Marcha de talones",
];
function exerciseNameKey(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}
function exerciseCatalog() {
  const names = new Map();
  for (const name of [
    ...INITIAL_EXERCISES,
    ...(data.exerciseCatalog || []),
    ...data.patients.flatMap((p) => p.therapeuticExercises || []),
  ]) {
    if (!names.has(exerciseNameKey(name)))
      names.set(exerciseNameKey(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}
function exercisesPage() {
  $("app").innerHTML =
    `<div class="top"><div><h1>Catálogo de ejercicios</h1><p class="muted">Nombres de ejercicios · catálogo local ampliable</p></div><button class="primary" onclick="addExerciseForm()">+ Añadir ejercicio</button></div>
    <div class="card"><label for="exerciseSearch">Buscar por nombre</label><input id="exerciseSearch" type="search" oninput="filterExerciseCatalog()"><p id="exerciseCount" class="muted"></p><div id="exerciseList"></div></div>`;
  filterExerciseCatalog();
}
function filterExerciseCatalog() {
  const all = exerciseCatalog();
  const q = exerciseNameKey($("exerciseSearch").value);
  const names = all.filter((name) => exerciseNameKey(name).includes(q));
  $("exerciseCount").textContent =
    `${names.length} de ${all.length} ejercicios`;
  $("exerciseList").innerHTML =
    names.map((name) => `<div class="listrow">${esc(name)}</div>`).join("") ||
    '<p class="muted">No se encontraron ejercicios.</p>';
}
function addExerciseForm() {
  openModal(
    "Añadir ejercicio al catálogo",
    `<div class="field"><label>Nombre del ejercicio</label><input id="exerciseName" maxlength="150" placeholder="Nombre del ejercicio"></div><p class="formnote">Solo se guarda el nombre. Estará disponible para todas las fichas ficticias de este navegador y en las copias JSON.</p><p id="exerciseError" role="alert"></p><button class="primary" onclick="saveCatalogExercise()">Guardar ejercicio</button>`,
  );
}
function readNewExercise(inputId, errorId) {
  const name = $(inputId).value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 150) {
    $(errorId).textContent = "Escribe un nombre de entre 1 y 150 caracteres.";
    return null;
  }
  return name;
}
function saveCatalogExercise() {
  const name = readNewExercise("exerciseName", "exerciseError");
  if (!name) return;
  if (
    exerciseCatalog().some((n) => exerciseNameKey(n) === exerciseNameKey(name))
  ) {
    $("exerciseError").textContent = "Ese ejercicio ya existe en el catálogo.";
    return;
  }
  (data.exerciseCatalog ??= []).push(name);
  if (!save()) return;
  closeModal();
  exercisesPage();
}
function treatmentCard(patient) {
  return `<div class="card"><div class="sectiontitle"><h3>Tratamiento</h3><button onclick="editTreatment()">Editar tratamiento</button></div>
    <h4>1. Tratamiento pasivo</h4><div class="sectionbody">${esc(patient.passiveTreatment) || '<span class="muted">Sin registrar</span>'}</div>
    <h4>2. Ejercicio terapéutico</h4>${(patient.therapeuticExercises || []).length ? `<ul>${patient.therapeuticExercises.map((name) => `<li>${esc(name)}</li>`).join("")}</ul>` : '<p class="muted">Sin ejercicios seleccionados</p>'}
    ${patient.treatment ? `<details><summary>Tratamiento previo (sin clasificar)</summary><div class="sectionbody">${esc(patient.treatment)}</div><button onclick="editFields('treatment')">Editar texto previo</button></details>` : ""}</div>`;
}
function exerciseOption(name, selected = false, custom = false) {
  return `<label class="exercise-option" data-exercise-name="${esc(name)}"><input type="checkbox" name="treatmentExercise" value="${esc(name)}" ${selected ? "checked" : ""} ${custom ? 'data-new="true"' : ""}><span>${esc(name)}</span></label>`;
}
function editTreatment() {
  const patient = data.patients.find((p) => p.id === currentPatient);
  if (!patient) return;
  const selected = new Set(
    (patient.therapeuticExercises || []).map(exerciseNameKey),
  );
  openModal(
    "Editar tratamiento",
    `<div class="field"><label class="treatment-subtitle">1. Tratamiento pasivo</label><textarea id="passiveTreatment">${esc(patient.passiveTreatment || "")}</textarea></div>
    <h3 class="treatment-subtitle">2. Ejercicio terapéutico</h3><div class="field"><label>Buscar ejercicio</label><input id="treatmentExerciseSearch" data-transient type="search" oninput="filterTreatmentExercises()"></div>
    <fieldset class="exercise-options"><legend>Selecciona nombres del catálogo</legend><div id="treatmentExerciseList">${exerciseCatalog()
      .map((name) => exerciseOption(name, selected.has(exerciseNameKey(name))))
      .join(
        "",
      )}</div><p id="exerciseNoMatches" class="muted hidden">No se encontraron ejercicios.</p></fieldset>
    <div class="field"><label>Nuevo ejercicio manual</label><input id="treatmentNewExercise" maxlength="150"></div><button onclick="stageTreatmentExercise()">Añadir al borrador</button><p class="formnote">El nuevo nombre se añadirá al catálogo y a esta ficha al guardar el tratamiento. Cancelar descarta el borrador.</p>
    <p id="treatmentExerciseError" role="alert"></p><button class="primary" onclick="saveTreatment()">Guardar tratamiento</button>`,
  );
}
function filterTreatmentExercises() {
  const q = exerciseNameKey($("treatmentExerciseSearch").value);
  let visible = 0;
  document
    .querySelectorAll("#treatmentExerciseList .exercise-option")
    .forEach((label) => {
      const match = exerciseNameKey(label.dataset.exerciseName).includes(q);
      label.classList.toggle("hidden", !match);
      if (match) visible++;
    });
  $("exerciseNoMatches").classList.toggle("hidden", visible !== 0);
}
function stageTreatmentExercise() {
  const name = readNewExercise(
    "treatmentNewExercise",
    "treatmentExerciseError",
  );
  if (!name) return;
  const options = [
    ...document.querySelectorAll("#treatmentExerciseList input"),
  ];
  if (
    options.some(
      (input) => exerciseNameKey(input.value) === exerciseNameKey(name),
    )
  ) {
    $("treatmentExerciseError").textContent =
      "Ese ejercicio ya está en la lista. Búscalo y selecciónalo.";
    return;
  }
  $("treatmentExerciseList").insertAdjacentHTML(
    "beforeend",
    exerciseOption(name, true, true),
  );
  $("treatmentNewExercise").value = "";
  $("treatmentExerciseSearch").value = "";
  $("treatmentExerciseError").textContent = "";
  filterTreatmentExercises();
  $("treatmentExerciseList").lastElementChild.scrollIntoView({
    block: "nearest",
  });
}
function saveTreatment() {
  if ($("treatmentNewExercise").value.trim()) {
    $("treatmentExerciseError").textContent =
      "Añade el nuevo ejercicio al borrador o vacía su nombre antes de guardar.";
    return;
  }
  const patient = data.patients.find((p) => p.id === currentPatient);
  if (!patient) return;
  patient.passiveTreatment = $("passiveTreatment").value;
  const selected = [
    ...document.querySelectorAll("#treatmentExerciseList input:checked"),
  ];
  patient.therapeuticExercises = selected.map((input) => input.value);
  for (const input of selected.filter((input) => input.dataset.new))
    (data.exerciseCatalog ??= []).push(input.value);
  if (!save()) return;
  closeModal();
  patientDetail();
}
