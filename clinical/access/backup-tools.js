import { isClinicalMode } from "./data-mode.js";
import {
  encryptBackup,
  decryptBackup,
  MAX_BACKUP_FILE_BYTES,
} from "../backups/crypto.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
const $ = (id) => document.getElementById(id);
let pendingCheck = null;
let checkEpoch = 0;
function clearCheck() {
  checkEpoch++;
  pendingCheck = null;
  $("backup-custody").reset();
  $("backup-custody").hidden = true;
  $("backup-checked-file").textContent = "";
}
export function clearBackupSecrets() {
  clearCheck();
  $("backup-last-check").textContent =
    "Todavía no has consultado el registro de comprobaciones.";
  for (const id of [
    "backup-phrase",
    "backup-confirm",
    "restore-phrase",
    "backup-file",
  ])
    $(id).value = "";
}
function download(encrypted) {
  const url = URL.createObjectURL(
    new Blob([encrypted], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `mlrehab-${isClinicalMode() ? "copia" : "prueba"}-${new Date().toISOString().slice(0, 10)}.mlrehab`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function installBackupTools({
  client,
  run,
  isAuthorized,
  message,
  hasPendingChanges = () => false,
}) {
  const locations = {
    this_device: "este dispositivo",
    icloud_drive: "iCloud Drive",
    computer: "carpeta local del ordenador",
    disconnected_drive: "soporte desconectado",
  };
  const date = (value) =>
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  function showCheck(check) {
    if (!check) {
      $("backup-last-check").textContent =
        "Aún no hay comprobaciones registradas en este modo de cuenta.";
      return;
    }
    const d = check.details;
    if (
      !locations[d?.location] ||
      check.data_mode !== (isClinicalMode() ? "clinical" : "test")
    )
      throw new Error();
    $("backup-last-check").textContent =
      `Comprobación registrada: ${date(check.checked_at)}. Archivo exportado: ${date(check.exported_at)}.\n` +
      `Destino declarado: ${locations[d.location]}.\n` +
      `Copia independiente: ${d.independent_copy ? "declarada" : "pendiente"}. Frase recuperable por separado: ${d.phrase_separate ? "declarada" : "pendiente"}. Comprobación en otro dispositivo: ${d.verified_elsewhere ? "declarada" : "pendiente"}.\n` +
      "Este registro no confirma una restauración del servidor ni incluye cambios posteriores a la exportación. Repite la copia al terminar una jornada con cambios.";
  }
  async function currentOwner(isCurrent) {
    const { data: access, error: accessError } = await client.rpc(
      "clinical_access_check",
    );
    if (!isCurrent()) return null;
    if (accessError || access?.authorized !== true) throw new Error();
    const { data, error } = await client.auth.getUser();
    if (!isCurrent()) return null;
    if (error || !data.user) throw new Error();
    return data.user.id;
  }
  $("backup-export").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized()) return;
      if (hasPendingChanges()) {
        message(
          "Guarda o descarta los cambios de la ficha, cita, sesión o catálogo antes de crear una copia.",
        );
        return;
      }
      clearCheck();
      let phrase = $("backup-phrase").value;
      const matches = phrase === $("backup-confirm").value;
      $("backup-phrase").value = $("backup-confirm").value = "";
      try {
        if (!matches || phrase.trim().length < 16 || phrase.length > 1024) {
          message(
            "Usa una frase de al menos 16 caracteres y repítela exactamente.",
          );
          return;
        }
        message("Recopilando las fichas ficticias y cifrando la copia…");
        const owner = await currentOwner(isCurrent);
        if (!owner) return;
        const { data, error } = await client.rpc("clinical_backup_export_test");
        if (!isCurrent()) return;
        if (error) throw new Error();
        const snapshot = validateSnapshot(data);
        if (
          snapshot.clinician_id !== owner ||
          isClinicalMode() !== (snapshot.version === 6)
        )
          throw new Error();
        const encrypted = await encryptBackup(snapshot, phrase);
        if (!isCurrent()) return;
        download(encrypted);
        message(
          "Copia cifrada preparada. Guarda el archivo y después compruébalo con tu frase.",
        );
      } catch {
        if (isCurrent())
          message(
            "No se pudo preparar la copia completa. Revisa la conexión y vuelve a intentarlo. No se descargan copias parciales.",
          );
      } finally {
        phrase = null;
      }
    });
  });
  $("backup-inspect").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized()) return;
      const file = $("backup-file").files[0];
      clearCheck();
      const attempt = checkEpoch;
      let phrase = $("restore-phrase").value;
      $("restore-phrase").value = "";
      try {
        if (!file || file.size > MAX_BACKUP_FILE_BYTES) throw new Error();
        const owner = await currentOwner(isCurrent);
        if (!owner || attempt !== checkEpoch) return;
        const encrypted = await file.text();
        const snapshot = validateSnapshot(
          await decryptBackup(encrypted, phrase),
        );
        if (!isCurrent() || attempt !== checkEpoch) return;
        if (snapshot.clinician_id !== owner) throw new Error();
        const exportEvent = snapshot.audit_events
          .filter((e) => e.action === "backup.export")
          .at(-1);
        if (snapshot.version === (isClinicalMode() ? 6 : 5) && exportEvent) {
          const bytes = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(encrypted),
          );
          if (!isCurrent() || attempt !== checkEpoch) return;
          pendingCheck = {
            version: snapshot.version,
            export_event_id: exportEvent.id,
            encrypted_sha256: Array.from(new Uint8Array(bytes), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join(""),
            requestId: crypto.randomUUID(),
            submitted: null,
          };
          $("backup-checked-file").textContent =
            `Archivo del ${date(snapshot.created_at)}, comprobado localmente en esta sesión.`;
          $("backup-custody").hidden = false;
        }
        message(
          `Archivo verificado: ${snapshot.patients.length} pacientes ficticios, ${snapshot.patient_versions.length} versiones y ${snapshot.audit_events.length} eventos.${snapshot.version >= 2 ? ` Incluye ${snapshot.appointments.length} citas y ${snapshot.sessions.length} sesiones.` : ""}${snapshot.version >= 3 ? ` Incluye ${snapshot.custom_exercises.length} ejercicios propios.` : ""} No se han cambiado datos de la base.`,
        );
      } catch {
        if (isCurrent() && attempt === checkEpoch)
          message(
            "No se pudo verificar el archivo. Revisa la frase y que sea una copia de prueba completa de esta cuenta.",
          );
      } finally {
        phrase = null;
        if (attempt === checkEpoch) $("backup-file").value = "";
      }
    });
  });
  $("backup-file").addEventListener("change", () => {
    clearCheck();
    message("Archivo seleccionado. Introduce su frase y compruébalo.");
  });
  $("backup-status-load").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!isAuthorized()) return;
      $("backup-last-check").textContent = "Consultando el registro…";
      const { data, error } = await client.rpc("clinical_backup_check_status");
      if (!isCurrent()) return;
      if (error || !data || !Object.hasOwn(data, "latest")) {
        $("backup-last-check").textContent =
          "No se pudo consultar el registro. Vuelve a intentarlo.";
        return;
      }
      showCheck(data.latest);
    }),
  );
  $("backup-custody").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!isAuthorized() || !pendingCheck) return;
      const p_details = {
        version: pendingCheck.version,
        export_event_id: pendingCheck.export_event_id,
        encrypted_sha256: pendingCheck.encrypted_sha256,
        location: $("backup-location").value,
        independent_copy: $("backup-independent").checked,
        phrase_separate: $("backup-phrase-separate").checked,
        verified_elsewhere: $("backup-other-device").checked,
      };
      const submitted = JSON.stringify(p_details);
      if (pendingCheck.submitted && pendingCheck.submitted !== submitted)
        pendingCheck.requestId = crypto.randomUUID();
      pendingCheck.submitted = submitted;
      const { data, error } = await client.rpc("clinical_backup_check_record", {
        p_details,
        p_request_id: pendingCheck.requestId,
      });
      if (!isCurrent()) return;
      if (error || !data) {
        message(
          "No se pudo confirmar el registro. Puedes reintentar sin repetir la comprobación del archivo.",
        );
        return;
      }
      showCheck(data);
      clearCheck();
      message(
        "Comprobación registrada. Revisa los pasos de custodia que siguen pendientes.",
      );
    });
  });
}
