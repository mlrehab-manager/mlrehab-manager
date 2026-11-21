export const categories = {
  isometric: "Isométricos",
  dynamic: "Dinámicos · Combinados",
  concentric: "Dinámicos · Concéntricos",
  eccentric: "Dinámicos · Excéntricos",
  plyometric: "Pliometría",
  other: "Otros / sin clasificar",
};
export const regions = {
  cervical: "Cuello / cervical",
  shoulder: "Hombro / escápula",
  "elbow-forearm": "Codo / antebrazo",
  "wrist-hand": "Muñeca / mano",
  trunk: "Tronco / columna dorsal y lumbar",
  hip: "Cadera",
  knee: "Rodilla",
  "ankle-foot": "Tobillo / pie",
};
export const key = (value) =>
  value
    .trim()
    .replace(/^[-•]\s*/, "")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
