// Only the main tab owns the authenticated client. Each port is bound to one
// window opened by a patient/agenda click and its record. No tokens cross tabs.
import { localInput, mondayOf } from "./weekly-calendar.js";
const protocol = "mlrehab-patient-v1";
const read = "clinical_patient_get";
const write = new Set([
  "clinical_patient_save_fields_test",
  "clinical_patient_archive_test",
  "clinical_appointment_save_typed",
  "clinical_session_save_test",
]);
const denied = () => ({ data: null, error: { code: "42501" } });

function allowed(record, name, args) {
  if (name === "clinical_access_check") return args == null;
  if (!record.appointmentId)
    return (
      [
        read,
        "clinical_patient_save_fields_test",
        "clinical_patient_archive_test",
      ].includes(name) && args?.p_id === record.patientId
    );
  if (name === "clinical_exercise_list_test") return args == null;
  if (name === "clinical_agenda_week")
    return (
      typeof args?.p_day === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(args.p_day) &&
      Number.isFinite(Date.parse(args.p_day)) &&
      mondayOf(args.p_day) === mondayOf(record.day)
    );
  if (name === "clinical_appointment_save_typed")
    return (
      args?.p_id === record.appointmentId &&
      args.p_patient_id === record.patientId
    );
  if (name === "clinical_session_get_test")
    return args?.p_appointment_id === record.appointmentId;
  if (name === "clinical_session_save_test")
    return (
      args?.p_appointment_id === record.appointmentId &&
      args.p_id === record.sessionId
    );
  return false;
}

function scopedResult(record, name, result) {
  if (result.error || !record.appointmentId) return result;
  const data = result.data;
  if (name === "clinical_agenda_week" && data) {
    const rows = (data.appointments ?? []).filter(
      (row) =>
        row.id === record.appointmentId && row.patient_id === record.patientId,
    );
    if (rows.length) record.sessionId = rows[0].session_id ?? null;
    return {
      ...result,
      data: {
        ...data,
        appointments: rows,
        patients: (data.patients ?? []).filter(
          (row) => row.id === record.patientId,
        ),
      },
    };
  }
  if (
    name === "clinical_appointment_save_typed" &&
    data?.id === record.appointmentId &&
    data.patient_id === record.patientId
  )
    record.day = localInput(data.starts_at).slice(0, 10);
  if (
    ["clinical_session_get_test", "clinical_session_save_test"].includes(name)
  ) {
    if (
      data &&
      (data.appointment_id !== record.appointmentId ||
        data.patient_id !== record.patientId)
    )
      return { data: null, error: { code: "NETWORK_ERROR" } };
    record.sessionId = data?.id ?? null;
  }
  return result;
}

export function installPatientTabs({
  client,
  isAuthorized,
  message,
  onActivity,
  onSaved,
  checkAccess,
}) {
  const records = new Map();
  const writes = new Set();
  let generation = 0;
  const current = (record) =>
    isAuthorized() && records.get(record.window) === record;
  function remove(record) {
    records.delete(record.window);
    record.port?.close();
  }
  window.addEventListener("message", (event) => {
    const record = records.get(event.source);
    if (
      event.origin !== location.origin ||
      !record ||
      record.port ||
      !current(record) ||
      event.data?.protocol !== protocol ||
      event.data?.type !== "ready" ||
      typeof event.data.challenge !== "string" ||
      event.data.challenge.length > 80
    )
      return;
    const channel = new MessageChannel();
    record.port = channel.port1;
    record.port.onmessage = async ({ data }) => {
      checkAccess();
      if (!current(record) || data?.protocol !== protocol) return;
      if (data.type === "draft") {
        record.dirty = data.dirty === true;
        return;
      }
      if (data.type === "activity") {
        onActivity();
        return;
      }
      if (data.type === "closed") {
        remove(record);
        return;
      }
      if (typeof data.id !== "string" || data.id.length > 80) return;
      const reply = (result) => {
        if (current(record))
          record.port.postMessage({
            protocol,
            type: "result",
            id: data.id,
            result,
          });
      };
      if (data.type === "ping") {
        reply({ ok: true });
        return;
      }
      if (data.type !== "rpc") return;
      const { name, args } = data;
      if (!allowed(record, name, args)) {
        reply(denied());
        return;
      }
      const epoch = generation;
      const writing = write.has(name);
      const writeKey = {};
      if (writing) writes.add(writeKey);
      try {
        let result = await client.rpc(name, args);
        if (epoch !== generation || !isAuthorized()) return;
        result = scopedResult(record, name, result);
        reply(result);
        if (writing && !result.error)
          onSaved(record.appointmentId ? "appointment" : "patient");
      } catch {
        reply({ data: null, error: { code: "NETWORK_ERROR" } });
      } finally {
        if (writing) writes.delete(writeKey);
      }
    };
    event.source.postMessage(
      { protocol, type: "channel", challenge: event.data.challenge },
      location.origin,
      [channel.port2],
    );
    record.port.postMessage({
      protocol,
      type: "context",
      patientId: record.patientId,
      ...(record.appointmentId
        ? { appointmentId: record.appointmentId, day: record.day }
        : {}),
    });
  });
  function closeAll(
    reason = "El acceso de la pestaña principal ha terminado.",
  ) {
    generation++;
    for (const record of records.values()) {
      record.port?.postMessage({ protocol, type: "locked", reason });
      record.port?.close();
    }
    records.clear();
    writes.clear();
  }
  const hasPendingChanges = () =>
    writes.size > 0 ||
    [...records.values()].some((r) => r.dirty && !r.window.closed);
  window.addEventListener("beforeunload", (event) => {
    if (hasPendingChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () =>
    closeAll("La pestaña principal se ha cerrado o actualizado."),
  );
  setInterval(() => {
    for (const record of records.values())
      if (record.window.closed) remove(record);
  }, 1000);
  function open(patientId, row) {
    if (!isAuthorized()) return false;
    const url = new URL(location.pathname, location.origin);
    url.hash = row ? "cita" : "ficha";
    const child = window.open(url.href, "_blank");
    if (!child) {
      message(
        "El navegador ha bloqueado la pestaña nueva. Permite ventanas emergentes para MLREHAB y vuelve a pulsar el paciente.",
      );
      return false;
    }
    records.set(child, {
      window: child,
      patientId,
      dirty: false,
      port: null,
      ...(row
        ? {
            appointmentId: row.id,
            day: localInput(row.starts_at).slice(0, 10),
            sessionId: row.session_id ?? null,
          }
        : {}),
    });
    message(
      row
        ? "Cita y tratamiento abiertos en una pestaña nueva. La agenda permanece aquí."
        : "Ficha abierta en una pestaña nueva. La lista permanece aquí.",
    );
    return true;
  }
  return {
    open,
    openAppointment: (row) => open(row.patient_id, row),
    closeAll,
    hasPendingChanges,
  };
}

export function connectPatientTab(onLock) {
  const parent = window.opener;
  const pending = new Map();
  let port,
    stopped = false,
    context = null;
  const challenge = crypto.randomUUID();
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const send = (data) => port?.postMessage({ protocol, ...data });
  function lock(reason) {
    if (stopped) return;
    stopped = true;
    send({ type: "closed" });
    port?.close();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.resolve(denied());
    }
    pending.clear();
    resolveReady(null);
    onLock(reason);
  }
  function request(type, body = {}) {
    if (stopped || !port || parent?.closed) {
      lock("La pestaña principal ya no está disponible.");
      return Promise.resolve(denied());
    }
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          pending.delete(id);
          resolve({ data: null, error: { code: "NETWORK_ERROR" } });
        },
        type === "ping" ? 8000 : 30000,
      );
      pending.set(id, { resolve, timer });
      send({ type, id, ...body });
    });
  }
  const listener = (event) => {
    if (
      stopped ||
      port ||
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.protocol !== protocol ||
      event.data.type !== "channel" ||
      event.data.challenge !== challenge ||
      event.ports.length !== 1
    )
      return;
    port = event.ports[0];
    try {
      window.opener = null;
    } catch {
      /* Some browsers keep opener read-only. */
    }
    window.removeEventListener("message", listener);
    port.onmessage = ({ data }) => {
      if (stopped || data?.protocol !== protocol) return;
      if (data.type === "locked") {
        lock(data.reason);
        return;
      }
      if (data.type === "context" && typeof data.patientId === "string") {
        context = {
          patientId: data.patientId,
          appointmentId: data.appointmentId,
          day: data.day,
        };
        clearTimeout(startupTimer);
        resolveReady(data.patientId);
      }
      if (data.type === "result") {
        const item = pending.get(data.id);
        if (item) {
          pending.delete(data.id);
          clearTimeout(item.timer);
          item.resolve(data.result);
        }
      }
    };
  };
  window.addEventListener("message", listener);
  const startupTimer = setTimeout(
    () =>
      lock(
        "Abre la ficha desde la lista de pacientes de la pestaña principal.",
      ),
    15000,
  );
  if (parent && !parent.closed)
    parent.postMessage({ protocol, type: "ready", challenge }, location.origin);
  else {
    clearTimeout(startupTimer);
    queueMicrotask(() =>
      lock("Abre la ficha desde la lista de pacientes de MLREHAB."),
    );
  }
  let checking = false;
  async function checkParent() {
    if (stopped || !port || checking) return;
    if (parent.closed) {
      lock("La pestaña principal se ha cerrado. Vuelve a entrar en MLREHAB.");
      return;
    }
    if (document.visibilityState !== "visible") return;
    checking = true;
    const result = await request("ping");
    checking = false;
    if (!result.ok && document.visibilityState === "visible")
      lock(
        "Se ha perdido el vínculo con la pestaña principal. Vuelve a abrir la ficha.",
      );
  }
  setInterval(checkParent, 5000);
  document.addEventListener("visibilitychange", checkParent);
  window.addEventListener("pagehide", () =>
    lock(
      "La ficha se ha cerrado o actualizado. Ábrela de nuevo desde la pestaña principal.",
    ),
  );
  for (const type of ["pointerdown", "keydown"])
    document.addEventListener(
      type,
      (event) => {
        if (!stopped && event.isTrusted) send({ type: "activity" });
      },
      { passive: true },
    );
  return {
    ready,
    context: () => context,
    isOpen: () => !stopped,
    rpc: (name, args) => request("rpc", { name, args }),
    draft: (dirty) => {
      if (!stopped) send({ type: "draft", dirty });
    },
    close: () => {
      lock(
        "Ficha finalizada. Puedes cerrar esta pestaña y continuar en MLREHAB.",
      );
      window.close();
    },
    lock,
  };
}
