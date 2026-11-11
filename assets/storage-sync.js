/* Detect stale views before a write; never silently reload an open form. */
function showStorageConflict(conflict) {
  $("storageConflict").classList.toggle("hidden", !conflict);
}
function checkStorageConflict() {
  try {
    showStorageConflict(localStorage.getItem(KEY) !== storageBaseline);
  } catch {
    storageMessage(
      "No se puede leer el almacenamiento. Descarga una copia de esta pestaña antes de salir.",
    );
  }
}
function reloadStoredData() {
  if (
    !confirm(
      "¿Cargar los datos guardados? Se descartarán los formularios e informes sin guardar de esta pestaña. Puedes descargar antes una copia de los datos que muestra esta pestaña.",
    )
  )
    return;
  window.location.reload();
}
window.addEventListener("storage", (event) => {
  if (
    event.storageArea === localStorage &&
    (event.key === KEY || event.key === null)
  )
    checkStorageConflict();
});
window.addEventListener("focus", checkStorageConflict);
