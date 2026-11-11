/* Compare actual form values so reverting an edit removes the warning. */
let modalBaseline = null;
function modalFormSnapshot() {
  return JSON.stringify(
    [...$("modalBody").querySelectorAll("input,textarea,select")].map(
      (control) => ({
        id: control.id,
        value: control.value,
        checked:
          control.type === "checkbox" || control.type === "radio"
            ? control.checked
            : undefined,
        selected: control.multiple
          ? [...control.selectedOptions].map((option) => option.value)
          : undefined,
      }),
    ),
  );
}
function markModalClean() {
  modalBaseline = modalFormSnapshot();
}
function hasUnsavedForm() {
  return (
    $("modal").open &&
    !reportDraft &&
    modalBaseline !== null &&
    modalFormSnapshot() !== modalBaseline
  );
}
function confirmFormClose() {
  return (
    !hasUnsavedForm() ||
    confirm(
      "Tienes cambios sin guardar. ¿Quieres descartarlos y cerrar el formulario?",
    )
  );
}
$("modal").addEventListener("cancel", (event) => {
  if (event.defaultPrevented) return; // Reports handle their own discard confirmation.
  event.preventDefault();
  closeModal();
});
window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedForm() && !reportDraft) return;
  event.preventDefault();
  event.returnValue = "";
});
