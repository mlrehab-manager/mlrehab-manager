let mode = "test";
let staticText;
let originals;
export const isClinicalMode = () => mode === "clinical";
export function modeText(value) {
  return isClinicalMode()
    ? value
        .replace(/\bfictici(?:os|as|o|a)\b/gu, "")
        .replace(/de pruebas?/gu, "clínico")
        .replace(/ · prueba/gu, "")
        .replace(/\s{2,}/gu, " ")
        .trim()
    : value;
}
export function setDataMode(next) {
  if (!["test", "clinical"].includes(next))
    throw new Error("Modo no reconocido");
  if (!staticText) {
    originals = new Map(
      ["environment-notice", "backup-scope", "patient-load", "patient-new"].map(
        (id) => [id, document.getElementById(id).textContent],
      ),
    );
    originals.set("heading", document.querySelector("h1").textContent);
    staticText = [];
    const walker = document.createTreeWalker(
      document.querySelector("main"),
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode())
      staticText.push([walker.currentNode, walker.currentNode.textContent]);
  }
  mode = next;
  for (const [id, original] of originals)
    (id === "heading"
      ? document.querySelector("h1")
      : document.getElementById(id)
    ).textContent = modeText(original);
  for (const [node, original] of staticText)
    node.textContent = modeText(original);
  document
    .querySelectorAll("[data-test-only]")
    .forEach((node) => (node.hidden = isClinicalMode()));
  document.getElementById("patient-prepare").hidden = isClinicalMode();
  document.getElementById("patient-create-identity").hidden = !isClinicalMode();
  for (const field of [
    "given_name",
    "family_name",
    "birth_date",
    "phone",
    "email",
  ]) {
    const input = document.getElementById("patient-create-" + field);
    input.disabled = !isClinicalMode();
    input.required =
      isClinicalMode() && ["given_name", "family_name"].includes(field);
    document.getElementById("patient-" + field).required =
      isClinicalMode() && ["given_name", "family_name"].includes(field);
  }
  document.getElementById("patient-create-alias").disabled = isClinicalMode();
  document.getElementById("patient-create-alias").required = !isClinicalMode();
  if (isClinicalMode()) {
    document.querySelector("h1").textContent = "MLREHAB · Consulta";
    document.getElementById("patient-load").textContent = "Cargar pacientes";
    document.getElementById("patient-new").textContent = "Nuevo paciente";
    document.getElementById("environment-notice").textContent =
      "El servidor ha autorizado el acceso al entorno clínico de esta cuenta. Las fichas archivadas se conservan en modo lectura.";
    document.getElementById("backup-scope").textContent =
      "La copia incluye pacientes, citas, sesiones, ejercicios propios, versiones y auditoría. No incluye cuentas, contraseñas ni configuración del proveedor. Guarda la frase separada del archivo.";
  }
}
