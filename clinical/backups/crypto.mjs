// Encryption primitive only. This is not a database exporter or clinical restore API.
const FORMAT = "mlrehab-encrypted-backup";
const ITERATIONS = 600000;
export const MAX_PLAINTEXT_BYTES = 4 * 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 16;
const MAX_FILE_CHARS = 4 * Math.ceil(MAX_CIPHERTEXT_BYTES / 3) + 1024;
const encoder = new TextEncoder();
const aad = encoder.encode(
  `${FORMAT}:1:AES-GCM-256:PBKDF2-SHA256:${ITERATIONS}`,
);

function encode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 4096)
    binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary);
}
function decode(value, max) {
  if (
    typeof value !== "string" ||
    value.length > 4 * Math.ceil(max / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("Formato de copia no compatible");
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (bytes.length > max || encode(bytes) !== value)
    throw new Error("Formato de copia no compatible");
  return bytes;
}
function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}
async function derive(password, salt, usage) {
  if (
    typeof password !== "string" ||
    password.trim().length < 16 ||
    password.length > 1024
  )
    throw new Error(
      "La frase de cifrado debe tener entre 16 y 1024 caracteres",
    );
  const bytes = encoder.encode(password);
  try {
    const base = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      [usage],
    );
  } finally {
    bytes.fill(0);
  }
}

export async function encryptBackup(payload, password) {
  const json = JSON.stringify(payload);
  if (typeof json !== "string" || json.length > MAX_PLAINTEXT_BYTES)
    throw new Error("Copia vacía o demasiado grande");
  const plaintext = encoder.encode(json);
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    plaintext.fill(0);
    throw new Error("Copia demasiado grande");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await derive(password, salt, "encrypt");
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        plaintext,
      ),
    );
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      cipher: "AES-GCM-256",
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: ITERATIONS,
        salt: encode(salt),
      },
      iv: encode(iv),
      data: encode(ciphertext),
    });
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptBackup(serialized, password) {
  if (typeof serialized !== "string" || serialized.length > MAX_FILE_CHARS)
    throw new Error("Archivo de copia no válido o demasiado grande");
  let file;
  try {
    file = JSON.parse(serialized);
  } catch {
    throw new Error("Formato de copia no compatible");
  }
  if (
    !exactKeys(file, ["format", "version", "cipher", "kdf", "iv", "data"]) ||
    file.format !== FORMAT ||
    file.version !== 1 ||
    file.cipher !== "AES-GCM-256" ||
    !exactKeys(file.kdf, ["name", "hash", "iterations", "salt"]) ||
    file.kdf.name !== "PBKDF2" ||
    file.kdf.hash !== "SHA-256" ||
    file.kdf.iterations !== ITERATIONS
  )
    throw new Error("Formato de copia no compatible");
  const salt = decode(file.kdf.salt, 16),
    iv = decode(file.iv, 12),
    ciphertext = decode(file.data, MAX_CIPHERTEXT_BYTES);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16)
    throw new Error("Formato de copia no compatible");
  const key = await derive(password, salt, "decrypt");
  let plaintext;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        ciphertext,
      ),
    );
    if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error();
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
  } catch {
    throw new Error("No se ha podido descifrar la copia");
  } finally {
    plaintext?.fill(0);
  }
}
