// Catalogue is bundled at build time from the demo's single canonical data file.
import { BUILTIN_EXERCISES } from "mlrehab:exercise-catalog";
const $ = (id) => document.getElementById(id);
import { categories, regions, key } from "./exercise-labels.js";
import { getCustomExercises, loadCustomExercises } from "./custom-exercises.js";
let editable = () => false,
  message = () => {};
const contains = (name) =>
  $("session-exercise")
    .value.split(/\r?\n/)
    .some((line) => key(line) === key(name));
function append(name) {
  if (!editable()) return;
  if (contains(name)) {
    message("Este ejercicio ya figura en el texto de la sesión.");
    return;
  }
  const field = $("session-exercise"),
    next =
      field.value +
      (field.value.endsWith("\n") || !field.value ? "" : "\n") +
      "- " +
      name;
  // PostgreSQL limits Unicode code points; textarea maxlength uses UTF-16 units.
  // Use the stricter browser bound so appending never bypasses the visible limit.
  if (next.length > field.maxLength) {
    message(
      "El texto de ejercicio terapéutico alcanza el límite. Revisa el texto antes de añadir otro nombre.",
    );
    return;
  }
  field.value = next;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  message(
    "Ejercicio añadido al borrador. Pulsa Guardar sesión ficticia para conservarlo.",
  );
}
export function refreshExercisePicker() {
  const query = key($("exercise-search").value),
    category = $("exercise-category").value,
    region = $("exercise-region").value;
  const catalogue = [...BUILTIN_EXERCISES];
  const names = new Set(catalogue.map((e) => key(e.name)));
  for (const exercise of getCustomExercises())
    if (!names.has(key(exercise.name))) {
      catalogue.push(exercise);
      names.add(key(exercise.name));
    }
  const matching = catalogue
    .filter(
      (e) =>
        (!query || key(e.name).includes(query)) &&
        (category === "all" ||
          category === e.category ||
          (category === "dynamic-all" &&
            ["dynamic", "concentric", "eccentric"].includes(e.category))) &&
        (region === "all" ||
          (region === "unassigned"
            ? !e.regions?.length
            : e.regions?.includes(region))),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const visible = matching.slice(0, 24),
    fragment = document.createDocumentFragment();
  for (const exercise of visible) {
    const item = document.createElement("li"),
      button = document.createElement("button"),
      title = document.createElement("span"),
      detail = document.createElement("small");
    button.type = "button";
    button.setAttribute("aria-label", `Añadir ${exercise.name}`);
    button.setAttribute("aria-pressed", String(contains(exercise.name)));
    title.textContent = exercise.name;
    detail.textContent = `${categories[exercise.category]} · ${(exercise.regions ?? []).map((r) => regions[r]).join(" · ") || "Sin zona asignada"}${contains(exercise.name) ? " · Ya en la sesión" : ""}`;
    button.append(title, detail);
    button.addEventListener("click", () => append(exercise.name));
    item.append(button);
    fragment.append(item);
  }
  $("exercise-results").replaceChildren(fragment);
  $("exercise-count").textContent = matching.length
    ? `${matching.length} ejercicios encontrados${matching.length > visible.length ? ` · mostrando ${visible.length}; afina la búsqueda para ver otros` : ""}.`
    : "No hay coincidencias. Puedes escribir el nombre manualmente en el texto de ejercicio terapéutico.";
}
export function clearExercisePicker() {
  $("exercise-search").value = "";
  $("exercise-category").value = "all";
  $("exercise-region").value = "all";
  $("exercise-picker").open = false;
  refreshExercisePicker();
}
export function installExercisePicker({ isEditable, message: showMessage }) {
  editable = isEditable;
  message = showMessage;
  const option = (value, label) => {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  };
  $("exercise-category").replaceChildren(
    option("all", "Todas las modalidades"),
    option("isometric", "Isométricos"),
  );
  const dynamics = document.createElement("optgroup");
  dynamics.label = "Dinámicos";
  dynamics.append(
    option("dynamic-all", "Todos los dinámicos"),
    option("dynamic", "Combinados"),
    option("concentric", "Concéntricos"),
    option("eccentric", "Excéntricos"),
  );
  $("exercise-category").append(
    dynamics,
    option("plyometric", "Pliometría"),
    option("other", "Otros / sin clasificar"),
  );
  $("exercise-region").replaceChildren(
    option("all", "Todas las zonas"),
    ...Object.entries(regions).map(([value, label]) => option(value, label)),
    option("unassigned", "Sin zona asignada"),
  );
  for (const id of [
    "exercise-search",
    "exercise-category",
    "exercise-region",
    "session-exercise",
  ])
    $(id).addEventListener(
      id.endsWith("category") || id.endsWith("region") ? "change" : "input",
      refreshExercisePicker,
    );
  document.addEventListener("custom-exercises-changed", refreshExercisePicker);
  $("exercise-picker").addEventListener("toggle", () => {
    if ($("exercise-picker").open) loadCustomExercises();
  });
  $("exercise-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  clearExercisePicker();
}
