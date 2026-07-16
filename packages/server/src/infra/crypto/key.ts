import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolveCwd } from "node:path";
import process from "node:process";
import { env } from "#foundation/env";

// The boot key path for the credentials SecretBox (./secrets). Decode CREDENTIALS_KEY (hex OR base64,
// validated at exactly 32 bytes), or — when CREDENTIALS_KEY_AUTO is set — auto-generate + persist a key
// to `.credentials-key` (mode 0600) next to the DB on first boot. Degrade, NEVER throw at boot: an
// unset/malformed/wrong-length key returns null ⇒ createSecretBox(null) yields a DISABLED box. The
// `.credentials-key` file is gitignored and is the ONLY decryption recovery path — back it up alongside
// the DB; wiping the data dir without it loses every stored credential. A corrupt existing keyfile FAILS
// CLOSED (returns null — never overwrites; the operator must investigate).

const CREDENTIALS_KEY_BYTES = 32;
// 32 bytes as lowercase/uppercase hex is exactly 64 chars.
const HEX_KEY_LENGTH = 64;
// Owner-only read/write — the keyfile must never be group/world readable.
const KEYFILE_MODE = 0o600;
const KEYFILE_NAME = ".credentials-key";
const FILE_URL_PREFIX = "file:";

/** Try hex first, then base64 — return a 32-byte buffer or null. Accepting both encodings means an
 *  operator running `openssl rand -hex 32` and one running `openssl rand -base64 32` both get a working
 *  key. The 32-byte length check is the validator: a non-key string decodes to garbage but rarely lands
 *  at exactly 32 bytes. */
export function decode32Bytes(raw: string): Buffer | null {
  const trimmed = raw.trim();
  // hex: validate the exact char set + length BEFORE decoding (Buffer.from silently drops non-hex).
  if (new RegExp(`^[0-9a-fA-F]{${HEX_KEY_LENGTH}}$`).test(trimmed)) {
    const hex = Buffer.from(trimmed, "hex");
    if (hex.length === CREDENTIALS_KEY_BYTES) {
      return hex;
    }
  }
  // base64: Buffer.from is lenient (truncates short inputs), so the byte-length check is the real gate.
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === CREDENTIALS_KEY_BYTES) {
      return b64;
    }
  } catch {
    // fall through to null
  }
  return null;
}

/** Derive the local data directory from a libsql DATABASE_URL, or null for a remote (turso) URL that has
 *  no local data dir to write a keyfile into. Pure (cwd-relative resolution only). */
export function dataDirFromDbUrl(dbUrl: string): string | null {
  if (!dbUrl.startsWith(FILE_URL_PREFIX)) {
    return null;
  }
  const dbPath = dbUrl.slice(FILE_URL_PREFIX.length);
  return dirname(resolveCwd(dbPath));
}

/** Load an existing `.credentials-key`, or generate + persist a fresh one (mode 0600) on first call.
 *  A corrupt/unrecognized existing file FAILS CLOSED (returns null — never overwrites). Filesystem
 *  errors (permission, read-only) also return null ⇒ a disabled box rather than a partial crypto state. */
export function loadOrCreateKeyfile(keyPath: string): Buffer | null {
  try {
    if (existsSync(keyPath)) {
      const raw = readFileSync(keyPath, "utf-8").trim();
      // Length mismatch / unrecognized encoding ⇒ corrupt keyfile. Return null (disable) rather than
      // overwrite; the operator must investigate why the recovery key changed.
      return decode32Bytes(raw);
    }
    const fresh = randomBytes(CREDENTIALS_KEY_BYTES);
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, `${fresh.toString("hex")}\n`, { mode: KEYFILE_MODE });
    // Use stderr, NOT getLog() — the logger may not be initialized at this boot point, and a
    // logger→env→crypto import cycle is the hazard the file header warns about. First-boot one-shot
    // only; silenced under tests (which spin temp credential stores up and down constantly).
    if (env.NODE_ENV !== "test") {
      process.stderr.write(`crypto: auto-generated CREDENTIALS_KEY → ${keyPath} (mode 0600). Back this up alongside the DB.\n`);
    }
    return fresh;
  } catch {
    return null;
  }
}

/** The CREDENTIALS_KEY_AUTO path: resolve the data dir from DATABASE_URL and load/create the keyfile
 *  there. Returns null (⇒ disabled box) for a remote DB URL or any filesystem failure. */
export function resolveAutoKey(): Buffer | null {
  const dataDir = dataDirFromDbUrl(env.DATABASE_URL);
  if (dataDir === null) {
    return null;
  }
  return loadOrCreateKeyfile(join(dataDir, KEYFILE_NAME));
}

/** The boot entry point: decode CREDENTIALS_KEY, else the auto-key path when opted in, else null. The
 *  composition root passes the result to `createSecretBox`. Never throws — a missing/bad key DEGRADES. */
export function credentialsKeyFromEnv(): Buffer | null {
  const raw = env.CREDENTIALS_KEY;
  if (raw !== undefined && raw !== "") {
    return decode32Bytes(raw);
  }
  if (env.CREDENTIALS_KEY_AUTO) {
    return resolveAutoKey();
  }
  return null;
}
