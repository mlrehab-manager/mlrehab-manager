import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptBackup,
  decryptBackup,
  MAX_PLAINTEXT_BYTES,
} from "./crypto.mjs";
const password = "Frase-sintetica-solo-para-pruebas-2026";
const fixture = {
  testOnly: true,
  patients: [
    {
      id: "synthetic-1",
      name: "Paciente ficticio Á",
      history: "Ejemplo ficticio 🧪",
      revision: 2,
    },
  ],
  versions: [
    {
      patient_id: "synthetic-1",
      revision: 1,
      payload: { name: "Paciente ficticio Á" },
    },
  ],
  audit: [{ action: "patient.update", revision: 2 }],
};

test("encrypted synthetic snapshot round-trips without losing history, Unicode or revisions", async () => {
  const file = await encryptBackup(fixture, password);
  assert.ok(!file.includes("Paciente ficticio"));
  assert.ok(!file.includes(password));
  assert.deepEqual(await decryptBackup(file, password), fixture);
});
test("each encryption uses an independent salt and nonce", async () => {
  const first = JSON.parse(await encryptBackup(fixture, password));
  const second = JSON.parse(await encryptBackup(fixture, password));
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
});
test("wrong password and tampered ciphertext, salt or nonce never produce a restore", async () => {
  const file = await encryptBackup(fixture, password);
  await assert.rejects(
    decryptBackup(file, "Otra-frase-sintetica-de-pruebas"),
    /No se ha podido descifrar/,
  );
  for (const field of ["data", "iv", "salt"]) {
    const changed = JSON.parse(file),
      holder = field === "salt" ? changed.kdf : changed;
    holder[field] =
      (holder[field][0] === "A" ? "B" : "A") + holder[field].slice(1);
    await assert.rejects(
      decryptBackup(JSON.stringify(changed), password),
      /No se ha podido descifrar/,
    );
  }
});
test("unknown formats, algorithms, fields and attacker-selected KDF work are rejected before decryption", async () => {
  const original = JSON.parse(await encryptBackup(fixture, password));
  for (const change of [
    (f) => (f.version = 2),
    (f) => (f.cipher = "none"),
    (f) => (f.kdf.iterations = 1e12),
    (f) => (f.kdf.hash = "SHA-1"),
    (f) => (f.extra = "unexpected"),
    (f) => (f.iv = "invalid"),
    (f) => (f.kdf.salt = ""),
  ]) {
    const file = structuredClone(original);
    change(file);
    await assert.rejects(
      decryptBackup(JSON.stringify(file), password),
      /Formato de copia/,
    );
  }
  await assert.rejects(decryptBackup("{invalid", password), /Formato de copia/);
});
test("file size, cleartext size and passphrase length have explicit limits", async () => {
  await assert.rejects(encryptBackup(fixture, "short"), /frase de cifrado/);
  await assert.rejects(
    encryptBackup(fixture, " ".repeat(20)),
    /frase de cifrado/,
  );
  await assert.rejects(
    encryptBackup(fixture, "x".repeat(1025)),
    /frase de cifrado/,
  );
  await assert.rejects(
    encryptBackup({ value: "x".repeat(MAX_PLAINTEXT_BYTES) }, password),
    /demasiado grande/,
  );
  await assert.rejects(
    decryptBackup("x".repeat(MAX_PLAINTEXT_BYTES * 2), password),
    /demasiado grande/,
  );
});
