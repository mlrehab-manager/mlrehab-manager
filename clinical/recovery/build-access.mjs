// Build a separate recovery entry while preserving the usual compiled entry byte-for-byte.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
export async function buildRecoveryAccess(builder, output, env = process.env) {
  const approved = "https://wtlwhokxgskktjcqqtzn.supabase.co";
  if (env.MLREHAB_SUPABASE_URL !== approved)
    throw new Error("El acceso de recuperación requiere el destino aprobado");
  builder = resolve(builder);
  output = resolve(output);
  const sourceOutput = resolve(dirname(builder), "../access-dist");
  if (output === sourceOutput)
    throw new Error(
      "El acceso habitual y el recuperado deben compilarse por separado",
    );
  const files = [
      "index.html",
      "access.js",
      "access.css",
      "_headers",
      "private.webmanifest",
      "app-icon.png",
      "backup-guide.txt",
      "storage-guide.txt",
    ],
    original = new Map();
  for (const name of files) {
    try {
      original.set(name, await readFile(join(sourceOutput, name)));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  try {
    const build = spawnSync(process.execPath, [builder], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    if (build.status !== 0)
      throw new Error("No se pudo compilar el acceso de recuperación");
    await mkdir(output, { recursive: true });
    for (const name of files) {
      let content = await readFile(join(sourceOutput, name));
      if (name === "private.webmanifest") {
        const manifest = JSON.parse(content.toString("utf8"));
        manifest.name = "MLREHAB · Recuperación";
        manifest.short_name = "Recuperación";
        content = Buffer.from(JSON.stringify(manifest));
      }
      if (name === "index.html") {
        let html = content.toString("utf8");
        if (!html.includes('<h1 id="access-title">Accede a tu consulta</h1>'))
          throw new Error("Revisar la plantilla de acceso antes de publicar");
        html = html
          .replace(
            "<title>MLREHAB Manager · Consulta</title>",
            "<title>Recuperación de pruebas · MLREHAB</title>",
          )
          .replace(
            '<h1 id="access-title">Accede a tu consulta</h1>',
            '<h1 id="access-title">Recuperación de pruebas</h1><p><strong>Proyecto independiente de recuperación.</strong> Entra con recuperacion@example.invalid y la contraseña que creaste para esa cuenta ficticia. Los datos que verás son los del ensayo recuperado.</p><p>Si se solicita un autenticador, pertenece únicamente a esta cuenta ficticia. Mantén su entrada separada de la cuenta habitual de MLREHAB.</p>',
          )
          .replace(
            'id="email"',
            'id="email" value="recuperacion@example.invalid" readonly',
          );
        if (!html.includes('id="reserve-options"'))
          throw new Error("Revisar el apartado de recuperación de acceso");
        html = html
          .replace("<body>", '<body data-recovery="true">')
          .replace('id="reserve-options"', 'id="reserve-options" hidden');
        content = Buffer.from(html);
      }
      await writeFile(join(output, name), content);
    }
  } finally {
    await mkdir(sourceOutput, { recursive: true });
    for (const name of files) {
      if (original.has(name))
        await writeFile(join(sourceOutput, name), original.get(name));
      else await rm(join(sourceOutput, name), { force: true });
    }
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildRecoveryAccess(process.argv[2], process.argv[3]);
