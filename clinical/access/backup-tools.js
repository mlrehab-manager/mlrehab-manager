import {
  encryptBackup,
  decryptBackup,
  MAX_BACKUP_FILE_BYTES,
} from "../backups/crypto.mjs";
import { validateSnapshot } from "../backups/snapshot.mjs";
const $ = (id) => document.getElementById(id);
export function clearBackupSecrets() {
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
  link.download = `mlrehab-prueba-${new Date().toISOString().slice(0, 10)}.mlrehab`;
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
        message("Preparando el conjunto ficticio y cifrando la copia…");
        const owner = await currentOwner(isCurrent);
        if (!owner) return;
        const { error: seedError } = await client.rpc(
          "clinical_backup_seed_test",
        );
        if (!isCurrent()) return;
        if (seedError) throw new Error();
        const { data, error } = await client.rpc("clinical_backup_export_test");
        if (!isCurrent()) return;
        if (error) throw new Error();
        const snapshot = validateSnapshot(data);
        if (snapshot.clinician_id !== owner) throw new Error();
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
      let phrase = $("restore-phrase").value;
      $("restore-phrase").value = "";
      try {
        if (!file || file.size > MAX_BACKUP_FILE_BYTES) throw new Error();
        const owner = await currentOwner(isCurrent);
        if (!owner) return;
        const snapshot = validateSnapshot(
          await decryptBackup(await file.text(), phrase),
        );
        if (!isCurrent()) return;
        if (snapshot.clinician_id !== owner) throw new Error();
        message(
          `Archivo verificado: ${snapshot.patients.length} pacientes ficticios, ${snapshot.patient_versions.length} versiones y ${snapshot.audit_events.length} eventos.${snapshot.version >= 2 ? ` Incluye ${snapshot.appointments.length} citas y ${snapshot.sessions.length} sesiones.` : ""}${snapshot.version === 3 ? ` Incluye ${snapshot.custom_exercises.length} ejercicios propios.` : ""} No se han cambiado datos de la base.`,
        );
      } catch {
        if (isCurrent())
          message(
            "No se pudo verificar el archivo. Revisa la frase y que sea una copia de prueba completa de esta cuenta.",
          );
      } finally {
        phrase = null;
        $("backup-file").value = "";
      }
    });
  });
}
