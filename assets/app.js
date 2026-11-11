const KEY = "mlrehab-demo-v1";
const sample = {
  patients: [
    {
      id: "P001",
      name: "Paciente de ejemplo 01",
      phone: "",
      birth: "",
      email: "",
      address: "",
      occupation: "",
      activity: "",
      history: "Dolor anterior de rodilla tras correr. Ejemplo ficticio.",
      background: "Sin antecedentes relevantes (ejemplo).",
      exam: "Exploración de ejemplo. No corresponde a una persona real.",
      rom: "Flexión D: 135° · I: 140°\nExtensión: 0° bilateral",
      strength: "Extensión rodilla D: 112 N · I: 128 N",
      diagnosis: "Ejemplo de diagnóstico de fisioterapia",
      goals: "Mejorar tolerancia a la carga.",
      treatment: "Ejercicio terapéutico progresivo.",
      notes: [{ date: "2026-11-10", text: "Sesión ficticia de ejemplo." }],
    },
  ],
  appointments: [
    { id: "A001", patientId: "P001", date: "2026-11-10", hour: 9 },
  ],
  nextPatient: 2,
  nextAppt: 2,
};
let data = loadData(sample);
let persistedData = structuredClone(data);
let page = "inicio",
  currentPatient = null,
  view = "day",
  anchor = localDate();
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
function save() {
  try {
    if (recoverySource !== null)
      throw Error(
        "Hay datos dañados pendientes de recuperación. Descarga el original desde Copias de prueba y restaura una copia válida.",
      );
    localStorage.setItem(KEY, JSON.stringify(data));
    persistedData = structuredClone(data);
    storageMessage("Cambios guardados en este navegador.");
    return true;
  } catch (e) {
    data = structuredClone(persistedData);
    storageMessage("No se guardaron los cambios: " + e.message);
    alert("No se guardaron los cambios. " + e.message);
    return false;
  }
}
function nav(p) {
  page = p;
  currentPatient = null;
  render();
}
function render() {
  let items = [
    ["inicio", "⌂ Inicio"],
    ["agenda", "▦ Agenda"],
    ["pacientes", "♙ Pacientes"],
    ["historias", "▤ Historias clínicas"],
    ["copias", "⇩ Copias de prueba"],
  ];
  $("nav").innerHTML = items
    .map(
      ([k, l]) =>
        `<button aria-current="${page === k ? "page" : "false"}" class="${page === k ? "active" : ""}" onclick="nav('${k}')">${l}</button>`,
    )
    .join("");
  ({
    inicio: home,
    agenda: calendar,
    pacientes: patients,
    historias: histories,
    copias: backups,
  })[page]();
}
function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  document.querySelectorAll("#modalBody .field").forEach((field) => {
    const label = field.querySelector("label"),
      control = field.querySelector("input,textarea,select");
    if (label && control) label.htmlFor = control.id;
  });
  $("modal").showModal();
}
function closeModal() {
  if (typeof discardReport === "function" && !discardReport()) return;
  $("modal").close();
}
function dateStr(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function isoAdd(d, n) {
  let x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return localDate(x);
}
function monday(d) {
  let x = new Date(d + "T12:00:00");
  return isoAdd(d, -(x.getDay() + 6) % 7);
}
function pname(id) {
  return (
    data.patients.find((p) => p.id === id)?.name || "Paciente no encontrado"
  );
}
function home() {
  let ap = data.appointments
    .filter((a) => a.date === anchor)
    .sort((a, b) => a.hour - b.hour);
  $("app").innerHTML =
    `<div class="top"><div><h1>Panel principal</h1><div class="muted">MLREHAB · ${dateStr(anchor)}</div></div><button class="primary" onclick="nav('agenda')">Abrir agenda</button></div><div class="stats"><div class="card"><div class="muted">Citas del día</div><div class="stat">${ap.length}</div></div><div class="card"><div class="muted">Pacientes</div><div class="stat">${data.patients.length}</div></div><div class="card"><div class="muted">Huecos libres</div><div class="stat">${12 - ap.length}</div></div></div><div class="card"><div class="sectiontitle"><h2>Próximas citas del día</h2><button onclick="nav('agenda')">Ver calendario</button></div>${ap.length ? ap.map((a) => `<div class="listrow"><div><b>${a.hour}:00 – ${a.hour + 1}:00</b><div class="muted">${esc(pname(a.patientId))}</div></div><button onclick="openPatient('${a.patientId}')">Abrir ficha</button></div>`).join("") : '<p class="muted">No hay citas para esta fecha.</p>'}</div>`;
}
function calendar() {
  let start = view === "day" ? anchor : monday(anchor),
    dates = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) =>
      isoAdd(start, i),
    );
  let html = `<div class="top"><div><h1>Agenda</h1><div class="muted">MLREHAB Manager · v0.6</div></div><button class="primary" onclick="newAppointment()">+ Nueva cita</button></div><div class="card"><div class="toolbar"><button class="${view === "day" ? "active" : ""}" onclick="view='day';calendar()">Día</button><button class="${view === "week" ? "active" : ""}" onclick="view='week';calendar()">Semana</button><button onclick="anchor=isoAdd(anchor,${view === "day" ? -1 : -7});calendar()">‹ Anterior</button><button onclick="anchor=isoAdd(anchor,${view === "day" ? 1 : 7});calendar()">Siguiente ›</button><button onclick="anchor=localDate();calendar()">Hoy</button><input aria-label="Elegir fecha" style="width:160px" type="date" value="${anchor}" onchange="if(this.value){anchor=this.value;calendar()}"><span class="muted">08:00–20:00 · 60 min</span></div></div><div class="calendar" id="calendarScroll"><div class="hours" style="--cols:${dates.length};${view === "day" ? "min-width:0;grid-template-columns:60px minmax(0,1fr)" : ""}"><div class="dayhead">Hora</div>${dates.map((d) => `<div class="dayhead">${dateStr(d)}</div>`).join("")}`;
  for (let h = 8; h < 20; h++) {
    html += `<div class="hour">${String(h).padStart(2, "0")}:00</div>`;
    for (let d of dates) {
      let a = data.appointments.find((a) => a.date === d && a.hour === h);
      html += `<div role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" class="slot ${a ? "booked" : ""}" data-date="${d}" data-hour="${h}" onclick="${a ? `editAppointment('${a.id}')` : `newAppointment('${d}',${h})`}">${a ? `<div class="event" draggable="true" data-appt="${a.id}" ondragstart="desktopDragStart(event,'${a.id}')" ondragend="desktopDragEnd()">${esc(pname(a.patientId))}<small>${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00</small></div>` : '<span class="muted">+</span>'}</div>`;
    }
  }
  $("app").innerHTML =
    html +
    '</div></div><p class="draghint">En iPad: mantén pulsada una cita medio segundo y arrástrala a otro hueco libre. En Windows también podrás arrastrar con el ratón. Toca una cita para editarla.</p>';
  setupTouchDrag();
  setupDesktopDrop();
}
let dragAppt = null,
  dragGhost = null,
  dragTarget = null,
  suppressClickUntil = 0;
function validMove(id, el) {
  if (!el || !el.classList.contains("slot")) return false;
  let a = data.appointments.find((x) => x.id === id);
  if (!a) return false;
  return !data.appointments.some(
    (x) =>
      x.id !== id &&
      x.date === el.dataset.date &&
      x.hour === Number(el.dataset.hour),
  );
}
function moveAppt(id, el) {
  if (!validMove(id, el)) {
    alert("Ese hueco está ocupado. Elige una hora libre.");
    return;
  }
  let a = data.appointments.find((x) => x.id === id);
  a.date = el.dataset.date;
  a.hour = Number(el.dataset.hour);
  anchor = a.date;
  if (!save()) return;
  calendar();
}
function desktopDragStart(e, id) {
  dragAppt = id;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", id);
}
function desktopDragEnd() {
  dragAppt = null;
  document
    .querySelectorAll(".drag-over,.drag-invalid")
    .forEach((el) => el.classList.remove("drag-over", "drag-invalid"));
}
function setupDesktopDrop() {
  document.querySelectorAll(".slot").forEach((el) => {
    el.addEventListener("dragover", (e) => {
      if (!dragAppt) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = validMove(dragAppt, el) ? "move" : "none";
      el.classList.toggle("drag-over", validMove(dragAppt, el));
      el.classList.toggle("drag-invalid", !validMove(dragAppt, el));
    });
    el.addEventListener("dragleave", () =>
      el.classList.remove("drag-over", "drag-invalid"),
    );
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      let id = dragAppt || e.dataTransfer.getData("text/plain");
      desktopDragEnd();
      if (id) moveAppt(id, el);
    });
  });
}
function setupTouchDrag() {
  document.querySelectorAll(".event[data-appt]").forEach((el) => {
    let timer = null,
      active = false,
      startX = 0,
      startY = 0,
      lastX = 0,
      lastY = 0,
      id = el.dataset.appt;
    function clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    function hover(x, y) {
      if (dragTarget) dragTarget.classList.remove("drag-over", "drag-invalid");
      let found = document.elementFromPoint(x, y);
      dragTarget = found?.closest(".slot") || null;
      if (dragTarget)
        dragTarget.classList.add(
          validMove(id, dragTarget) ? "drag-over" : "drag-invalid",
        );
    }
    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        startX = lastX = e.touches[0].clientX;
        startY = lastY = e.touches[0].clientY;
        active = false;
        clear();
        timer = setTimeout(() => {
          active = true;
          el.classList.add("dragging-source");
          dragGhost = document.createElement("div");
          dragGhost.className = "dragghost";
          dragGhost.textContent = pname(
            data.appointments.find((a) => a.id === id)?.patientId,
          );
          document.body.appendChild(dragGhost);
          dragGhost.style.left = lastX + 12 + "px";
          dragGhost.style.top = lastY - 35 + "px";
          hover(lastX, lastY);
          if (navigator.vibrate) navigator.vibrate(25);
        }, 450);
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return;
        let t = e.touches[0];
        lastX = t.clientX;
        lastY = t.clientY;
        if (!active) {
          if (Math.hypot(lastX - startX, lastY - startY) > 12) clear();
          return;
        }
        e.preventDefault();
        dragGhost.style.left = lastX + 12 + "px";
        dragGhost.style.top = lastY - 35 + "px";
        hover(lastX, lastY);
      },
      { passive: false },
    );
    el.addEventListener(
      "touchend",
      (e) => {
        clear();
        if (!active) return;
        e.preventDefault();
        suppressClickUntil = Date.now() + 700;
        let target = dragTarget;
        cleanup();
        if (target) moveAppt(id, target);
      },
      { passive: false },
    );
    el.addEventListener("touchcancel", () => {
      clear();
      cleanup();
    });
    function cleanup() {
      active = false;
      el.classList.remove("dragging-source");
      if (dragTarget) dragTarget.classList.remove("drag-over", "drag-invalid");
      dragTarget = null;
      dragGhost?.remove();
      dragGhost = null;
    }
  });
}
document.addEventListener(
  "click",
  (e) => {
    if (Date.now() < suppressClickUntil && e.target.closest(".slot")) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);
function newAppointment(date = anchor, hour = 8) {
  if (!data.patients.length) {
    alert("Primero crea un paciente ficticio.");
    return;
  }
  appointmentForm(null, date, hour);
}
function editAppointment(id) {
  let a = data.appointments.find((a) => a.id === id);
  appointmentForm(a, a.date, a.hour);
}
function appointmentForm(a, date, hour) {
  openModal(
    a ? "Editar cita" : "Nueva cita",
    `<div class="field"><label>Paciente</label><select id="aptPatient">${data.patients.map((p) => `<option value="${p.id}" ${a?.patientId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div><div class="field"><label>Fecha</label><input id="aptDate" type="date" value="${date}"></div><div class="field"><label>Hora de inicio (duración 60 min)</label><select id="aptHour">${Array.from(
      { length: 12 },
      (_, i) => i + 8,
    )
      .map(
        (h) =>
          `<option value="${h}" ${hour === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00 – ${String(h + 1).padStart(2, "0")}:00</option>`,
      )
      .join(
        "",
      )}</select></div><div class="actions"><button class="primary" onclick="saveAppointment('${a?.id || ""}')">Guardar cita</button>${a ? `<button onclick="deleteAppointment('${a.id}')">Eliminar</button>` : ""}</div>`,
  );
}
function saveAppointment(id) {
  let date = $("aptDate").value,
    hour = +$("aptHour").value,
    patientId = $("aptPatient").value;
  if (!date) return alert("Elige una fecha");
  if (
    data.appointments.some(
      (a) => a.date === date && a.hour === hour && a.id !== id,
    )
  )
    return alert("Esa hora ya está ocupada.");
  if (id) {
    Object.assign(
      data.appointments.find((a) => a.id === id),
      { date, hour, patientId },
    );
  } else {
    data.appointments.push({
      id: "A" + String(data.nextAppt++).padStart(3, "0"),
      date,
      hour,
      patientId,
    });
  }
  anchor = date;
  if (!save()) return;
  closeModal();
  render();
}
function deleteAppointment(id) {
  if (!confirm("¿Eliminar esta cita de prueba?")) return;
  data.appointments = data.appointments.filter((a) => a.id !== id);
  if (!save()) return;
  closeModal();
  render();
}
function patients() {
  listPatients(false);
}
function histories() {
  listPatients(true);
}
function listPatients(clinical) {
  $("app").innerHTML =
    `<div class="top"><h1>${clinical ? "Historias clínicas" : "Pacientes"}</h1><button class="primary" onclick="newPatient()">+ Nuevo paciente</button></div><div class="card"><input id="search" aria-label="Buscar paciente ficticio por nombre" placeholder="Buscar paciente ficticio por nombre" oninput="filterPatients()"><div id="patientList"></div></div>`;
  filterPatients();
}
function filterPatients() {
  let q = ($("search")?.value || "").toLowerCase();
  $("patientList").innerHTML =
    data.patients
      .filter((p) => p.name.toLowerCase().includes(q))
      .map(
        (p) =>
          `<div class="listrow"><div><b>${esc(p.name)}</b><div class="muted">Nº ${esc(p.id)}</div></div><button onclick="openPatient('${p.id}')">Abrir ficha</button></div>`,
      )
      .join("") || '<p class="muted">No se encontraron pacientes.</p>';
}
function newPatient() {
  openModal(
    "Nuevo paciente ficticio",
    `<div class="field"><label>Nombre ficticio</label><input id="newName" placeholder="Paciente de ejemplo 02"></div><button class="primary" onclick="createPatient()">Crear ficha</button>`,
  );
}
function createPatient() {
  let name = $("newName").value.trim();
  if (!name) return alert("Escribe un nombre ficticio");
  let p = {
    id: "P" + String(data.nextPatient++).padStart(3, "0"),
    name,
    phone: "",
    birth: "",
    email: "",
    address: "",
    occupation: "",
    activity: "",
    history: "",
    background: "",
    exam: "",
    rom: "",
    strength: "",
    diagnosis: "",
    goals: "",
    treatment: "",
    notes: [],
  };
  data.patients.push(p);
  if (!save()) return;
  closeModal();
  openPatient(p.id);
}
function openPatient(id) {
  currentPatient = id;
  page = "historias";
  render();
  patientDetail();
}
const fields = [
  ["phone", "Teléfono"],
  ["birth", "Fecha de nacimiento"],
  ["email", "Correo electrónico"],
  ["address", "Dirección"],
  ["occupation", "Ocupación"],
  ["activity", "Actividad física"],
  ["history", "Anamnesis"],
  ["background", "Antecedentes relevantes"],
  ["exam", "Exploración física"],
  ["rom", "ROM"],
  ["strength", "Dinamometría"],
  ["diagnosis", "Diagnóstico de fisioterapia"],
  ["goals", "Objetivos terapéuticos"],
  ["treatment", "Tratamiento (plan inicial)"],
];
function patientDetail() {
  let p = data.patients.find((p) => p.id === currentPatient);
  if (!p) return;
  let card = (title, keys) =>
    `<div class="card"><div class="sectiontitle"><h3>${title}</h3><button onclick="editFields('${keys.join(",")}')">Editar ✎</button></div>${keys.map((k) => `<div class="sectionbody">${keys.length > 1 ? `<b>${fields.find((f) => f[0] === k)?.[1]}:</b> ` : ""}${esc(p[k]) || '<span class="muted">Sin registrar</span>'}</div>`).join("")}</div>`;
  let sessions = (p.notes || []).map((n, i) => ({ ...n, i })).reverse();
  $("app").innerHTML =
    `<div class="top"><div><button onclick="nav('pacientes')">‹ Pacientes</button><h1 style="margin-top:12px">${esc(p.name)}</h1><div class="muted">Nº paciente: ${esc(p.id)} · Datos ficticios</div></div><div class="patient-actions"><button onclick="startReport()">Preparar informe</button><button onclick="renamePatient()">Editar nombre</button><button class="primary" onclick="newAppointmentForPatient()">+ Programar cita</button></div></div><div class="detailgrid"><div>${card("Datos personales", ["phone", "birth", "email", "address", "occupation", "activity"])}${card("Antecedentes relevantes", ["background"])}<div class="card"><div class="sectiontitle"><h3>Documentos de prueba</h3><button onclick="addDemoDocument()">+ Añadir referencia</button></div><p class="formnote">Solo nombres de documentos ficticios. No se suben archivos ni informes.</p>${(p.documents || []).map((d, i) => `<div class="filetag"><span>▤ ${esc(d)}</span><button onclick="removeDemoDocument(${i})">Quitar</button></div>`).join("") || '<p class="muted">Sin documentos.</p>'}</div><button onclick="deletePatient()">Eliminar paciente ficticio</button></div><div>${card("Anamnesis", ["history"])}<div class="grid">${card("Exploración física", ["exam"])}${card("ROM", ["rom"])}${card("Dinamometría", ["strength"])}</div><div class="grid">${card("Diagnóstico de fisioterapia", ["diagnosis"])}${card("Objetivos terapéuticos", ["goals"])}</div>${card("Tratamiento (plan inicial)", ["treatment"])}<div class="card"><div class="sectiontitle"><h3>Evolución por sesiones (${sessions.length})</h3><button class="primary" onclick="addSession()">+ Añadir sesión</button></div>${sessions.length ? sessions.map((n) => `<div class="session"><b>${esc(n.date)}</b><p>${esc(n.text)}</p><div class="actions"><button onclick="editSession(${n.i})">Editar sesión</button><button onclick="deleteSession(${n.i})">Eliminar</button></div></div>`).join("") : '<p class="muted">Todavía no hay sesiones.</p>'}</div></div></div>`;
}
function renamePatient() {
  let p = data.patients.find((p) => p.id === currentPatient);
  openModal(
    "Editar nombre ficticio",
    `<div class="field"><label>Nombre</label><input id="renameInput" value="${esc(p.name)}"></div><button class="primary" onclick="savePatientName()">Guardar nombre</button>`,
  );
}
function savePatientName() {
  let name = $("renameInput").value.trim();
  if (!name) return alert("Escribe un nombre");
  data.patients.find((p) => p.id === currentPatient).name = name;
  if (!save()) return;
  closeModal();
  patientDetail();
}
function deletePatient() {
  let p = data.patients.find((p) => p.id === currentPatient);
  if (
    !confirm(
      "¿Eliminar " +
        p.name +
        " y todas sus citas ficticias? Esta acción no se puede deshacer.",
    )
  )
    return;
  data.patients = data.patients.filter((x) => x.id !== p.id);
  data.appointments = data.appointments.filter((x) => x.patientId !== p.id);
  if (!save()) return;
  nav("pacientes");
}
function newAppointmentForPatient() {
  let id = currentPatient;
  appointmentForm(null, anchor, 8);
  $("aptPatient").value = id;
}
function addDemoDocument() {
  openModal(
    "Referencia de documento ficticio",
    `<div class="field"><label>Nombre del documento de prueba</label><input id="demoDoc" placeholder="Informe ficticio de rodilla"></div><p class="formnote">No adjuntes documentos reales: esto solo guarda un título.</p><button class="primary" onclick="saveDemoDocument()">Añadir referencia</button>`,
  );
}
function saveDemoDocument() {
  let val = $("demoDoc").value.trim();
  if (!val) return;
  let p = data.patients.find((p) => p.id === currentPatient);
  (p.documents ??= []).push(val);
  if (!save()) return;
  closeModal();
  patientDetail();
}
function removeDemoDocument(i) {
  if (!confirm("¿Quitar esta referencia ficticia?")) return;
  data.patients.find((p) => p.id === currentPatient).documents.splice(i, 1);
  if (!save()) return;
  patientDetail();
}
function editSession(i) {
  let n = data.patients.find((p) => p.id === currentPatient).notes[i];
  openModal(
    "Editar sesión",
    `<div class="field"><label>Fecha</label><input type="date" id="editSessionDate" value="${esc(n.date)}"></div><div class="field"><label>Evolución / tratamiento</label><textarea id="editSessionText">${esc(n.text)}</textarea></div><button class="primary" onclick="saveEditedSession(${i})">Guardar cambios</button>`,
  );
}
function saveEditedSession(i) {
  let date = $("editSessionDate").value,
    text = $("editSessionText").value.trim();
  if (!date || !text) return alert("Completa fecha y evolución");
  let n = data.patients.find((p) => p.id === currentPatient).notes[i];
  Object.assign(n, { date, text });
  if (!save()) return;
  closeModal();
  patientDetail();
}
function deleteSession(i) {
  if (!confirm("¿Eliminar esta sesión ficticia?")) return;
  data.patients.find((p) => p.id === currentPatient).notes.splice(i, 1);
  if (!save()) return;
  patientDetail();
}
function editFields(keys) {
  let p = data.patients.find((p) => p.id === currentPatient);
  let ks = keys.split(",");
  openModal(
    "Editar ficha · " + p.name,
    ks
      .map(
        (k) =>
          `<div class="field"><label>${fields.find((f) => f[0] === k)?.[1]}</label>${k === "birth" ? `<input type="date" id="f_${k}" value="${esc(p[k])}">` : `<textarea id="f_${k}">${esc(p[k])}</textarea>`}</div>`,
      )
      .join("") +
      `<button class="primary" onclick="saveFields('${keys}')">Guardar cambios</button>`,
  );
}
function saveFields(keys) {
  let p = data.patients.find((p) => p.id === currentPatient);
  for (let k of keys.split(",")) p[k] = $("f_" + k).value;
  if (!save()) return;
  closeModal();
  patientDetail();
}
function addSession() {
  openModal(
    "Nueva sesión",
    `<div class="field"><label>Fecha</label><input type="date" id="sessionDate" value="${localDate()}"></div><div class="field"><label>Evolución / tratamiento</label><textarea id="sessionText" placeholder="Escribe una evolución ficticia"></textarea></div><button class="primary" onclick="saveSession()">Guardar sesión</button>`,
  );
}
function saveSession() {
  let text = $("sessionText").value.trim(),
    date = $("sessionDate").value;
  if (!text || !date) return alert("Completa fecha y evolución");
  data.patients.find((p) => p.id === currentPatient).notes.push({ date, text });
  if (!save()) return;
  closeModal();
  patientDetail();
}
function backups() {
  $("app").innerHTML =
    `<h1>Copias de prueba</h1><div class="card"><h2>Exportar e importar datos ficticios</h2>${recoverySource !== null ? '<button onclick="downloadRecovery()">Descargar original para recuperación</button>' : ""}<p>Guarda una copia JSON de esta demo. El almacenamiento del navegador puede desaparecer, especialmente si abres el archivo desde Archivos en iPad.</p><div class="actions"><button class="primary" onclick="exportData()">Descargar copia JSON</button><label style="border:1px solid #ddd;padding:10px;border-radius:9px;cursor:pointer">Importar JSON<input type="file" accept=".json,application/json" style="display:none" onchange="importData(this.files[0])"></label><button onclick="resetDemo()">Restablecer demo</button></div><p class="muted">Estas copias no están cifradas. Nunca las utilices para datos sanitarios reales.</p></div>`;
}
function exportData() {
  let blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "MLREHAB_DEMO_copia.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw Error("La copia supera el límite de 5 MB.");
    let x = validateData(JSON.parse(await file.text()));
    if (
      !confirm(
        "¿Sustituir los datos actuales por esta copia ficticia validada?",
      )
    )
      return;
    const previousRecovery = recoverySource;
    recoverySource = null;
    data = x;
    if (!save()) {
      recoverySource = previousRecovery;
      return;
    }
    render();
  } catch (e) {
    alert("No se pudo importar el archivo: " + e.message);
  }
}
function downloadRecovery() {
  if (recoverySource === null) return;
  downloadJSON(recoverySource, "MLREHAB_original_recuperacion.json");
}
function downloadJSON(content, name) {
  let blob = new Blob([content], { type: "application/json" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function resetDemo() {
  if (confirm("¿Restablecer todos los datos de prueba?")) {
    const original = recoverySource;
    recoverySource = null;
    data = structuredClone(sample);
    if (!save()) {
      recoverySource = original;
      return;
    }
    render();
  }
}
render();
storageMessage(startupMessage);
