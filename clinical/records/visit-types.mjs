export const VISIT_TYPES = Object.freeze(["first_visit", "follow_up", "gym"]);
export const VISIT_LABELS = Object.freeze({
  first_visit: "Primera visita",
  follow_up: "Seguimiento",
  gym: "Gimnasio",
  unclassified: "Sin clasificar",
});
export const visitType = (value) =>
  VISIT_TYPES.includes(value) ? value : "unclassified";
