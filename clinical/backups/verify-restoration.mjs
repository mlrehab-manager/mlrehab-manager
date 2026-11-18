// Synthetic rehearsal only. No remote credentials or clinical files.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { testSource } from "./test-source.mjs";
import { encryptBackup } from "./crypto.mjs";
import { snapshotDigest } from "./snapshot.mjs";
import { restoreEncryptedToSandbox } from "./restore-sandbox.mjs";
const directory = new URL("../../work/backup-rehearsal/", import.meta.url);
await mkdir(directory, { recursive: true });
const source = await testSource();
let snapshot,
  sourceHash,
  encrypted,
  phrase = crypto.randomUUID() + crypto.randomUUID();
try {
  await source.asUser();
  await source.rpc("clinical_backup_seed_test");
  const exercise = (
    await source.db.query(
      "select public.clinical_exercise_create_test('Ejercicio propio ficticio de ensayo','eccentric',array['knee']) as result",
    )
  ).rows[0].result;
  const patient = (await source.rpc("clinical_patient_list_test")).find(
    (p) => !p.archived,
  );
  const appointment = (
    await source.db.query(
      "select public.clinical_appointment_save_test(null,null,$1,'2026-11-20T09:00',45,'scheduled') as result",
      [patient.id],
    )
  ).rows[0].result;
  const session = (
    await source.db.query(
      "select public.clinical_session_save_test(null,null,$1,'Evolución ficticia','Pasivo ficticio','Ejercicio propio ficticio de ensayo') as result",
      [appointment.id],
    )
  ).rows[0].result;
  await source.db.query(
    "select public.clinical_session_save_test($1,1,$2,'Evolución ficticia revisada','Pasivo ficticio','Ejercicio propio ficticio de ensayo')",
    [session.id, appointment.id],
  );
  await source.db.query(
    "select public.clinical_exercise_save_test($1,1,'Ejercicio propio ficticio revisado','eccentric',array['knee'],false)",
    [exercise.id],
  );
  await source.db.query(
    "select public.clinical_exercise_save_test($1,2,'Ejercicio propio ficticio revisado','eccentric',array['knee'],true)",
    [exercise.id],
  );
  snapshot = await source.rpc("clinical_backup_export_test");
  sourceHash = await snapshotDigest(snapshot);
  encrypted = await encryptBackup(snapshot, phrase);
  await writeFile(new URL("synthetic.mlrehab", directory), encrypted, {
    mode: 0o600,
  });
} finally {
  await source.db.close();
  snapshot = null;
  encrypted = null;
}
const restored = await restoreEncryptedToSandbox(
  await readFile(new URL("synthetic.mlrehab", directory), "utf8"),
  phrase,
);
phrase = null;
try {
  const active = (
    await restored.db.query(
      "select count(*)::int as n from patients where archived_at is null",
    )
  ).rows[0].n;
  const archived = (
    await restored.db.query(
      "select count(*)::int as n from patients where archived_at is not null",
    )
  ).rows[0].n;
  if (sourceHash !== restored.restoredHash || active !== 1 || archived !== 1)
    throw new Error("Ensayo de restauración fallido");
  const report = {
    tested_at: new Date().toISOString(),
    test_only: true,
    source:
      "PostgreSQL/PGlite with application migrations and simulated Auth identities",
    target:
      "New in-memory PostgreSQL/PGlite database without Auth or application RPCs",
    input: "Encrypted file read back from disk",
    source_closed_before_restore: true,
    counts: {
      ...restored.counts,
      ...restored.agendaCounts,
      customExercises: restored.exerciseCount,
      exerciseVersions: restored.exerciseVersionsCount,
      active,
      archived,
    },
    snapshot_version: 4,
    source_hash: sourceHash,
    restored_hash: restored.restoredHash,
    passed: true,
    limits: [
      "Not a hosted Supabase disaster recovery test",
      "Does not restore Auth, files, provider settings or demo-only resources",
      "Does not provision external backup storage or guarantee RPO/RTO",
    ],
  };
  await writeFile(
    new URL("../verification/BACKUP_RESTORE_REPORT.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      patients: restored.counts.patients,
      versions: restored.counts.versions,
      events: restored.counts.events,
      agenda: restored.agendaCounts,
      source_closed_before_restore: true,
    }),
  );
} finally {
  await restored.db.close();
}
