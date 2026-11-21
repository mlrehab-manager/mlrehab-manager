const $ = (id) => document.getElementById(id);
const fields = ["history", "exam", "diagnosis", "goals", "alias"];
let selected = null,
  baseline = null,
  patients = [],
  requestId = null;
const values = () =>
  Object.fromEntries(fields.map((key) => [key, $(`patient-${key}`).value]));
const normalized = (value) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function hasPatientChanges() {
  return Boolean(
    (!$("patient-create-form").hidden &&
      $("patient-create-alias").value !== "") ||
    (selected &&
      baseline &&
      JSON.stringify(values()) !== JSON.stringify(baseline)),
  );
}
export const confirmPatientDiscard = () =>
  !hasPatientChanges() ||
  window.confirm(
    "Hay cambios sin guardar en la ficha ficticia. ¿Quieres descartarlos?",
  );
function clearCreation() {
  requestId = null;
  $("patient-create-form").hidden = true;
  $("patient-create-alias").value = "";
  $("patient-create-fields").disabled = false;
}
function clearEditor() {
  selected = baseline = null;
  $("patient-editor").hidden = true;
  $("patient-name").textContent = "";
  $("patient-revision").textContent = "";
  $("patient-treatment").textContent = "";
  fields.forEach((key) => ($(`patient-${key}`).value = ""));
  $("patient-alias-label").hidden = true;
  $("patient-alias").hidden = true;
  $("patient-alias").required = false;
  $("patient-archive").hidden = true;
}
export function clearPatientData() {
  patients = [];
  $("patient-list").replaceChildren();
  $("patient-search").value = "";
  $("patient-count").textContent = "";
  clearCreation();
  clearEditor();
}
export function installPatientTools({ client, run, isAuthorized, message }) {
  function failure(error, save = false) {
    if (["42501", "PGRST301", "PGRST303"].includes(error?.code)) {
      clearPatientData();
      message(
        "La sesión no permite acceder a las fichas. Sal y vuelve a entrar.",
      );
    } else if (error?.code === "40001")
      message(
        "La ficha ha cambiado o ya no se puede editar. Tu texto sigue aquí. Usa «Cargar versión guardada» para revisar el cambio.",
      );
    else if (error?.code === "23505")
      message(
        "Ya existe ese alias ficticio. Carga las fichas para comprobarlo o usa otro alias; el formulario se conserva.",
      );
    else if (error?.code === "23514")
      message(
        "Antes de archivar, cancela o registra las sesiones de sus citas programadas. La ficha se conserva activa.",
      );
    else if (error?.code === "54000")
      message(
        "Se ha alcanzado un límite de la prueba. No se ha recortado ni sustituido ninguna ficha.",
      );
    else if (error?.code === "22023")
      message(
        "Revisa los campos de la ficha y sus límites. Tu texto sigue aquí.",
      );
    else
      message(
        save
          ? "No se ha podido confirmar el guardado. Tu texto sigue aquí; revisa la versión guardada antes de reintentar."
          : "No se pudo cargar la ficha. Comprueba la conexión y vuelve a intentarlo.",
      );
  }
  function renderList() {
    const query = normalized($("patient-search").value),
      rows = patients.filter(
        (row) =>
          !query ||
          normalized(row.name).includes(query) ||
          row.id.includes(query),
      ),
      fragment = document.createDocumentFragment();
    for (const row of rows) {
      const item = document.createElement("li"),
        button = document.createElement("button");
      button.type = "button";
      button.textContent = `${row.name} · ${row.archived ? "Archivado (solo lectura)" : "Activo"}`;
      button.addEventListener("click", () =>
        run(async (current) => {
          if (!isAuthorized() || !confirmPatientDiscard()) return;
          clearCreation();
          await open(row.id, current);
        }),
      );
      item.append(button);
      fragment.append(item);
    }
    $("patient-list").replaceChildren(fragment);
    $("patient-count").textContent =
      `${patients.length} fichas ficticias · ${rows.length} coincidencias.`;
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
      if (!Array.isArray(data) || data.length > 500) throw new Error();
      patients = data;
      renderList();
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
      if (!isCurrent()) return false;
      if (error) {
        failure(error);
        return false;
      }
      if (
        !data ||
        data.id !== id ||
        data.payload?.testOnly !== true ||
        !["backup-roundtrip-v1", "patient-workflow-v1"].includes(
          data.payload?.fixture,
        )
      ) {
        message("Esta pantalla solo admite fichas ficticias.");
        return false;
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
      const aliasEditable = data.payload.fixture === "patient-workflow-v1";
      $("patient-alias-label").hidden = $("patient-alias").hidden =
        !aliasEditable;
      $("patient-alias").required = aliasEditable;
      $("patient-name").textContent = data.payload.name;
      $("patient-revision").textContent =
        `Versión ${data.revision}${selected.archived ? " · Archivado: solo lectura" : ""}`;
      $("patient-treatment").textContent =
        typeof data.payload.treatment?.passive === "string"
          ? `Tratamiento de ejemplo conservado: ${data.payload.treatment.passive}`
          : "";
      $("patient-archive").hidden = selected.archived;
      $("patient-fields").disabled = selected.archived;
      $("patient-editor").hidden = false;
      message(
        selected.archived
          ? "Ficha archivada cargada en modo lectura."
          : "Ficha ficticia cargada desde la base privada.",
      );
      return true;
    } finally {
      if (isCurrent() && selected)
        $("patient-fields").disabled = selected.archived;
    }
  }
  $("patient-search").addEventListener("input", renderList);
  $("patient-new").addEventListener("click", () =>
    run(async () => {
      if (!isAuthorized() || !confirmPatientDiscard()) return;
      clearEditor();
      clearCreation();
      requestId = crypto.randomUUID();
      $("patient-create-form").hidden = false;
      message(
        "Prepara un alias ficticio. La ficha se crea solo al pulsar Crear ficha ficticia.",
      );
    }),
  );
  $("patient-create-cancel").addEventListener("click", () =>
    run(async () => {
      if (isAuthorized() && confirmPatientDiscard()) {
        clearCreation();
        message("Alta de prueba cerrada.");
      }
    }),
  );
  $("patient-create-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized() || !requestId || $("patient-create-form").hidden)
        return;
      const alias = $("patient-create-alias").value.trim().replace(/\s+/g, " "),
        id = requestId;
      if (!alias || alias.length > 80) {
        message("Escribe un alias ficticio de hasta 80 caracteres.");
        return;
      }
      $("patient-create-fields").disabled = true;
      try {
        const { data, error } = await client.rpc(
          "clinical_patient_create_test",
          { p_alias: alias, p_request_id: id },
        );
        if (!isCurrent()) return;
        if (error) {
          failure(error, true);
          return;
        }
        if (
          data?.id !== id ||
          !Number.isInteger(data.revision) ||
          data.revision < 1
        ) {
          failure(null, true);
          return;
        }
        clearCreation();
        if (await open(id, isCurrent)) {
          if (await loadList(isCurrent))
            message(
              "Ficha ficticia creada. Ya puedes editarla o citarla en la agenda.",
            );
        } else if (isCurrent())
          message(
            "El alta se ha confirmado, pero no se pudo abrir. Carga las fichas para consultarla.",
          );
      } finally {
        if (isCurrent()) $("patient-create-fields").disabled = false;
      }
    });
  });
  $("patient-load").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !confirmPatientDiscard()) return;
      const rows = await loadList(isCurrent);
      if (rows && isCurrent()) {
        clearCreation();
        clearEditor();
        message(
          rows.length
            ? "Pacientes ficticios cargados. Elige una ficha."
            : "No hay fichas. Puedes crear una ficha ficticia o preparar los dos ejemplos iniciales.",
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
        clearCreation();
        clearEditor();
        message(
          "Conjunto ficticio preparado sin duplicar ni sustituir otras fichas.",
        );
      }
    }),
  );
  $("patient-refresh").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (isAuthorized() && selected && confirmPatientDiscard())
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
      if (patch.alias !== undefined) {
        $("patient-name").textContent =
          "FICTICIO · " + sent.alias.trim().replace(/\s+/g, " ");
        const row = patients.find((p) => p.id === selected.id);
        if (row) row.name = $("patient-name").textContent;
        renderList();
      }
      message(
        hasPatientChanges()
          ? "Ficha guardada. Hay cambios posteriores sin guardar."
          : "Ficha ficticia guardada en la base privada.",
      );
    });
  });
  $("patient-archive").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized() || !selected || selected.archived) return;
      if (hasPatientChanges()) {
        message("Guarda o descarta los cambios de la ficha antes de archivar.");
        return;
      }
      if (
        !window.confirm(
          "¿Archivar esta ficha ficticia? Se conserva su historial; antes deben resolverse las citas programadas.",
        )
      )
        return;
      const previous = { ...selected };
      $("patient-fields").disabled = true;
      try {
        const { data, error } = await client.rpc(
          "clinical_patient_archive_test",
          { p_id: previous.id, p_expected_revision: previous.revision },
        );
        if (!isCurrent()) return;
        if (error) {
          failure(error, true);
          return;
        }
        if (
          data?.id !== previous.id ||
          data.revision !== previous.revision + 1
        ) {
          failure(null, true);
          return;
        }
        if (await open(data.id, isCurrent)) {
          await loadList(isCurrent);
          if (isCurrent())
            message(
              "Ficha ficticia archivada. Se conservan sus versiones, sesiones y auditoría.",
            );
        }
      } finally {
        if (isCurrent() && selected)
          $("patient-fields").disabled = selected.archived;
      }
    }),
  );
  window.addEventListener("beforeunload", (event) => {
    if (hasPatientChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
