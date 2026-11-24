const $ = (id) => document.getElementById(id);
import { VISIT_LABELS, visitType } from "../records/visit-types.mjs";
import { fitCalendar } from "./calendar-layout.js";
const abbreviations = {
  first_visit: "PV",
  follow_up: "S",
  gym: "G",
  unclassified: "—",
};
export function clearCalendarDialogs() {
  const dialog = $("agenda-group-picker");
  if (dialog.open) dialog.close();
  $("agenda-group-list").replaceChildren();
}
function chooseAppointment(entries, onAppointment) {
  const list = $("agenda-group-list");
  list.replaceChildren();
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = appointmentLabel(entry, true);
    button.className = `agenda-choice type-${visitType(entry.visit_type)}`;
    button.addEventListener("click", () => {
      clearCalendarDialogs();
      onAppointment(entry.id);
    });
    list.append(button);
  }
  $("agenda-group-close").onclick = clearCalendarDialogs;
  $("agenda-group-picker").onclose = () =>
    $("agenda-group-list").replaceChildren();
  $("agenda-group-picker").showModal();
}
export const HOURS = Array.from({ length: 12 }, (_, i) => i + 8).filter(
  (hour) => hour !== 14,
);
export function dayShift(day, amount) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function mondayOf(day) {
  return dayShift(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
}
const clinicFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function localInput(utc) {
  const parts = Object.fromEntries(
    clinicFormatter
      .formatToParts(new Date(utc))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export const shortDate = (day) => day.split("-").reverse().join("/");
export function slotAppointments(appointments, day, hour, intervals) {
  const start = `${day}T${String(hour).padStart(2, "0")}:00`;
  const end = `${day}T${String(hour + 1).padStart(2, "0")}:00`;
  return appointments.filter((row) => {
    const bounds = intervals?.get(row.id) ?? [
      localInput(row.starts_at),
      localInput(row.ends_at),
    ];
    return bounds[0] < end && bounds[1] > start;
  });
}
export function intersectsWeekdays(row, monday) {
  return (
    localInput(row.starts_at) < `${dayShift(monday, 5)}T00:00` &&
    localInput(row.ends_at) > `${monday}T00:00`
  );
}
export function hasVisibleSlot(row, monday) {
  const intervals = new Map([
    [row.id, [localInput(row.starts_at), localInput(row.ends_at)]],
  ]);
  for (let i = 0; i < 5; i++)
    if (
      HOURS.some(
        (hour) =>
          slotAppointments([row], dayShift(monday, i), hour, intervals).length,
      )
    )
      return true;
  return false;
}
const statuses = {
  scheduled: "Programada",
  completed: "Realizada",
  cancelled: "Cancelada",
};
export function appointmentLabel(row, withDate = false) {
  const start = localInput(row.starts_at),
    end = localInput(row.ends_at);
  return `${withDate ? shortDate(start.slice(0, 10)) + " · " : ""}${start.slice(11)}–${end.slice(11)} · ${row.patient_name} · ${VISIT_LABELS[visitType(row.visit_type)]} · ${statuses[row.status]}`;
}

export function renderWeeklyCalendar({
  anchor,
  appointments,
  loaded,
  onSlot,
  onAppointment,
}) {
  const monday = mondayOf(anchor);
  const intervals = new Map(
    appointments.map((row) => [
      row.id,
      [localInput(row.starts_at), localInput(row.ends_at)],
    ]),
  );
  const table = document.createElement("table");
  table.id = "agenda-calendar";
  const caption = table.createCaption();
  caption.className = "sr-only";
  caption.textContent = `Agenda de lunes ${shortDate(monday)} a viernes ${shortDate(dayShift(monday, 4))}`;
  const heading = table.createTHead().insertRow();
  const timeHeading = document.createElement("th");
  timeHeading.scope = "col";
  timeHeading.textContent = "Hora";
  heading.append(timeHeading);
  for (let i = 0; i < 5; i++) {
    const day = dayShift(monday, i),
      th = document.createElement("th");
    th.scope = "col";
    th.dataset.date = day;
    const name = document.createElement("strong"),
      date = document.createElement("span");
    name.textContent = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(day + "T12:00:00Z"));
    th.setAttribute("aria-label", `${name.textContent} ${shortDate(day)}`);
    name.textContent = new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      timeZone: "UTC",
    })
      .format(new Date(day + "T12:00:00Z"))
      .replace(".", "");
    date.textContent = shortDate(day).slice(0, 5);
    th.append(name, date);
    heading.append(th);
  }
  const body = table.createTBody();
  for (const hour of HOURS) {
    const row = body.insertRow(),
      th = document.createElement("th");
    th.scope = "row";
    th.textContent = `${String(hour).padStart(2, "0")}:00`;
    row.dataset.hour = String(hour);
    row.append(th);
    for (let i = 0; i < 5; i++) {
      const day = dayShift(monday, i),
        cell = row.insertCell();
      cell.dataset.date = day;
      cell.dataset.hour = String(hour);
      const content = document.createElement("div");
      content.className = "agenda-cell-content";
      cell.append(content);
      const entries = slotAppointments(
        appointments,
        day,
        hour,
        intervals,
      ).filter((entry) => entry.status !== "cancelled");
      if (entries.length > 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "agenda-event agenda-event-group type-unclassified";
        const names = document.createElement("strong"),
          count = document.createElement("span");
        names.textContent = entries
          .map((entry) => entry.patient_name)
          .join(" · ");
        count.textContent = `${entries.length} citas`;
        button.append(names, count);
        button.setAttribute(
          "aria-label",
          `${entries.length} citas el ${shortDate(day)} a las ${String(hour).padStart(2, "0")}:00. Elegir una cita.`,
        );
        button.addEventListener("click", () =>
          chooseAppointment(entries, onAppointment),
        );
        content.append(button);
      } else
        for (const entry of entries) {
          const button = document.createElement("button");
          button.type = "button";
          const type = visitType(entry.visit_type);
          button.className = `agenda-event is-${entry.status} type-${type}`;
          button.dataset.appointmentId = entry.id;
          button.setAttribute("aria-label", appointmentLabel(entry, true));
          const name = document.createElement("strong"),
            time = document.createElement("span"),
            state = document.createElement("small");
          name.textContent = entry.patient_name;
          time.textContent = `${localInput(entry.starts_at).slice(11)}–${localInput(entry.ends_at).slice(11)}`;
          state.textContent =
            abbreviations[type] + (entry.status === "completed" ? " · ✓" : "");
          state.title = VISIT_LABELS[type] + " · " + statuses[entry.status];
          const meta = document.createElement("span");
          meta.className = "agenda-event-meta";
          meta.append(time, state);
          button.title = appointmentLabel(entry, true);
          button.append(name, meta);
          button.addEventListener("click", () => onAppointment(entry.id));
          content.append(button);
        }
      if (!entries.some((entry) => entry.status !== "cancelled")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "agenda-slot-add";
        button.dataset.slotDate = day;
        button.dataset.slotHour = String(hour);
        button.disabled = day < "2020-01-01" || day > "2100-12-31";
        button.setAttribute(
          "aria-label",
          `${loaded ? "Añadir" : "Consultar y añadir"} cita el ${shortDate(day)} a las ${String(hour).padStart(2, "0")}:00`,
        );
        button.textContent = "+";
        button.addEventListener("click", () => onSlot(day, hour));
        content.append(button);
      }
    }
  }
  $("agenda-week").replaceChildren(table);
  $("agenda-availability").hidden = loaded;
  $("agenda-view-state").textContent = loaded
    ? "Toca un hueco para elegir paciente o una cita para abrirla."
    : "Semana sin cargar. Toca una casilla o carga la semana para consultar disponibilidad.";
  fitCalendar();
}
