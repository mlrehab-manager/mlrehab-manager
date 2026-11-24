import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRecoveryAccess } from "./build-access.mjs";
async function setup(fail = false) {
  const root = await mkdtemp(join(tmpdir(), "mlrehab-recovery-build-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "access-dist"));
  const names = [
    "index.html",
    "access.js",
    "access.css",
    "_headers",
    "private.webmanifest",
    "app-icon.png",
    "backup-guide.txt",
    "storage-guide.txt",
  ];
  for (const n of names)
    await writeFile(join(root, "access-dist", n), "original " + n);
  const html =
    '<body><title>MLREHAB Manager · Consulta</title><h1 id="access-title">Accede a tu consulta</h1><input id="email"><div id="reserve-options"><h2>Recuperación de acceso</h2><button id="add-reserve"></button></div><button id="test-revoke"></button>';
  await writeFile(
    join(root, "src/build.mjs"),
    `import {writeFile} from 'node:fs/promises';for(const n of ${JSON.stringify(names)})await writeFile(new URL('../access-dist/'+n,import.meta.url),n==='index.html'?${JSON.stringify(html)}:n==='private.webmanifest'?'{}':'target '+n);${fail ? "process.exit(1)" : ""}`,
  );
  return { root, names };
}
test("the recovery entry is clearly marked and preserves all usual assets", async () => {
  const { root, names } = await setup();
  try {
    await buildRecoveryAccess(
      join(root, "src/build.mjs"),
      join(root, "recovery-dist"),
      { MLREHAB_SUPABASE_URL: "https://wtlwhokxgskktjcqqtzn.supabase.co" },
    );
    for (const n of names)
      assert.equal(
        await readFile(join(root, "access-dist", n), "utf8"),
        "original " + n,
      );
    const html = await readFile(join(root, "recovery-dist/index.html"), "utf8");
    assert.ok(html.includes("Proyecto independiente de recuperación"));
    assert.ok(html.includes('value="recuperacion@example.invalid" readonly'));
    assert.ok(html.includes('id="reserve-options" hidden'));
    const manifest = JSON.parse(
      await readFile(join(root, "recovery-dist/private.webmanifest"), "utf8"),
    );
    assert.equal(manifest.name, "MLREHAB · Recuperación");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("failed builds restore usual assets and an unapproved backend is refused", async () => {
  const { root, names } = await setup(true);
  try {
    await assert.rejects(() =>
      buildRecoveryAccess(
        join(root, "src/build.mjs"),
        join(root, "recovery-dist"),
        { MLREHAB_SUPABASE_URL: "https://wtlwhokxgskktjcqqtzn.supabase.co" },
      ),
    );
    for (const n of names)
      assert.equal(
        await readFile(join(root, "access-dist", n), "utf8"),
        "original " + n,
      );
    await assert.rejects(() =>
      buildRecoveryAccess(
        join(root, "src/build.mjs"),
        join(root, "recovery-dist"),
        { MLREHAB_SUPABASE_URL: "https://jrrnvjrwrphmconrkayc.supabase.co" },
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
