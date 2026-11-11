/* Validate and preview backups before the user explicitly replaces local data. */
let pendingImport = null;
let importRequest = 0;
function backupCounts(snapshot) {
  return [
    snapshot.patients.length,
    snapshot.appointments.length,
    snapshot.patients.reduce(
      (total, patient) => total + (patient.notes || []).length,
      0,
    ),
    (snapshot.exerciseCatalog || []).length,
  ];
}
async function importData(file) {
  if (!file) return;
  const request = ++importRequest;
  pendingImport = null;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw Error("La copia supera el límite de 5 MB.");
    const incoming = validateData(JSON.parse(await file.text()));
    // A late file read must not interrupt a different page or open form.
    if (request !== importRequest || page !== "copias" || $("modal").open)
      return;
    pendingImport = incoming;
    const before = backupCounts(data),
      after = backupCounts(incoming);
    openModal(
      "Revisar copia antes de importar",
      `
      <p>Archivo: <b class="backup-filename">${esc(file.name)}</b></p>
      <p>La copia es válida. Comprueba el resumen antes de sustituir los datos de esta demo.</p>
      <table><caption>Comparación de datos ficticios</caption>
        <thead><tr><th scope="col">Contenido</th><th scope="col">Actuales</th><th scope="col">En la copia</th></tr></thead>
        <tbody>${["Pacientes", "Citas", "Sesiones", "Ejercicios añadidos"].map((label, i) => `<tr><th scope="row">${label}</th><td>${before[i]}</td><td>${after[i]}</td></tr>`).join("")}</tbody>
      </table>
      <p><b>La importación sustituye todos los datos; no los combina.</b> Una copia vacía también puede borrar los datos actuales.</p>
      <div class="actions"><button onclick="exportData()">Descargar copia actual antes de importar</button>${recoverySource !== null ? '<button onclick="downloadRecovery()">Descargar original para recuperación</button>' : ""}</div>
      <p class="formnote">La copia actual no incluye formularios ni informes sin guardar. Los archivos no se suben a ningún servidor. Usa solo datos ficticios.</p>
      <label class="report-check"><input type="checkbox" id="importReviewed" onchange="$('applyImportButton').disabled=!this.checked"> Entiendo que se sustituirán los datos actuales.</label>
      <div class="actions"><button class="primary" id="applyImportButton" disabled onclick="applyImport()">Sustituir datos e importar</button><button onclick="closeModal()">Cancelar importación</button></div>`,
    );
  } catch (error) {
    if (request === importRequest)
      alert("No se pudo importar el archivo: " + error.message);
  }
}
function applyImport() {
  if (!pendingImport || !$("modal").open || !$("importReviewed")?.checked)
    return;
  const previousRecovery = recoverySource;
  recoverySource = null;
  data = structuredClone(pendingImport);
  if (!save()) {
    recoverySource = previousRecovery;
    return;
  }
  pendingImport = null;
  closeModal();
  render();
  storageMessage("Copia importada y guardada en este navegador.");
}
function clearPendingImport() {
  pendingImport = null;
  importRequest++;
}
