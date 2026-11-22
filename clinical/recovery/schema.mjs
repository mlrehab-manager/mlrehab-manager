import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const directory = new URL("../migrations/", import.meta.url);
export async function recoverySchema() {
  const names = (await readdir(directory))
      .filter((n) => /^\d+_[a-z0-9_]+\.sql$/.test(n))
      .sort(),
    manifest = [];
  const statements = [];
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), "utf8");
    manifest.push({
      name,
      sha256: createHash("sha256").update(sql).digest("hex"),
    });
    statements.push(
      sql.replace(/^begin;\s*$/gim, "").replace(/^commit;\s*$/gim, ""),
    );
  }
  if (names.length !== 15)
    throw new Error(
      "Revisar el manifiesto de recuperación antes de usar nuevas migraciones.",
    );
  const sql = `begin;\ndo $$begin if to_regnamespace('clinical_private') is not null then raise exception 'El destino ya contiene el esquema de aplicación';end if;end$$;\n${statements.join("\n")}\ncommit;\n`;
  return {
    sql,
    manifest,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}
