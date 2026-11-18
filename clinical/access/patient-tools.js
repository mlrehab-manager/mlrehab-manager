const $ = (id) => document.getElementById(id);
const fields = ["history", "exam", "diagnosis", "goals"];
let selected = null,
  baseline = null;
const values = () =>
  Object.fromEntries(fields.map((key) => [key, $(`patient-${key}`).value]));
export function hasPatientChanges() {
  return (
    selected &&
    baseline &&
    JSON.stringify(values()) !== JSON.stringify(baseline)
  );
}
export function confirmPatientDiscard() {
  return (
    !hasPatientChanges() ||
    window.confirm(
      "Hay cambios sin guardar en la ficha ficticia. ¿Quieres descartarlos?",
    )
  );
}
export function clearPatientData() {
  selected = baseline = null;
  $("patient-list").replaceChildren();
  $("patient-editor").hidden = true;
  $("patient-name").textContent = "";
  $("patient-revision").textContent = "";
  $("patient-treatment").textContent = "";
  fields.forEach((key) => ($(`patient-${key}`).value = ""));
}
export function installPatientTools({ client, run, isAuthorized, message }) {
  function failure(error, save = false) {
    if (["42501", "PGRST301", "PGRST303"].includes(error?.code)) {
      clearPatientData();
      message(
        "La sesión no permite acceder a las fichas. Sal y vuelve a entrar.",
      );
    } else if (error?.code === "40001") {
      message(
        "La ficha ha cambiado o ya no se puede editar. Tu texto sigue aquí. Usa «Cargar versión guardada» para revisar el cambio.",
      );
    } else if (error?.code === "22023") {
      message(
        "Revisa los campos de la ficha y sus límites. Tu texto sigue aquí.",
      );
    } else
      message(
        save
          ? "No se ha podido confirmar el guardado. Tu texto sigue aquí; revisa la versión guardada antes de reintentar."
          : "No se pudo cargar la ficha. Comprueba la conexión y vuelve a intentarlo.",
      );
  }
  async function loadList(isCurrent) {
    $("patient-fields").disabled = true;
    try {
      const { data, error } = await client.rpc("clinical_patient_list_test");
      if (!isCurrent()) return false;
      if (error) {
        failure(error);
        return false;
      }
      if (!Array.isArray(data)) throw new Error();
      const fragment = document.createDocumentFragment();
      for (const row of data) {
        const item = document.createElement("li"),
          button = document.createElement("button");
        button.type = "button";
        button.textContent = `${row.name} · ${row.archived ? "Archivado (solo lectura)" : "Activo"}`;
        button.addEventListener("click", () =>
          run(async (current) => {
            if (!isAuthorized() || !confirmPatientDiscard()) return;
            await open(row.id, current);
          }),
        );
        item.append(button);
        fragment.append(item);
      }
      $("patient-list").replaceChildren(fragment);
      return data;
    } finally {
      if (isCurrent() && selected)
        $("patient-fields").disabled = selected.archived;
    }
  }
  async function open(id, isCurrent) {
    $("patient-fields").disabled = true;
    try {
      const { data, error } = await client.rpc("clinical_patient_get", {
        p_id: id,
      });
      if (!isCurrent()) return;
      if (error) {
        failure(error);
        return;
      }
      if (
        !data ||
        data.id !== id ||
        data.payload?.testOnly !== true ||
        data.payload?.fixture !== "backup-roundtrip-v1"
      ) {
        message("Esta pantalla solo admite las fichas ficticias de la prueba.");
        return;
      }
      selected = {
        id: data.id,
        revision: data.revision,
        archived: data.archived_at !== null,
      };
      fields.forEach(
        (key) =>
          ($(`patient-${key}`).value =
            typeof data.payload[key] === "string" ? data.payload[key] : ""),
      );
      baseline = values();
      $("patient-name").textContent = data.payload.name;
      $("patient-revision").textContent =
        `Versión ${data.revision}${selected.archived ? " · Archivado: solo lectura" : ""}`;
      const treatment = data.payload.treatment;
      $("patient-treatment").textContent =
        typeof treatment?.passive === "string"
          ? `Tratamiento de ejemplo conservado: ${treatment.passive}`
          : "";
      $("patient-fields").disabled = selected.archived;
      $("patient-editor").hidden = false;
      message(
        selected.archived
          ? "Ficha archivada cargada en modo lectura."
          : "Ficha ficticia cargada desde la base privada.",
      );
    } finally {
      if (isCurrent() && selected)
        $("patient-fields").disabled = selected.archived;
    }
  }
  $("patient-load").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !confirmPatientDiscard()) return;
      const rows = await loadList(isCurrent);
      if (rows && isCurrent()) {
        selected = baseline = null;
        $("patient-editor").hidden = true;
        message(
          rows.length
            ? "Pacientes ficticios cargados. Elige una ficha."
            : "No hay fichas de prueba. Puedes preparar el conjunto ficticio.",
        );
      }
    }),
  );
  $("patient-prepare").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !confirmPatientDiscard()) return;
      const { error } = await client.rpc("clinical_backup_seed_test");
      if (!isCurrent()) return;
      if (error) {
        failure(error);
        return;
      }
      const rows = await loadList(isCurrent);
      if (rows && isCurrent()) {
        selected = baseline = null;
        $("patient-editor").hidden = true;
        message(
          "Conjunto ficticio preparado sin duplicar ni sustituir otras fichas.",
        );
      }
    }),
  );
  $("patient-refresh").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !selected || !confirmPatientDiscard()) return;
      await open(selected.id, isCurrent);
    }),
  );
  $("patient-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized() || !selected || selected.archived) return;
      const sent = values(),
        patch = Object.fromEntries(
          fields
            .filter((key) => sent[key] !== baseline[key])
            .map((key) => [key, sent[key]]),
        );
      if (!Object.keys(patch).length) {
        message("No hay cambios pendientes en la ficha.");
        return;
      }
      const { data, error } = await client.rpc(
        "clinical_patient_save_fields_test",
        {
          p_id: selected.id,
          p_expected_revision: selected.revision,
          p_fields: patch,
        },
      );
      if (!isCurrent()) return;
      if (error) {
        failure(error, true);
        return;
      }
      if (data?.id !== selected.id || data.revision !== selected.revision + 1) {
        failure(null, true);
        return;
      }
      selected.revision = data.revision;
      baseline = sent;
      $("patient-revision").textContent = `Versión ${data.revision}`;
      message(
        hasPatientChanges()
          ? "Ficha guardada. Hay cambios posteriores sin guardar."
          : "Ficha ficticia guardada en la base privada.",
      );
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (hasPatientChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
