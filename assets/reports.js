/* Reports are temporary drafts: they never alter clinical records or backups. */
let reportDraft = null;
const reportSections = [
  ["history", "Anamnesis"],
  ["background", "Antecedentes relevantes"],
  ["exam", "Exploración física"],
  ["rom", "ROM"],
  ["strength", "Dinamometría"],
  ["diagnosis", "Diagnóstico de fisioterapia"],
  ["goals", "Objetivos terapéuticos"],
  ["treatment", "Plan de tratamiento"],
  ["sessions", "Evolución de todas las sesiones"],
];
function reportSectionText(patient, key) {
  return key === "sessions"
    ? (patient.notes || []).map((n) => `${n.date}\n${n.text}`).join("\n\n")
    : (patient[key] || "").trim();
}
function startReport() {
  const patient = data.patients.find((p) => p.id === currentPatient);
  if (!patient) return;
  reportDraft = { patientId: patient.id, patientName: patient.name };
  openModal(
    "Preparar informe de demostración",
    `
    <p>Elige los apartados para el informe de <b>${esc(patient.name)}</b>. Ninguno se incluye por defecto.</p>
    <p class="formnote">Solo datos ficticios. El borrador es temporal y no modifica la historia clínica.</p>
    <fieldset class="report-options"><legend>Apartados que quieres incluir</legend>
      ${reportSections
        .map(([key, label]) => {
          const available = Boolean(reportSectionText(patient, key));
          return `<label><input type="checkbox" name="reportSection" value="${key}" ${available ? "" : "disabled"}> <span>${label}${available ? "" : " · Sin registrar"}</span></label>`;
        })
        .join("")}
    </fieldset>
    <p id="reportError" role="alert"></p>
    <button class="primary" onclick="composeReport()">Continuar y editar</button>`,
  );
}
function composeReport() {
  const patient = data.patients.find((p) => p.id === reportDraft?.patientId);
  if (!patient) return;
  const selected = new Set(
    [...document.querySelectorAll('input[name="reportSection"]:checked')].map(
      (el) => el.value,
    ),
  );
  if (!selected.size) {
    $("reportError").textContent = "Selecciona al menos un apartado.";
    return;
  }
  Object.assign(reportDraft, {
    title: "Informe de fisioterapia",
    date: localDate(),
    text: reportSections
      .filter(([key]) => selected.has(key))
      .map(([key, label]) => `${label}\n${reportSectionText(patient, key)}`)
      .join("\n\n"),
  });
  // Update the open dialog without closing it, preserving the native focus trap.
  $("modalTitle").textContent = "Revisar informe de demostración";
  $("modal").classList.add("report-dialog");
  $("modalBody").innerHTML = `
    <p class="formnote">Edita el texto y revisa la vista previa antes de imprimir. Estos cambios solo afectan al borrador.</p>
    <div class="report-layout"><div>
      <div class="field"><label for="reportTitle">Título del informe</label><input id="reportTitle" maxlength="150" value="${esc(reportDraft.title)}" oninput="updateReport()"></div>
      <div class="field"><label for="reportDate">Fecha del informe</label><input id="reportDate" type="date" value="${reportDraft.date}" oninput="updateReport()"></div>
      <div class="field"><label for="reportText">Contenido del informe</label><textarea id="reportText" oninput="updateReport()">${esc(reportDraft.text)}</textarea></div>
    </div><section aria-label="Vista previa del informe"><h3>Vista previa</h3><article id="reportPreview" class="report-paper"></article></section></div>
    <p id="reportError" role="alert"></p>
    <label class="report-check"><input id="reportReviewed" type="checkbox" onchange="$('printReportButton').disabled=!this.checked"> He revisado el informe ficticio.</label>
    <div class="actions"><button id="printReportButton" class="primary" disabled onclick="printReport()">Imprimir / Guardar PDF</button><button onclick="closeModal()">Descartar borrador</button></div>
    <p class="formnote">En iPad, el botón abre las opciones de impresión de Safari. Desde la vista de impresión puedes ampliar la hoja y compartirla o guardarla como PDF en Archivos. El borrador no se guarda al cerrar.</p>`;
  renderReportPreview();
  $("reportTitle").focus();
}
function updateReport() {
  if (!reportDraft || !$("reportText")) return;
  Object.assign(reportDraft, {
    title: $("reportTitle").value,
    date: $("reportDate").value,
    text: $("reportText").value,
  });
  $("reportReviewed").checked = false;
  $("printReportButton").disabled = true;
  $("reportError").textContent = "";
  renderReportPreview();
}
function reportMarkup() {
  return `<header class="report-heading"><strong>MLREHAB</strong><span>MANAGER</span></header>
    <p class="report-demo">DEMOSTRACIÓN · DATOS FICTICIOS · SIN VALIDEZ CLÍNICA</p>
    <h1>${esc(reportDraft.title)}</h1>
    <p><b>Paciente ficticio:</b> ${esc(reportDraft.patientName)} · ${esc(reportDraft.patientId)}</p>
    <p><b>Fecha:</b> ${esc(reportDraft.date)}</p>
    <div class="report-content">${esc(reportDraft.text)}</div>
    <footer>Informe de demostración. No utilizar para atención sanitaria real.</footer>`;
}
function renderReportPreview() {
  $("reportPreview").innerHTML = reportMarkup();
}
function printReport() {
  if (!reportDraft || !$("reportReviewed")?.checked) return;
  if (
    !reportDraft.title.trim() ||
    !validDate(reportDraft.date) ||
    !reportDraft.text.trim()
  ) {
    $("reportError").textContent =
      "Completa título, fecha válida y contenido antes de imprimir.";
    return;
  }
  $("reportPrint").innerHTML = reportMarkup();
  document.body.classList.add("printing-report");
  try {
    window.print();
  } catch {
    finishReportPrint();
    $("reportError").textContent =
      "No se pudo abrir la impresión. Prueba desde Safari.";
  }
}
function finishReportPrint() {
  document.body.classList.remove("printing-report");
  $("reportPrint").replaceChildren();
}
window.addEventListener("afterprint", finishReportPrint);
// Both the close button and Escape explicitly discard the temporary draft.
function discardReport() {
  if (reportDraft && !confirm("¿Descartar este borrador de informe ficticio?"))
    return false;
  reportDraft = null;
  finishReportPrint();
  $("modal").classList.remove("report-dialog");
  return true;
}
$("modal").addEventListener("cancel", (event) => {
  if (reportDraft) {
    event.preventDefault();
    closeModal();
  }
});
