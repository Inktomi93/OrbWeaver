import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { SECRET_FILE_NAMES } from "#foundation/data-layout";
import { env } from "#foundation/env";
import type { BootSecretResolution, BootSecretSource } from "./contract.ts";

// The boot secrets: the credentials SecretBox key and the SESSION_SECRET pepper. An explicit env value wins;
// otherwise each lives in a keyfile under the data layout's `secrets/` dir (mode 0600), read back on every
// boot, so the keyfiles join the db's backup unit. A keyfile that exists but cannot be used is NEVER replaced:
// a new value would orphan every stored credential, or every local password and session. A keyfile that does
// not exist yet is reported as `absent`, not generated: whether generating is safe depends on the db, and
// `entry/boot` decides it after the db opens. Nothing here throws at boot.

const CREDENTIALS_KEY_BYTES = 32;
// 32 bytes as lowercase/uppercase hex is exactly 64 chars.
const HEX_KEY_LENGTH = 64;
// Owner-only read/write — the keyfile must never be group/world readable.
const KEYFILE_MODE = 0o600;
// Random suffix for the publish temp file beside the keyfile, so two racing boots never share one.
const TEMP_NAME_BYTES = 8;
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
  // @orb-waive caught-failure-ownership(catch): a non-decodable key is INDISTINGUISHABLE from a wrong-length one here, and both must reach the same null — the 32-byte check below is the validator and the file header states the contract (degrade to a DISABLED box, never throw at boot). Ends if decode gains a failure the caller must report separately.
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

// Whether an explicit env value wins over the keyfile. ONE predicate per secret, shared by its resolver and by
// `bootSecretProvenance`, so the boot disclaimer can never name a source the resolver did not use.
function explicitCredentialsKey(raw: string | undefined): raw is string {
  return raw !== undefined && raw !== "";
}

function explicitSessionSecret(raw: string | undefined): raw is string {
  return raw !== undefined;
}

// Use stderr, NOT getLog(): the logger may not be initialized at this boot point, and a logger→env→crypto
// import cycle is the hazard. Silenced under tests, which spin temp keyfiles up and down constantly.
function reportKeyfile(line: string): void {
  if (env.NODE_ENV !== "test") {
    process.stderr.write(`crypto: ${line}\n`);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Reads THROUGH a symlink on purpose: an operator may point the keyfile at a secrets mount. A dangling one
// throws ENOENT here, which the caller turns into a fail-closed null.
function readKeyfile(keyPath: string): Buffer | null {
  const key = decode32Bytes(readFileSync(keyPath, "utf-8"));
  if (key === null) {
    reportKeyfile(`${keyPath} exists but is not a 32-byte hex or base64 key; leaving it in place and not generating a new one.`);
  }
  return key;
}

// @orb-waive caught-failure-ownership(err): the key is already linked into place with its bytes fsynced, so a directory that cannot be fsynced (a FUSE or network mount answers ENOTSUP) costs only crash durability of the new entry; failing the boot over it would refuse a key that is on disk. Reported on stderr. Ends if the entry fsync becomes required for correctness.
function fsyncDirectory(dir: string): void {
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    reportKeyfile(`could not fsync ${dir} (${errorText(err)}); the key is written, but a crash now could lose its directory entry.`);
  }
}

// SECURITY: never replace or write through anything already at `keyPath`. The bytes go to a private temp file
// (O_EXCL, 0600, fsynced) that is hard-linked into place. link(2) fails with EEXIST on ANY existing entry,
// including a planted symlink (dangling or not), and never follows it. A rename would clobber a racing boot's
// key; an open without O_EXCL would write through a symlink. `false` means another entry won the path.
function publishKeyfile(keyPath: string, key: Buffer): boolean {
  const dir = dirname(keyPath);
  mkdirSync(dir, { recursive: true });
  const tempPath = join(dir, `${basename(keyPath)}.${randomBytes(TEMP_NAME_BYTES).toString("hex")}.tmp`);
  const fd = openSync(tempPath, "wx", KEYFILE_MODE);
  try {
    try {
      writeFileSync(fd, `${key.toString("hex")}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(tempPath, keyPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw err;
    }
  } finally {
    unlinkSync(tempPath);
  }
  fsyncDirectory(dir);
  return true;
}

/** Load an existing keyfile, or generate + persist a fresh 32-byte one (hex, mode 0600) on first call.
 *  A keyfile that exists but is not a 32-byte hex/base64 key, or cannot be read, FAILS CLOSED: it returns
 *  null and is never overwritten. A filesystem fault on first write also returns null.
 *  @remarks Creation is atomic and never clobbers: two boots racing on an empty data dir both return the one
 *  key that won the path. `generate` is the entropy source, injectable so a test can interleave a second
 *  creator between the absence check and the publish. */
export function loadOrCreateKeyfile(keyPath: string, generate: () => Buffer = () => randomBytes(CREDENTIALS_KEY_BYTES)): Buffer | null {
  // @orb-waive caught-failure-ownership(err): FAIL-CLOSED at boot by design — any filesystem fault (permission, read-only, corrupt keyfile) returns null so no caller ever re-keys over the only recovery copy. The fault is reported on stderr; the credentials box then runs DISABLED and a cookie mode refuses to boot (`entry/lifecycle.ts`). Ends if every caller moves to refusing startup on a crypto fault.
  try {
    // lstat, not exists: a dangling symlink is an entry, and it must fail closed rather than read as absent.
    if (lstatSync(keyPath, { throwIfNoEntry: false }) === undefined) {
      const fresh = generate();
      if (publishKeyfile(keyPath, fresh)) {
        reportKeyfile(`generated ${keyPath} (mode 0600). Back it up with the database.`);
        return fresh;
      }
    }
    return readKeyfile(keyPath);
  } catch (err) {
    reportKeyfile(`${keyPath} could not be read or created (${errorText(err)}); not generating a new one.`);
    return null;
  }
}

// Read a keyfile that is known to exist. The same fail-closed contract as `loadOrCreateKeyfile`'s read arm:
// a corrupt, unreadable or dangling entry is null and is never touched.
function readExistingKeyfile(keyPath: string): Buffer | null {
  // @orb-waive caught-failure-ownership(err): FAIL-CLOSED at boot by design — an unreadable keyfile returns null so no caller ever re-keys over the only recovery copy; the fault is reported on stderr and the caller degrades or refuses (`entry/lifecycle.ts`). Ends if every caller moves to refusing startup on a crypto fault.
  try {
    return readKeyfile(keyPath);
  } catch (err) {
    reportKeyfile(`${keyPath} could not be read (${errorText(err)}); not generating a new one.`);
    return null;
  }
}

// The pepper a session-secret keyfile's key stands for: its bytes as hex, whichever encoding the file used.
function sessionPepper(key: Buffer | null): string | null {
  return key?.toString("hex") ?? null;
}

/** The pepper a session-secret keyfile known to exist holds, read the way `resolveSessionSecret` reads its own
 *  keyfile; `null` when the file is not a usable key. Never writes. */
export function readSessionSecretKeyfile(path: string): string | null {
  return sessionPepper(readExistingKeyfile(path));
}

// Where a boot secret's keyfile lives, or null for a remote db that has no local backup unit to join.
function keyfilePath(source: BootSecretSource, name: string): string | null {
  return source.databaseUrl.startsWith(FILE_URL_PREFIX) ? join(source.secretsDir, name) : null;
}

/** Where each boot secret comes from: the explicit env value, else its keyfile under the layout's secrets dir
 *  (`null` for a remote db). The boot disclaimer names it back to the operator. */
export function bootSecretProvenance(
  source: {
    readonly sessionSecret: string | undefined;
    readonly credentialsKey: string | undefined;
    readonly databaseUrl: string;
    readonly secretsDir: string;
  } = {
    sessionSecret: env.SESSION_SECRET,
    credentialsKey: env.CREDENTIALS_KEY,
    databaseUrl: env.DATABASE_URL,
    secretsDir: env.DATA_LAYOUT.secrets,
  },
): {
  readonly sessionSecret: { readonly explicit: boolean; readonly keyfile: string | null };
  readonly credentialsKey: { readonly explicit: boolean; readonly keyfile: string | null };
} {
  const location = { explicit: undefined, databaseUrl: source.databaseUrl, secretsDir: source.secretsDir };
  return {
    sessionSecret: { explicit: explicitSessionSecret(source.sessionSecret), keyfile: keyfilePath(location, SECRET_FILE_NAMES.sessionSecret) },
    credentialsKey: { explicit: explicitCredentialsKey(source.credentialsKey), keyfile: keyfilePath(location, SECRET_FILE_NAMES.credentialsKey) },
  };
}

// The keyfile half of a resolution, shared by both secrets: remote db → resolved null; an entry at the path
// (a file, a symlink, anything) → read it; nothing there → absent, and nothing is written.
function resolveKeyfile(source: BootSecretSource, name: string, remoteNotice: string): BootSecretResolution<Buffer> {
  const path = keyfilePath(source, name);
  if (path === null) {
    reportKeyfile(remoteNotice);
    return { kind: "resolved", value: null, path: null };
  }
  if (lstatSync(path, { throwIfNoEntry: false }) === undefined) {
    return { kind: "absent", path };
  }
  return { kind: "resolved", value: readExistingKeyfile(path), path };
}

/** The credentials SecretBox key: an explicit CREDENTIALS_KEY (hex or base64, exactly 32 bytes), else the
 *  `credentials_key` keyfile under the layout's secrets dir. Never throws: a bad or unusable key resolves
 *  to `null` (a DISABLED box); a keyfile that does not exist yet resolves to `absent`. */
export function resolveCredentialsKey(
  source: BootSecretSource = { explicit: env.CREDENTIALS_KEY, databaseUrl: env.DATABASE_URL, secretsDir: env.DATA_LAYOUT.secrets },
): BootSecretResolution<Buffer> {
  if (explicitCredentialsKey(source.explicit)) {
    return { kind: "resolved", value: decode32Bytes(source.explicit), path: null };
  }
  return resolveKeyfile(
    source,
    SECRET_FILE_NAMES.credentialsKey,
    `DATABASE_URL is not a local file: database, so no ${SECRET_FILE_NAMES.credentialsKey} keyfile can be generated; set CREDENTIALS_KEY to store provider keys.`,
  );
}

/** The SESSION_SECRET pepper: an explicit SESSION_SECRET, else the `session_secret` keyfile under the
 *  layout's secrets dir as 64 hex chars. `null` for a remote db or an unusable keyfile; `absent` for a keyfile
 *  that does not exist yet. The value is returned, never written to `process.env`. */
export function resolveSessionSecret(
  source: BootSecretSource = { explicit: env.SESSION_SECRET, databaseUrl: env.DATABASE_URL, secretsDir: env.DATA_LAYOUT.secrets },
): BootSecretResolution<string> {
  if (explicitSessionSecret(source.explicit)) {
    return { kind: "resolved", value: source.explicit, path: null };
  }
  const keyfile = resolveKeyfile(
    source,
    SECRET_FILE_NAMES.sessionSecret,
    `DATABASE_URL is not a local file: database, so no ${SECRET_FILE_NAMES.sessionSecret} keyfile can be generated.`,
  );
  if (keyfile.kind === "absent") {
    return keyfile;
  }
  return { kind: "resolved", value: sessionPepper(keyfile.value), path: keyfile.path };
}
