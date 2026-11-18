import { BUILTIN_EXERCISES } from "mlrehab:exercise-catalog";
import { categories, regions, key } from "./exercise-labels.js";
const $ = (id) => document.getElementById(id);
let exercises = [],
  loaded = false,
  loadRequested = false,
  api = null;
const changed = () =>
  document.dispatchEvent(new Event("custom-exercises-changed"));
export const getCustomExercises = () => exercises;
const fields = () => ({
  name: $("custom-exercise-name").value,
  category: $("custom-exercise-category").value,
  regions: [
    ...$("custom-exercise-regions").querySelectorAll("input:checked"),
  ].map((el) => el.value),
});
export const hasCustomExerciseChanges = () => {
  const v = fields();
  return (
    v.name !== "" || !["", "other"].includes(v.category) || v.regions.length > 0
  );
};
function clearForm() {
  $("custom-exercise-name").value = "";
  $("custom-exercise-category").value = "other";
  $("custom-exercise-regions")
    .querySelectorAll("input")
    .forEach((el) => (el.checked = false));
}
function render() {
  const fragment = document.createDocumentFragment();
  for (const e of exercises.slice(-10)) {
    const li = document.createElement("li");
    li.textContent = `${e.name} · ${categories[e.category]} · ${e.regions.map((r) => regions[r]).join(" · ") || "Sin zona asignada"}`;
    fragment.append(li);
  }
  $("exercise-own-list").replaceChildren(fragment);
  $("exercise-catalog-state").textContent = loaded
    ? `${exercises.length} ejercicios propios cargados${exercises.length > 10 ? " · aquí se muestran los últimos 10 de la lista; todos están disponibles en el selector de la sesión" : ""}.`
    : "Los ejercicios propios se cargarán al abrir el selector o pulsar Cargar ejercicios propios.";
  changed();
}
export function clearCustomExerciseData() {
  exercises = [];
  loaded = false;
  loadRequested = false;
  clearForm();
  $("custom-exercise-fields").disabled = false;
  render();
}
function valid(e) {
  return (
    e &&
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    e.name.length <= 240 &&
    Object.hasOwn(categories, e.category) &&
    Array.isArray(e.regions) &&
    e.regions.every((r) => Object.hasOwn(regions, r))
  );
}
function fail(error) {
  if (["42501", "PGRST301", "PGRST303"].includes(error?.code)) {
    clearCustomExerciseData();
    api.message(
      "La sesión no permite acceder a los ejercicios propios. Sal y vuelve a entrar.",
    );
  } else if (error?.code === "23505")
    api.message(
      "Ya existe un ejercicio propio con ese nombre. Carga el catálogo para comprobarlo; el formulario se conserva.",
    );
  else if (error?.code === "54000")
    api.message(
      "Has alcanzado el límite de 500 ejercicios propios de esta prueba. El formulario se conserva.",
    );
  else if (error?.code === "22023")
    api.message("Revisa el nombre, la modalidad y las zonas del ejercicio.");
  else
    api.message(
      "No se pudo confirmar la operación del catálogo. Conserva el formulario y carga los ejercicios propios antes de reintentar.",
    );
}
export function loadCustomExercises(force = false) {
  if (!api || !api.isAuthorized() || loadRequested || (!force && loaded))
    return;
  api.run(async (isCurrent) => {
    if (!api.isAuthorized()) return;
    loadRequested = true;
    try {
      const { data, error } = await api.client.rpc(
        "clinical_exercise_list_test",
      );
      if (!isCurrent()) return;
      if (error) {
        fail(error);
        return;
      }
      if (!Array.isArray(data) || data.length > 500 || !data.every(valid)) {
        fail();
        return;
      }
      exercises = data;
      loaded = true;
      render();
    } finally {
      if (isCurrent()) loadRequested = false;
    }
  });
}
export function installCustomExercises(options) {
  api = options;
  const option = (value, label) => {
    const e = document.createElement("option");
    e.value = value;
    e.textContent = label;
    return e;
  };
  $("custom-exercise-category").replaceChildren(
    ...Object.entries(categories).map(([v, l]) => option(v, l)),
  );
  const choices = document.createDocumentFragment();
  for (const [value, label] of Object.entries(regions)) {
    const wrapper = document.createElement("label"),
      input = document.createElement("input"),
      span = document.createElement("span");
    input.type = "checkbox";
    input.value = value;
    span.textContent = label;
    wrapper.append(input, span);
    choices.append(wrapper);
  }
  $("custom-exercise-regions").append(choices);
  clearCustomExerciseData();
  $("exercise-catalog-load").addEventListener("click", () =>
    loadCustomExercises(true),
  );
  $("custom-exercise-form").addEventListener("submit", (event) => {
    event.preventDefault();
    api.run(async (isCurrent) => {
      if (!api.isAuthorized()) return;
      const sent = fields();
      sent.name = sent.name.trim().replace(/\s+/g, " ");
      if (
        !sent.name ||
        sent.name.length > 120 ||
        BUILTIN_EXERCISES.some((e) => key(e.name) === key(sent.name))
      ) {
        api.message(
          sent.name
            ? "Ese nombre ya está en el catálogo inicial o supera el límite. Usa otro nombre."
            : "Escribe un nombre para el ejercicio propio.",
        );
        return;
      }
      $("custom-exercise-fields").disabled = true;
      try {
        const { data, error } = await api.client.rpc(
          "clinical_exercise_create_test",
          {
            p_name: sent.name,
            p_category: sent.category,
            p_regions: sent.regions,
          },
        );
        if (!isCurrent()) return;
        if (error) {
          fail(error);
          return;
        }
        if (
          !valid(data) ||
          data.name !== sent.name ||
          data.category !== sent.category ||
          JSON.stringify([...data.regions].sort()) !==
            JSON.stringify([...sent.regions].sort())
        ) {
          fail();
          return;
        }
        exercises = exercises.filter((e) => e.id !== data.id);
        exercises.push(data);
        clearForm();
        render();
        api.message(
          "Ejercicio propio guardado en la base privada. Ya puedes buscarlo al registrar una sesión ficticia.",
        );
      } finally {
        if (isCurrent()) $("custom-exercise-fields").disabled = false;
      }
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (hasCustomExerciseChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
