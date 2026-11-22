import {
  dayShift,
  mondayOf,
  localInput,
  shortDate,
  slotAppointments,
  intersectsWeekdays,
  hasVisibleSlot,
  appointmentLabel,
  renderWeeklyCalendar,
} from "./weekly-calendar.js";
import {
  clearExercisePicker,
  refreshExercisePicker,
  installExercisePicker,
} from "./exercise-picker.js";
const $ = (id) => document.getElementById(id);
const sessionFields = ["evolution", "passive", "exercise"];
let appointment = null,
  session = null,
  appointmentBaseline = null,
  sessionBaseline = null,
  patients = [],
  appointments = [],
  loadedAnchor = null,
  loadedWeek = null,
  displayedDay = null,
  newMode = false;
let repaintCalendar = () => {};
const appointmentValues = () => ({
  patient_id: $("appointment-patient").value,
  start: $("appointment-start").value,
  minutes: $("appointment-minutes").value,
  status: $("appointment-status").value,
});
const sessionValues = () =>
  Object.fromEntries(sessionFields.map((f) => [f, $(`session-${f}`).value]));
const changed = (current, baseline) =>
  baseline !== null && JSON.stringify(current) !== JSON.stringify(baseline);
const appointmentDirty = () =>
  !$("agenda-editor").hidden &&
  changed(appointmentValues(), appointmentBaseline);
const sessionDirty = () =>
  !$("session-form").hidden && changed(sessionValues(), sessionBaseline);
export const hasAgendaChanges = () => appointmentDirty() || sessionDirty();
const confirmDiscard = () =>
  !hasAgendaChanges() ||
  window.confirm(
    "Hay cambios sin guardar en la cita o sesión ficticia. ¿Quieres descartarlos?",
  );
export function clearAgendaData() {
  appointment = session = appointmentBaseline = sessionBaseline = null;
  patients = [];
  appointments = [];
  newMode = false;
  loadedAnchor = loadedWeek = null;
  $("agenda-date").value = clinicToday();
  $("agenda-list").removeAttribute("data-weekday-count");
  $("agenda-week").removeAttribute("aria-busy");
  $("agenda-outside-note").hidden = true;
  $("agenda-list").replaceChildren();
  $("agenda-editor").hidden = true;
  $("session-form").hidden = true;
  $("agenda-loaded-day").textContent = "";
  $("agenda-editor-title").textContent = "";
  $("session-state").textContent = "";
  $("appointment-patient").replaceChildren();
  $("appointment-start").value = "";
  $("appointment-minutes").value = "45";
  $("appointment-status").value = "scheduled";
  sessionFields.forEach((f) => ($(`session-${f}`).value = ""));
  clearExercisePicker();
  repaintCalendar();
}
const clinicToday = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const validDay = (day) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  day >= "2020-01-01" &&
  day <= "2100-12-31" &&
  Number.isFinite(Date.parse(day));
export function installAgendaTools({ client, run, isAuthorized, message }) {
  $("agenda-date").value = clinicToday();
  installExercisePicker({
    isEditable: () =>
      isAuthorized() &&
      !$("session-form").hidden &&
      !$("session-fields").disabled,
    message,
  });
  function fail(error, save = false) {
    if (["42501", "PGRST301", "PGRST303"].includes(error?.code)) {
      clearAgendaData();
      message(
        "La sesión no permite acceder a la agenda. Sal y vuelve a entrar.",
      );
    } else if (error?.code === "23P01")
      message(
        "La cita se solapa con otra programada o realizada. Elige otro horario; tus datos siguen aquí.",
      );
    else if (error?.code === "40001")
      message(
        "La cita o sesión ha cambiado. Tu texto sigue aquí. Carga la versión guardada antes de reintentar.",
      );
    else if (["22023", "22007", "22008"].includes(error?.code))
      message(
        "Revisa fecha, hora, duración y textos. Las horas ambiguas o inexistentes por cambio horario no se admiten.",
      );
    else
      message(
        save
          ? "No se pudo confirmar el guardado. Conserva tu borrador y carga la versión guardada antes de reintentar."
          : "No se pudo cargar la agenda. Comprueba la conexión y vuelve a intentarlo.",
      );
  }
  function restoreLocks() {
    $("appointment-fields").disabled =
      !!appointment &&
      (appointment.status === "completed" || appointment.patient_archived);
    $("appointment-patient-lock").disabled = !!appointment;
    $("session-fields").disabled =
      !appointment ||
      appointment.status === "cancelled" ||
      appointment.patient_archived;
    refreshExercisePicker();
  }
  function lockEditors() {
    $("appointment-fields").disabled = true;
    $("session-fields").disabled = true;
  }
  function renderWeek(day) {
    displayedDay = day;
    renderWeeklyCalendar({
      anchor: day,
      appointments,
      loaded: loadedWeek === mondayOf(day),
      onSlot: (date, hour) => prepareNew(date, hour),
      onAppointment: (id) =>
        run(async (current) => {
          if (isAuthorized() && confirmDiscard()) await open(id, current);
        }),
    });
  }
  repaintCalendar = () => renderWeek($("agenda-date").value || clinicToday());
  function renderPatients() {
    const previous = $("appointment-patient").value,
      options = [...patients];
    if (appointment && !options.some((p) => p.id === appointment.patient_id))
      options.push({
        id: appointment.patient_id,
        name: appointment.patient_name,
      });
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona un paciente";
    $("appointment-patient").replaceChildren(placeholder);
    for (const p of options) {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      $("appointment-patient").append(option);
    }
    if (options.some((p) => p.id === previous))
      $("appointment-patient").value = previous;
  }
  async function loadWeek(day, isCurrent) {
    let committed = false;
    $("agenda-week").setAttribute("aria-busy", "true");
    try {
      const { data, error } = await client.rpc("clinical_agenda_week", {
        p_day: day,
      });
      if (!isCurrent()) return false;
      if (error) {
        fail(error);
        return false;
      }
      const monday = mondayOf(day);
      if (
        !data ||
        data.week_start !== monday ||
        data.week_end !== dayShift(monday, 4) ||
        !Array.isArray(data.appointments) ||
        !Array.isArray(data.patients)
      )
        throw new Error();
      loadedAnchor = day;
      loadedWeek = monday;
      patients = data.patients;
      appointments = data.appointments;
      $("agenda-date").value = day;
      $("agenda-loaded-day").textContent =
        `Semana del ${shortDate(monday)} al ${shortDate(dayShift(monday, 4))} · hora de la clínica (Europe/Madrid)`;
      renderWeek(day);
      renderPatients();
      const fragment = document.createDocumentFragment();
      for (const row of appointments) {
        const item = document.createElement("li"),
          button = document.createElement("button");
        button.type = "button";
        button.textContent = appointmentLabel(row, true);
        button.addEventListener("click", () =>
          run(async (current) => {
            if (isAuthorized() && confirmDiscard()) await open(row.id, current);
          }),
        );
        item.append(button);
        fragment.append(item);
      }
      $("agenda-list").dataset.weekdayCount = String(
        appointments.filter((row) => intersectsWeekdays(row, monday)).length,
      );
      $("agenda-list").replaceChildren(fragment);
      const outside = appointments.filter(
        (row) => !hasVisibleSlot(row, monday),
      ).length;
      $("agenda-outside-note").textContent =
        `${outside} citas guardadas fuera de la cuadrícula. Puedes abrirlas en «Listado de citas guardadas».`;
      $("agenda-outside-note").hidden = outside === 0;
      committed = true;
      return true;
    } finally {
      if (isCurrent()) {
        $("agenda-week").removeAttribute("aria-busy");
        if (!committed)
          $("agenda-date").value =
            loadedAnchor ?? displayedDay ?? clinicToday();
      }
    }
  }
  function resetEditor() {
    appointment = session = appointmentBaseline = sessionBaseline = null;
    newMode = false;
    $("agenda-editor").hidden = true;
    $("session-form").hidden = true;
    sessionFields.forEach((f) => ($(`session-${f}`).value = ""));
    clearExercisePicker();
  }
  function requestWeek(day) {
    if (!validDay(day)) {
      $("agenda-date").value = loadedAnchor ?? displayedDay ?? clinicToday();
      message("Elige una fecha entre 2020 y 2100.");
      return;
    }
    run(async (isCurrent) => {
      if (!isAuthorized()) return;
      if (!confirmDiscard()) {
        $("agenda-date").value = loadedAnchor ?? displayedDay ?? clinicToday();
        return;
      }
      lockEditors();
      try {
        if (await loadWeek(day, isCurrent)) {
          resetEditor();
          message(
            appointments.length
              ? "Semana cargada. Toca un hueco para añadir una cita o abre una cita guardada."
              : "No hay citas guardadas en esta semana.",
          );
        }
      } finally {
        if (isCurrent()) {
          if (loadedAnchor) $("agenda-date").value = loadedAnchor;
          restoreLocks();
        }
      }
    });
  }
  function fillAppointment(row) {
    appointment = row;
    newMode = false;
    renderPatients();
    $("appointment-patient").value = row.patient_id;
    $("appointment-start").value = localInput(row.starts_at);
    $("appointment-minutes").value = String(
      (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000,
    );
    $("appointment-status").value =
      row.status === "completed" ? "completed" : row.status;
    appointmentBaseline = appointmentValues();
    $("agenda-editor-title").textContent =
      `${row.patient_name} · cita versión ${row.revision}`;
    $("agenda-editor").hidden = false;
    restoreLocks();
  }
  async function open(id, isCurrent, reload = true) {
    lockEditors();
    try {
      if (
        reload &&
        !(await loadWeek(loadedAnchor ?? $("agenda-date").value, isCurrent))
      )
        return;
      const row = appointments.find((a) => a.id === id);
      if (!row) {
        message(
          "La cita ya no está en esta semana. Revisa la agenda actualizada.",
        );
        return;
      }
      const { data, error } = await client.rpc("clinical_session_get_test", {
        p_appointment_id: id,
      });
      if (!isCurrent()) return;
      if (error) {
        fail(error);
        return;
      }
      if (
        data &&
        (data.appointment_id !== id || data.patient_id !== row.patient_id)
      )
        throw new Error();
      clearExercisePicker();
      fillAppointment(row);
      session = data;
      sessionFields.forEach((f) => ($(`session-${f}`).value = data?.[f] ?? ""));
      sessionBaseline = sessionValues();
      $("session-form").hidden = false;
      $("session-state").textContent = row.patient_archived
        ? "Paciente archivado: solo lectura."
        : row.status === "cancelled"
          ? "Cita cancelada: no admite registrar sesión."
          : data
            ? `Sesión guardada · versión ${data.revision}`
            : "Puedes registrar la sesión de esta cita. Al guardarla quedará realizada.";
      restoreLocks();
      message("Cita y sesión ficticias cargadas desde la base privada.");
    } finally {
      if (isCurrent()) restoreLocks();
    }
  }
  $("agenda-load").addEventListener("click", () =>
    requestWeek($("agenda-date").value),
  );
  $("agenda-date").addEventListener("change", () =>
    requestWeek($("agenda-date").value),
  );
  $("agenda-prev").addEventListener("click", () =>
    requestWeek(dayShift($("agenda-date").value, -7)),
  );
  $("agenda-next").addEventListener("click", () =>
    requestWeek(dayShift($("agenda-date").value, 7)),
  );
  $("agenda-today").addEventListener("click", () => requestWeek(clinicToday()));
  renderWeek($("agenda-date").value);
  function prepareNew(day, hour = 9) {
    if (!validDay(day)) {
      message("Elige una fecha entre 2020 y 2100.");
      return;
    }
    let focusPatient = false;
    const completed = run(async (isCurrent) => {
      if (!isAuthorized() || !confirmDiscard()) return;
      lockEditors();
      try {
        if (!(await loadWeek(day, isCurrent))) return;
        const occupied = slotAppointments(appointments, day, hour).find(
          (row) => row.status !== "cancelled",
        );
        if (occupied) {
          await open(occupied.id, isCurrent, false);
          if (isCurrent())
            message(
              "Ese hueco ya tiene una cita. Se ha abierto la cita guardada.",
            );
          return;
        }
        if (!patients.length) {
          message("Crea primero una ficha de paciente activa en Pacientes.");
          return;
        }
        resetEditor();
        newMode = true;
        renderPatients();
        $("appointment-patient").value = "";
        $("appointment-start").value =
          `${day}T${String(hour).padStart(2, "0")}:00`;
        $("appointment-minutes").value = "45";
        $("appointment-status").value = "scheduled";
        appointmentBaseline = appointmentValues();
        $("agenda-editor-title").textContent = "Nueva cita ficticia";
        $("agenda-editor").hidden = false;
        restoreLocks();
        message(
          "Elige el paciente y confirma la cita. La fecha y la hora ya están preparadas.",
        );
        focusPatient = true;
      } finally {
        if (isCurrent()) restoreLocks();
      }
    });
    return Promise.resolve(completed).then(() => {
      if (
        focusPatient &&
        isAuthorized() &&
        newMode &&
        !$("agenda-panel").hidden
      ) {
        $("agenda-editor").scrollIntoView({ block: "start" });
        $("appointment-patient").focus({ preventScroll: true });
      }
    });
  }
  $("agenda-new").addEventListener("click", () => {
    const day = $("agenda-date").value || loadedAnchor || clinicToday(),
      monday = mondayOf(day);
    prepareNew(day > dayShift(monday, 4) ? monday : day);
  });
  $("appointment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized() || (!newMode && !appointment)) return;
      if (sessionDirty()) {
        message(
          "Guarda o descarta el borrador de sesión antes de cambiar la cita.",
        );
        return;
      }
      if (
        appointment &&
        (appointment.status === "completed" || appointment.patient_archived)
      )
        return;
      const sent = appointmentValues(),
        previous = appointment;
      lockEditors();
      try {
        const { data, error } = await client.rpc(
          "clinical_appointment_save_test",
          {
            p_id: previous?.id ?? null,
            p_expected_revision: previous?.revision ?? null,
            p_patient_id: sent.patient_id,
            p_start_local: sent.start,
            p_minutes: Number(sent.minutes),
            p_status: sent.status,
          },
        );
        if (!isCurrent()) return;
        if (error) {
          fail(error, true);
          return;
        }
        if (
          !data?.id ||
          data.revision !== (previous ? previous.revision + 1 : 1)
        ) {
          fail(null, true);
          return;
        }
        fillAppointment({
          ...data,
          patient_name:
            patients.find((p) => p.id === data.patient_id)?.name ??
            previous?.patient_name,
          patient_archived: false,
          session_id: null,
        });
        session = null;
        sessionFields.forEach((f) => ($(`session-${f}`).value = ""));
        clearExercisePicker();
        sessionBaseline = sessionValues();
        $("session-form").hidden = false;
        $("session-state").textContent =
          data.status === "cancelled"
            ? "Cita cancelada: no admite registrar sesión."
            : "Cita preparada para registrar una sesión ficticia.";
        if (await loadWeek(localInput(data.starts_at).slice(0, 10), isCurrent))
          message("Cita ficticia guardada en la agenda privada.");
      } finally {
        if (isCurrent()) restoreLocks();
      }
    });
  });
  $("session-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (
        !isAuthorized() ||
        !appointment ||
        appointment.status === "cancelled" ||
        appointment.patient_archived
      )
        return;
      if (appointmentDirty()) {
        message(
          "Guarda o descarta los cambios de la cita antes de registrar la sesión.",
        );
        return;
      }
      const sent = sessionValues(),
        previous = session;
      const { data, error } = await client.rpc("clinical_session_save_test", {
        p_id: previous?.id ?? null,
        p_expected_revision: previous?.revision ?? null,
        p_appointment_id: appointment.id,
        p_evolution: sent.evolution,
        p_passive: sent.passive,
        p_exercise: sent.exercise,
      });
      if (!isCurrent()) return;
      if (error) {
        fail(error, true);
        return;
      }
      if (
        !data?.id ||
        data.appointment_id !== appointment.id ||
        data.revision !== (previous ? previous.revision + 1 : 1)
      ) {
        fail(null, true);
        return;
      }
      session = data;
      sessionBaseline = sent;
      appointment = {
        ...appointment,
        status: "completed",
        revision: appointment.revision + (previous ? 0 : 1),
        session_id: data.id,
      };
      appointmentBaseline = appointmentValues();
      $("appointment-status").value = "completed";
      appointmentBaseline = appointmentValues();
      $("session-state").textContent =
        `Sesión guardada · versión ${data.revision}`;
      restoreLocks();
      if (
        await loadWeek(
          localInput(appointment.starts_at).slice(0, 10),
          isCurrent,
        )
      )
        message(
          sessionDirty()
            ? "Sesión guardada. Hay texto posterior sin guardar."
            : "Sesión ficticia guardada; la cita queda realizada.",
        );
    });
  });
  $("agenda-refresh").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (isAuthorized() && appointment && confirmDiscard())
        await open(appointment.id, isCurrent);
    }),
  );
  window.addEventListener("beforeunload", (event) => {
    if (hasAgendaChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
