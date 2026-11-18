import { BUILTIN_EXERCISES } from "mlrehab:exercise-catalog";
import { categories, regions, key } from "./exercise-labels.js";
const $ = (id) => document.getElementById(id);
let exercises = [],
  loaded = false,
  loadRequested = false,
  api = null,
  editing = null,
  baseline = null;
const changed = () =>
  document.dispatchEvent(new Event("custom-exercises-changed"));
export const getCustomExercises = () => exercises.filter((e) => !e.archived_at);
const fields = () => ({
  name: $("custom-exercise-name").value,
  category: $("custom-exercise-category").value,
  regions: [
    ...$("custom-exercise-regions").querySelectorAll("input:checked"),
  ].map((el) => el.value),
});
export const hasCustomExerciseChanges = () => {
  const v = fields();
  return baseline
    ? JSON.stringify(v) !== JSON.stringify(baseline)
    : v.name !== "" ||
        !["", "other"].includes(v.category) ||
        v.regions.length > 0;
};
const discard = () =>
  !hasCustomExerciseChanges() ||
  window.confirm(
    "Hay cambios sin guardar en el ejercicio propio. ¿Quieres descartarlos?",
  );
function clearForm() {
  editing = baseline = null;
  $("custom-exercise-editor-title").textContent = "Nuevo ejercicio propio";
  $("custom-exercise-submit").textContent = "Guardar ejercicio propio";
  $("custom-exercise-cancel").hidden = true;
  $("custom-exercise-name").value = "";
  $("custom-exercise-category").value = "other";
  $("custom-exercise-regions")
    .querySelectorAll("input")
    .forEach((el) => (el.checked = false));
}
function render() {
  const fragment = document.createDocumentFragment();
  const query = key($("exercise-own-search").value),
    showArchived = $("exercise-show-archived").checked;
  const matching = exercises.filter(
    (e) =>
      (showArchived || !e.archived_at) &&
      (!query || key(e.name).includes(query)),
  );
  for (const e of matching.slice(0, 20)) {
    const li = document.createElement("li");
    li.textContent = `${e.name} · ${categories[e.category]} · ${e.regions.map((r) => regions[r]).join(" · ") || "Sin zona asignada"}`;
    if (e.archived_at) {
      const state = document.createElement("span");
      state.textContent = " · Archivado";
      li.append(state);
    } else {
      const edit = document.createElement("button"),
        archive = document.createElement("button");
      edit.type = archive.type = "button";
      edit.textContent = `Editar ${e.name}`;
      archive.textContent = `Archivar ${e.name}`;
      edit.addEventListener("click", () =>
        api.run(async () => {
          if (!api.isAuthorized() || !discard()) return;
          editing = e;
          $("custom-exercise-name").value = e.name;
          $("custom-exercise-category").value = e.category;
          $("custom-exercise-regions")
            .querySelectorAll("input")
            .forEach((el) => (el.checked = e.regions.includes(el.value)));
          baseline = fields();
          $("custom-exercise-editor-title").textContent =
            `Editar ejercicio · versión ${e.revision}`;
          $("custom-exercise-submit").textContent =
            "Guardar cambios del ejercicio";
          $("custom-exercise-cancel").hidden = false;
        }),
      );
      archive.addEventListener("click", () => archiveExercise(e));
      li.append(edit, archive);
    }
    fragment.append(li);
  }
  $("exercise-own-list").replaceChildren(fragment);
  $("exercise-catalog-state").textContent = loaded
    ? `${exercises.length} ejercicios propios cargados${matching.length > 20 ? " · se muestran 20 coincidencias; usa la búsqueda para localizar otro" : ""}.`
    : "Los ejercicios propios se cargarán al abrir el selector o pulsar Cargar ejercicios propios.";
  changed();
}
export function clearCustomExerciseData() {
  exercises = [];
  loaded = false;
  loadRequested = false;
  clearForm();
  $("exercise-own-search").value = "";
  $("exercise-show-archived").checked = false;
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
  else if (error?.code === "40001")
    api.message(
      "El ejercicio ha cambiado o se ha archivado. El formulario se conserva. Carga los ejercicios propios y abre su versión guardada antes de reintentar.",
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
function archiveExercise(row) {
  api.run(async (isCurrent) => {
    if (!api.isAuthorized()) return;
    if (hasCustomExerciseChanges()) {
      api.message(
        "Guarda o cierra el borrador del ejercicio antes de archivar.",
      );
      return;
    }
    if (
      !window.confirm(
        `¿Archivar «${row.name}»? Dejará de aparecer en el selector; el texto de sesiones anteriores se conserva.`,
      )
    )
      return;
    $("custom-exercise-fields").disabled = true;
    try {
      const { data, error } = await api.client.rpc(
        "clinical_exercise_save_test",
        {
          p_id: row.id,
          p_expected_revision: row.revision,
          p_name: row.name,
          p_category: row.category,
          p_regions: row.regions,
          p_archived: true,
        },
      );
      if (!isCurrent()) return;
      if (error) {
        fail(error);
        return;
      }
      if (
        !valid(data) ||
        data.id !== row.id ||
        data.revision !== row.revision + 1 ||
        !data.archived_at
      ) {
        fail();
        return;
      }
      exercises = exercises.map((e) => (e.id === data.id ? data : e));
      if (editing?.id === row.id) clearForm();
      render();
      api.message(
        "Ejercicio archivado. Sus versiones y el texto de sesiones anteriores se conservan.",
      );
    } finally {
      if (isCurrent()) $("custom-exercise-fields").disabled = false;
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
  $("exercise-own-search").addEventListener("input", render);
  $("exercise-show-archived").addEventListener("change", render);
  $("custom-exercise-cancel").addEventListener("click", () =>
    api.run(async () => {
      if (api.isAuthorized() && discard()) {
        clearForm();
        api.message("Edición del ejercicio cerrada.");
      }
    }),
  );
  $("exercise-catalog-load").addEventListener("click", () =>
    loadCustomExercises(true),
  );
  $("custom-exercise-form").addEventListener("submit", (event) => {
    event.preventDefault();
    api.run(async (isCurrent) => {
      if (!api.isAuthorized()) return;
      const sent = fields(),
        previous = editing;
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
          previous
            ? "clinical_exercise_save_test"
            : "clinical_exercise_create_test",
          {
            ...(previous
              ? {
                  p_id: previous.id,
                  p_expected_revision: previous.revision,
                  p_archived: false,
                }
              : {}),
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
          (previous &&
            (data.id !== previous.id ||
              data.revision !== previous.revision + 1)) ||
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
