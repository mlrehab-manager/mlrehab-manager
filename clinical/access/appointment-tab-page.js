import { installAppShell } from "./app-shell.js";
import { setDataMode, modeText } from "./data-mode.js";
import { connectPatientTab } from "./patient-tabs.js";
import {
  installAgendaTools,
  clearAgendaData,
  hasAgendaChanges,
} from "./agenda-tools.js";
import {
  installCustomExercises,
  clearCustomExerciseData,
} from "./custom-exercises.js";

const $ = (id) => document.getElementById(id);

export async function installAppointmentTabPage() {
  let active = false,
    busy = false,
    epoch = 0;
  document.body.classList.add("is-patient-tab", "is-appointment-tab");
  document.title = "Cita y tratamiento · MLREHAB";
  $("access-title").textContent = "Cita y tratamiento";
  const returnLink = document.createElement("a");
  returnLink.href = location.pathname;
  returnLink.textContent = "Abrir MLREHAB";
  $("auth-feedback").append(returnLink);
  const message = (value) => {
    $("status").textContent = modeText(value);
  };
  message("Abriendo cita y tratamiento en esta pestaña…");
  const bridge = connectPatientTab((reason) => {
    epoch++;
    active = false;
    clearAgendaData();
    clearCustomExerciseData();
    $("complete").hidden = true;
    message(reason || "El acceso ha terminado. Vuelve a la pestaña principal.");
  });
  async function run(operation) {
    if (busy || !active) return;
    busy = true;
    const current = epoch;
    $("agenda-editor")
      .querySelectorAll("button")
      .forEach((button) => {
        button.disabled = true;
      });
    try {
      await operation(() => active && epoch === current);
    } catch {
      if (epoch === current)
        message("No se ha podido confirmar la operación. Tu texto sigue aquí.");
    } finally {
      busy = false;
      $("agenda-editor")
        .querySelectorAll("button")
        .forEach((button) => {
          button.disabled = false;
        });
      bridge.draft(hasAgendaChanges());
    }
  }
  const patientId = await bridge.ready;
  const context = bridge.context();
  if (!patientId || !bridge.isOpen() || !context?.appointmentId || !context.day)
    return;
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
      "No se ha podido confirmar el acceso. Vuelve a abrir la cita desde la agenda.",
    );
    return;
  }
  setDataMode(checked.data.data_mode);
  active = true;
  $("complete").hidden = false;
  const shell = installAppShell({ isAuthorized: () => active });
  shell.show("agenda");
  $("workspace-title").textContent = "Cita y tratamiento";
  document.title = "Cita y tratamiento · MLREHAB";
  const notice = document.createElement("p");
  notice.className = "patient-tab-notice";
  notice.textContent =
    "Cita y tratamiento en una pestaña nueva · Mantén abierta la agenda principal";
  $("agenda-editor").prepend(notice);
  $("agenda-close").textContent = "Cerrar pestaña";
  installCustomExercises({ client, run, isAuthorized: () => active, message });
  const controller = installAgendaTools({
    client,
    run,
    isAuthorized: () => active,
    message,
    onFinish: () => bridge.close(),
  });
  for (const type of ["input", "change"])
    $("agenda-editor").addEventListener(type, () =>
      bridge.draft(hasAgendaChanges()),
    );
  const bar = document.createElement("div");
  bar.className = "patient-finish-bar";
  const finish = document.createElement("button");
  finish.id = "agenda-finish";
  finish.type = "button";
  finish.className = "primary";
  finish.textContent = "Guardar y cerrar pestaña";
  finish.addEventListener("click", () =>
    run(async (isCurrent) => {
      if (await controller.saveAndFinish(isCurrent)) bridge.close();
    }),
  );
  bar.append(finish);
  $("agenda-editor").append(bar);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.id = "appointment-tab-retry";
  retry.textContent = "Reintentar abrir cita";
  retry.hidden = true;
  $("app-feedback").append(retry);
  async function open() {
    retry.hidden = true;
    await controller.openAppointment(context.appointmentId, context.day);
    if (active) retry.hidden = !$("agenda-editor").hidden;
  }
  retry.addEventListener("click", open);
  await open();
}
