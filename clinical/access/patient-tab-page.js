import { installAppShell } from "./app-shell.js";
import { setDataMode, modeText } from "./data-mode.js";
import {
  installPatientTools,
  clearPatientData,
  hasPatientChanges,
} from "./patient-tools.js";
import { connectPatientTab } from "./patient-tabs.js";

const $ = (id) => document.getElementById(id);
export async function installPatientTabPage() {
  let epoch = 0,
    active = false,
    busy = false;
  document.body.classList.add("is-patient-tab");
  document.title = "Ficha del paciente · MLREHAB";
  $("access-title").textContent = "Ficha del paciente";
  const returnLink = document.createElement("a");
  returnLink.href = location.pathname;
  returnLink.textContent = "Abrir MLREHAB";
  $("auth-feedback").append(returnLink);
  const message = (value) => {
    $("status").textContent = modeText(value);
  };
  message("Abriendo ficha en esta pestaña…");
  const bridge = connectPatientTab((reason) => {
    epoch++;
    active = false;
    clearPatientData();
    $("complete").hidden = true;
    message(reason || "El acceso ha terminado. Vuelve a la pestaña principal.");
  });
  async function run(operation) {
    if (busy || !active) return;
    busy = true;
    const current = epoch;
    $("patient-editor")
      .querySelectorAll("button")
      .forEach((b) => {
        b.disabled = true;
      });
    try {
      await operation(() => epoch === current && active);
    } catch {
      if (epoch === current)
        message("No se ha podido confirmar la operación. Tu texto sigue aquí.");
    } finally {
      busy = false;
      $("patient-editor")
        .querySelectorAll("button")
        .forEach((b) => {
          b.disabled = false;
        });
      bridge.draft(hasPatientChanges());
    }
  }
  const patientId = await bridge.ready;
  if (!patientId || !bridge.isOpen()) return;
  const client = {
    rpc: async (name, args) => {
      const result = await bridge.rpc(name, args);
      if (["42501", "PGRST301", "PGRST303"].includes(result.error?.code))
        bridge.lock(
          "El acceso de la pestaña principal ha terminado. Vuelve a entrar en MLREHAB.",
        );
      return result;
    },
  };
  const checked = await client.rpc("clinical_access_check");
  if (!bridge.isOpen()) return;
  if (
    checked.error ||
    checked.data?.authorized !== true ||
    !["test", "clinical"].includes(checked.data.data_mode)
  ) {
    bridge.lock(
      "No se ha podido confirmar el acceso. Vuelve a abrir la ficha desde MLREHAB.",
    );
    return;
  }
  setDataMode(checked.data.data_mode);
  active = true;
  $("complete").hidden = false;
  const shell = installAppShell({ isAuthorized: () => active });
  shell.show("patients");
  $("patient-back").textContent = "Cerrar ficha";
  $("patient-finish").textContent = "Guardar y cerrar pestaña";
  $("patient-leave-save").textContent = "Guardar y cerrar";
  $("patient-leave-discard").textContent = "Descartar cambios y cerrar";
  $("patient-leave-title").textContent = "Hay cambios sin guardar";
  $("patient-leave-dialog").querySelector("p").textContent =
    "Guarda la ficha antes de cerrar o continúa editándola.";
  const notice = document.createElement("p");
  notice.className = "patient-tab-notice";
  notice.textContent =
    "Ficha en una pestaña nueva · Mantén abierta la pestaña principal";
  $("patient-editor").prepend(notice);
  const controller = installPatientTools({
    client,
    run,
    isAuthorized: () => active,
    message,
    inPatientTab: true,
    onFinish: () => bridge.close(),
  });
  document.addEventListener("mlrehab:patient-state", () =>
    bridge.draft(hasPatientChanges()),
  );
  const retry = document.createElement("button");
  retry.type = "button";
  retry.id = "patient-tab-retry";
  retry.textContent = "Reintentar abrir ficha";
  retry.hidden = true;
  $("app-feedback").append(retry);
  async function open() {
    retry.hidden = true;
    await controller.openPatient(patientId);
    if (active) retry.hidden = !$("patient-editor").hidden;
  }
  retry.addEventListener("click", open);
  await open();
}
