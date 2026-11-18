const $ = (id) => document.getElementById(id);
const sessionFields = ["evolution", "passive", "exercise"];
let appointment = null,
  session = null,
  appointmentBaseline = null,
  sessionBaseline = null,
  patients = [],
  appointments = [],
  loadedDay = null,
  newMode = false;
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
  loadedDay = null;
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
}
function dayShift(day, amount) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
function localInput(utc) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(utc))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const clinicToday = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function installAgendaTools({ client, run, isAuthorized, message }) {
  $("agenda-date").value = clinicToday();
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
  }
  function lockEditors() {
    $("appointment-fields").disabled = true;
    $("session-fields").disabled = true;
  }
  function renderWeek(day) {
    const date = new Date(day + "T12:00:00Z"),
      monday = dayShift(day, -((date.getUTCDay() + 6) % 7));
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 7; i++) {
      const value = dayShift(monday, i),
        button = document.createElement("button");
      button.type = "button";
      button.textContent = new Intl.DateTimeFormat("es-ES", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
      }).format(new Date(value + "T12:00:00Z"));
      button.setAttribute("aria-pressed", String(value === day));
      button.addEventListener("click", () => requestDay(value));
      fragment.append(button);
    }
    $("agenda-week").replaceChildren(fragment);
  }
  function renderPatients() {
    const previous = $("appointment-patient").value,
      options = [...patients];
    if (appointment && !options.some((p) => p.id === appointment.patient_id))
      options.push({
        id: appointment.patient_id,
        name: appointment.patient_name,
      });
    $("appointment-patient").replaceChildren();
    for (const p of options) {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      $("appointment-patient").append(option);
    }
    if (options.some((p) => p.id === previous))
      $("appointment-patient").value = previous;
  }
  async function loadDay(day, isCurrent) {
    const { data, error } = await client.rpc("clinical_agenda_list_test", {
      p_day: day,
    });
    if (!isCurrent()) return false;
    if (error) {
      fail(error);
      return false;
    }
    if (
      !data ||
      !Array.isArray(data.appointments) ||
      !Array.isArray(data.patients)
    )
      throw new Error();
    loadedDay = day;
    patients = data.patients;
    appointments = data.appointments;
    $("agenda-date").value = day;
    $("agenda-loaded-day").textContent =
      `Agenda del ${day.split("-").reverse().join("/")} · hora de la clínica (Europe/Madrid)`;
    renderWeek(day);
    renderPatients();
    const fragment = document.createDocumentFragment();
    for (const row of appointments) {
      const item = document.createElement("li"),
        button = document.createElement("button");
      button.type = "button";
      const status = {
        scheduled: "Programada",
        cancelled: "Cancelada",
        completed: "Realizada",
      }[row.status];
      button.textContent = `${localInput(row.starts_at).slice(11)}–${localInput(row.ends_at).slice(11)} · ${row.patient_name} · ${status}`;
      button.addEventListener("click", () =>
        run(async (current) => {
          if (isAuthorized() && confirmDiscard()) await open(row.id, current);
        }),
      );
      item.append(button);
      fragment.append(item);
    }
    $("agenda-list").replaceChildren(fragment);
    return true;
  }
  function resetEditor() {
    appointment = session = appointmentBaseline = sessionBaseline = null;
    newMode = false;
    $("agenda-editor").hidden = true;
    $("session-form").hidden = true;
    sessionFields.forEach((f) => ($(`session-${f}`).value = ""));
  }
  function requestDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    run(async (isCurrent) => {
      if (!isAuthorized()) return;
      if (!confirmDiscard()) {
        $("agenda-date").value = loadedDay ?? clinicToday();
        return;
      }
      lockEditors();
      try {
        if (await loadDay(day, isCurrent)) {
          resetEditor();
          message(
            appointments.length
              ? "Agenda ficticia cargada. Elige una cita o prepara una nueva."
              : "No hay citas ficticias en este día.",
          );
        }
      } finally {
        if (isCurrent()) restoreLocks();
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
  async function open(id, isCurrent) {
    lockEditors();
    try {
      if (!(await loadDay($("agenda-date").value, isCurrent))) return;
      const row = appointments.find((a) => a.id === id);
      if (!row) {
        message(
          "La cita ya no está en este día. Revisa la agenda actualizada.",
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
    requestDay($("agenda-date").value),
  );
  $("agenda-date").addEventListener("change", () =>
    requestDay($("agenda-date").value),
  );
  $("agenda-prev").addEventListener("click", () =>
    requestDay(dayShift($("agenda-date").value, -1)),
  );
  $("agenda-next").addEventListener("click", () =>
    requestDay(dayShift($("agenda-date").value, 1)),
  );
  renderWeek($("agenda-date").value);
  $("agenda-new").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !confirmDiscard()) return;
      lockEditors();
      try {
        if (!(await loadDay($("agenda-date").value, isCurrent))) return;
        if (!patients.length) {
          message(
            "Prepara primero los dos pacientes ficticios; solo se cita al que está activo.",
          );
          return;
        }
        resetEditor();
        newMode = true;
        renderPatients();
        $("appointment-patient").value = patients[0].id;
        $("appointment-start").value = $("agenda-date").value + "T09:00";
        $("appointment-minutes").value = "45";
        $("appointment-status").value = "scheduled";
        appointmentBaseline = appointmentValues();
        $("agenda-editor-title").textContent = "Nueva cita ficticia";
        $("agenda-editor").hidden = false;
        restoreLocks();
        message("Prepara la fecha, hora y duración de la cita ficticia.");
      } finally {
        if (isCurrent()) restoreLocks();
      }
    }),
  );
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
        sessionBaseline = sessionValues();
        $("session-form").hidden = false;
        $("session-state").textContent =
          data.status === "cancelled"
            ? "Cita cancelada: no admite registrar sesión."
            : "Cita preparada para registrar una sesión ficticia.";
        if (await loadDay(localInput(data.starts_at).slice(0, 10), isCurrent))
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
        await loadDay(localInput(appointment.starts_at).slice(0, 10), isCurrent)
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
