/* Local catalogue, category filters and treatment selection. */
function exerciseNameKey(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}
const EXERCISE_CATEGORY_LABELS = {
  isometric: "Isométricos",
  dynamic: "Dinámicos · Combinados",
  concentric: "Dinámicos · Concéntricos",
  eccentric: "Dinámicos · Excéntricos",
  plyometric: "Pliometría",
  other: "Otros / sin clasificar",
};
function exerciseCategory(name) {
  const key = exerciseNameKey(name);
  return (
    (data.exerciseClassifications || []).find(
      (entry) => exerciseNameKey(entry.name) === key,
    )?.category ||
    BUILTIN_EXERCISES.find((entry) => exerciseNameKey(entry.name) === key)
      ?.category ||
    "other"
  );
}
function categoryOptions(selected = "all", filters = false) {
  const option = (value, label) =>
    `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
  return (
    (filters ? option("all", "Todas las modalidades") : "") +
    option("isometric", "Isométricos") +
    '<optgroup label="Dinámicos">' +
    (filters ? option("dynamic-all", "Todos los dinámicos") : "") +
    option("dynamic", "Combinados") +
    option("concentric", "Concéntricos") +
    option("eccentric", "Excéntricos") +
    "</optgroup>" +
    option("plyometric", "Pliometría") +
    option("other", "Otros / sin clasificar")
  );
}
function matchesCategory(category, filter) {
  return (
    filter === "all" ||
    category === filter ||
    (filter === "dynamic-all" &&
      ["dynamic", "concentric", "eccentric"].includes(category))
  );
}
function groupedExercises(names, renderItem) {
  return Object.entries(EXERCISE_CATEGORY_LABELS)
    .map(([category, label]) => {
      const matching = names.filter(
        (name) => exerciseCategory(name) === category,
      );
      return `<section class="exercise-group ${matching.length ? "" : "hidden"}" data-category="${category}"><h4>${label}</h4><div class="exercise-group-items">${matching.map(renderItem).join("")}</div></section>`;
    })
    .join("");
}
function setExerciseClassification(name, category) {
  if (!EXERCISE_CATEGORY_IDS.includes(category)) return false;
  data.exerciseClassifications = (data.exerciseClassifications || []).filter(
    (entry) => exerciseNameKey(entry.name) !== exerciseNameKey(name),
  );
  data.exerciseClassifications.push({ name, category });
  return true;
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
    `<div class="top"><div><h1>Catálogo de ejercicios</h1><p class="muted">Nombres por modalidad · catálogo local ampliable</p></div><button class="primary" onclick="addExerciseForm()">+ Añadir ejercicio</button></div>
    <div class="card"><div class="grid"><div class="field"><label for="exerciseSearch">Buscar por nombre</label><input id="exerciseSearch" type="search" oninput="filterExerciseCatalog()"></div><div class="field"><label for="exerciseCategoryFilter">Modalidad</label><select id="exerciseCategoryFilter" onchange="filterExerciseCatalog()">${categoryOptions("all", true)}</select></div></div>
    <p class="formnote">Los dinámicos combinados incluyen ambas fases. Concéntricos y excéntricos indican el énfasis de la variante. La modalidad no fija una fase de recuperación ni una pauta.</p><p id="exerciseCount" class="muted"></p><div id="exerciseList"></div></div>
    <details class="card"><summary>Referencias de la ampliación</summary><p class="formnote">Ampliación con nombres adaptados al español de las referencias consultadas. Sin dosis ni prescripción automática.</p><ul>${Object.values(
      EXERCISE_SOURCES,
    )
      .map(
        (source) =>
          `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a></li>`,
      )
      .join("")}</ul></details>`;
  filterExerciseCatalog();
}
function filterExerciseCatalog() {
  const all = exerciseCatalog(),
    q = exerciseNameKey($("exerciseSearch").value),
    category = $("exerciseCategoryFilter").value;
  const names = all.filter(
    (name) =>
      exerciseNameKey(name).includes(q) &&
      matchesCategory(exerciseCategory(name), category),
  );
  $("exerciseCount").textContent =
    `${names.length} de ${all.length} ejercicios`;
  $("exerciseList").innerHTML = names.length
    ? groupedExercises(
        names,
        (name) =>
          `<div class="listrow"><span>${esc(name)}</span><button data-exercise-name="${esc(name)}" onclick="classifyExercise(this.dataset.exerciseName)">Clasificar</button></div>`,
      )
    : '<p class="muted">No se encontraron ejercicios.</p>';
}
function addExerciseForm() {
  openModal(
    "Añadir ejercicio al catálogo",
    `<div class="field"><label>Nombre del ejercicio</label><input id="exerciseName" maxlength="150" placeholder="Nombre del ejercicio"></div><div class="field"><label>Modalidad del ejercicio</label><select id="exerciseCategory">${categoryOptions("other")}</select></div><p class="formnote">Se guardan el nombre y la modalidad. Estará disponible para todas las fichas ficticias de este navegador y en las copias JSON.</p><p id="exerciseError" role="alert"></p><button class="primary" onclick="saveCatalogExercise()">Guardar ejercicio</button>`,
  );
}
function classifyExercise(name) {
  if (
    !exerciseCatalog().some((n) => exerciseNameKey(n) === exerciseNameKey(name))
  )
    return;
  openModal(
    "Clasificar ejercicio",
    `<p>${esc(name)}</p><input id="classifiedExerciseName" type="hidden" value="${esc(name)}"><div class="field"><label>Modalidad del ejercicio</label><select id="exerciseCategory">${categoryOptions(exerciseCategory(name))}</select></div><p class="formnote">La clasificación se usa en todo el catálogo de este navegador. Conserva los nombres seleccionados en las fichas.</p><button class="primary" onclick="saveExerciseClassification()">Guardar clasificación</button>`,
  );
}
function saveExerciseClassification() {
  if (
    !setExerciseClassification(
      $("classifiedExerciseName").value,
      $("exerciseCategory").value,
    )
  )
    return;
  if (!save()) return;
  closeModal();
  exercisesPage();
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
  setExerciseClassification(name, $("exerciseCategory").value);
  if (!save()) return;
  closeModal();
  exercisesPage();
}
function treatmentCard(patient) {
  return `<div class="card"><div class="sectiontitle"><h3>Tratamiento</h3><button onclick="editTreatment()">Editar tratamiento</button></div>
    <h4>1. Tratamiento pasivo</h4><div class="sectionbody">${esc(patient.passiveTreatment) || '<span class="muted">Sin registrar</span>'}</div>
    <h4>2. Ejercicio terapéutico</h4>${(patient.therapeuticExercises || []).length ? `<ul>${patient.therapeuticExercises.map((name) => `<li>${esc(name)} <small class="muted">${EXERCISE_CATEGORY_LABELS[exerciseCategory(name)]}</small></li>`).join("")}</ul>` : '<p class="muted">Sin ejercicios seleccionados</p>'}
    ${patient.treatment ? `<details><summary>Tratamiento previo (sin clasificar)</summary><div class="sectionbody">${esc(patient.treatment)}</div><button onclick="editFields('treatment')">Editar texto previo</button></details>` : ""}</div>`;
}
function exerciseOption(
  name,
  selected = false,
  custom = false,
  category = exerciseCategory(name),
) {
  return `<label class="exercise-option" data-exercise-name="${esc(name)}"><input type="checkbox" name="treatmentExercise" data-category="${category}" value="${esc(name)}" ${selected ? "checked" : ""} ${custom ? 'data-new="true"' : ""}><span>${esc(name)}</span></label>`;
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
    <h3 class="treatment-subtitle">2. Ejercicio terapéutico</h3><div class="field"><label>Filtrar por modalidad</label><select id="treatmentCategoryFilter" data-transient onchange="filterTreatmentExercises()">${categoryOptions("all", true)}</select></div><div class="field"><label>Buscar ejercicio</label><input id="treatmentExerciseSearch" data-transient type="search" oninput="filterTreatmentExercises()"></div>
    <fieldset class="exercise-options"><legend>Selecciona nombres del catálogo</legend><div id="treatmentExerciseList">${groupedExercises(exerciseCatalog(), (name) => exerciseOption(name, selected.has(exerciseNameKey(name))))}</div><p id="exerciseNoMatches" class="muted hidden">No se encontraron ejercicios.</p></fieldset>
    <div class="field"><label>Nuevo ejercicio manual</label><input id="treatmentNewExercise" maxlength="150"></div><div class="field"><label>Modalidad del nuevo ejercicio</label><select id="treatmentNewCategory">${categoryOptions("other")}</select></div><button onclick="stageTreatmentExercise()">Añadir al borrador</button><p class="formnote">El nuevo nombre se añadirá al catálogo y a esta ficha al guardar el tratamiento. Cancelar descarta el borrador.</p>
    <p id="treatmentExerciseError" role="alert"></p><button class="primary" onclick="saveTreatment()">Guardar tratamiento</button>`,
  );
}
function filterTreatmentExercises() {
  const q = exerciseNameKey($("treatmentExerciseSearch").value);
  let visible = 0;
  document
    .querySelectorAll("#treatmentExerciseList .exercise-option")
    .forEach((label) => {
      const match =
        exerciseNameKey(label.dataset.exerciseName).includes(q) &&
        matchesCategory(
          label.querySelector("input").dataset.category,
          $("treatmentCategoryFilter").value,
        );
      label.classList.toggle("hidden", !match);
      if (match) visible++;
    });
  document
    .querySelectorAll("#treatmentExerciseList .exercise-group")
    .forEach((group) =>
      group.classList.toggle(
        "hidden",
        !group.querySelector(".exercise-option:not(.hidden)"),
      ),
    );
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
  const category = $("treatmentNewCategory").value;
  const group = document.querySelector(
    `#treatmentExerciseList .exercise-group[data-category="${category}"] .exercise-group-items`,
  );
  group.insertAdjacentHTML(
    "beforeend",
    exerciseOption(name, true, true, category),
  );
  const added = group.lastElementChild;
  $("treatmentCategoryFilter").value = "all";
  $("treatmentNewCategory").value = "other";
  $("treatmentNewExercise").value = "";
  $("treatmentExerciseSearch").value = "";
  $("treatmentExerciseError").textContent = "";
  filterTreatmentExercises();
  added.scrollIntoView({
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
  for (const input of selected.filter((input) => input.dataset.new)) {
    (data.exerciseCatalog ??= []).push(input.value);
    setExerciseClassification(input.value, input.dataset.category);
  }
  if (!save()) return;
  closeModal();
  patientDetail();
}
