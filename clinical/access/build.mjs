import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

const origin = process.env.MLREHAB_ACCESS_ORIGIN;
const url = process.env.MLREHAB_SUPABASE_URL;
const key = process.env.MLREHAB_SUPABASE_PUBLISHABLE_KEY;
const local = origin === "http://127.0.0.1:4180";
if (
  !origin ||
  (!local &&
    (!origin.startsWith("https://") || new URL(origin).origin !== origin))
)
  throw new Error(
    "Define MLREHAB_ACCESS_ORIGIN con un origen HTTPS exacto (o localhost de pruebas).",
  );
// Never share a storage/security origin with the demo, even under a different path.
if (new URL(origin).hostname === "mlrehab-manager.github.io")
  throw new Error("El acceso requiere un origen separado de la demo.");
if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url))
  throw new Error("Falta una URL de proyecto Supabase válida.");
if (!key?.startsWith("sb_publishable_"))
  throw new Error("Usa exclusivamente una clave publicable moderna.");

const out = new URL("../access-dist/", import.meta.url);
await mkdir(out, { recursive: true });
await build({
  entryPoints: [new URL("./access.js", import.meta.url).pathname],
  outfile: new URL("access.js", out).pathname,
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  define: {
    ACCESS_ORIGIN: JSON.stringify(origin),
    SUPABASE_URL: JSON.stringify(url),
    SUPABASE_KEY: JSON.stringify(key),
  },
});
const csp = `default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src ${url}; base-uri 'none'; form-action 'none'; object-src 'none'`;
const html = (
  await readFile(new URL("./index.html", import.meta.url), "utf8")
).replace("__CSP__", csp);
await writeFile(new URL("index.html", out), html);
await copyFile(
  new URL("./access.css", import.meta.url),
  new URL("access.css", out),
);
// Hosting must actually serve these HTTP headers; the meta CSP cannot prevent framing.
await writeFile(
  new URL("_headers", out),
  `/*\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`,
);
console.log(
  "Pantalla de acceso preparada en clinical/access-dist (sin publicar).",
);
