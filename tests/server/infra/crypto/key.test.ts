import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { bootSecretProvenance, decode32Bytes, loadOrCreateKeyfile, resolveCredentialsKey, resolveSessionSecret } from "@orb/server/infra/crypto";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const tmpDirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "orb-key-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("decode32Bytes", () => {
  test("accepts a 64-char hex key and round-trips the bytes", () => {
    const raw = randomBytes(32);
    expect(decode32Bytes(raw.toString("hex"))?.equals(raw)).toBe(true);
  });

  test("accepts a base64 key and round-trips the bytes", () => {
    const raw = randomBytes(32);
    expect(decode32Bytes(raw.toString("base64"))?.equals(raw)).toBe(true);
  });

  test("rejects a too-short / non-key string", () => {
    expect(decode32Bytes("not-a-real-key")).toBeNull();
  });

  test("rejects a hex string of the wrong length", () => {
    expect(decode32Bytes("abcd")).toBeNull();
  });
});

describe("loadOrCreateKeyfile", () => {
  test("generates a 32-byte key on first call and re-reads the SAME key after", () => {
    const keyPath = join(freshDir(), SECRET_FILE_NAMES.credentialsKey);
    const first = loadOrCreateKeyfile(keyPath);
    if (first === null) {
      throw new Error("expected a generated key");
    }
    expect(first.length).toBe(32);
    expect(existsSync(keyPath)).toBe(true);
    const second = loadOrCreateKeyfile(keyPath);
    expect(second?.equals(first)).toBe(true);
  });

  test("writes the keyfile with owner-only (0600) permissions, creating the secrets dir", () => {
    const keyPath = join(freshDir(), "secrets", SECRET_FILE_NAMES.credentialsKey);
    loadOrCreateKeyfile(keyPath);
    // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  test("fails closed (null) on a corrupt existing keyfile — never overwrites", () => {
    const keyPath = join(freshDir(), SECRET_FILE_NAMES.credentialsKey);
    writeFileSync(keyPath, "garbage-not-a-key\n");
    expect(loadOrCreateKeyfile(keyPath)).toBeNull();
    // The corrupt file is left untouched for the operator to investigate.
    expect(readFileSync(keyPath, "utf-8")).toBe("garbage-not-a-key\n");
  });

  test("two creators racing on an empty dir both return the ONE key that won the path", () => {
    const dir = freshDir();
    const keyPath = join(dir, SECRET_FILE_NAMES.credentialsKey);
    const secondCreator: (Buffer | null)[] = [];
    // The second boot runs start to finish inside the first one's window between the absence check and the
    // publish, which is the interleaving two processes starting together can produce.
    const first = loadOrCreateKeyfile(keyPath, () => {
      secondCreator.push(loadOrCreateKeyfile(keyPath));
      return randomBytes(32);
    });
    const second = secondCreator[0] ?? null;
    if (first === null || second === null) {
      throw new Error("expected both creators to return a key");
    }
    expect(first.equals(second)).toBe(true);
    expect(decode32Bytes(readFileSync(keyPath, "utf-8"))?.equals(first)).toBe(true);
    // The loser's temp file is gone; only the keyfile remains.
    expect(readdirSync(dir)).toEqual([SECRET_FILE_NAMES.credentialsKey]);
  });

  test("a dangling symlink planted at the key path is never written through", () => {
    const dir = freshDir();
    const keyPath = join(dir, SECRET_FILE_NAMES.credentialsKey);
    const target = join(dir, "planted-target");
    symlinkSync(target, keyPath);
    expect(loadOrCreateKeyfile(keyPath)).toBeNull();
    expect(existsSync(target)).toBe(false);
    expect(lstatSync(keyPath).isSymbolicLink()).toBe(true);
    expect(readdirSync(dir)).toEqual([SECRET_FILE_NAMES.credentialsKey]);
  });

  test("control: a symlink to an existing key is read through, so a secrets mount keeps working", () => {
    const dir = freshDir();
    const keyPath = join(dir, SECRET_FILE_NAMES.credentialsKey);
    const target = join(dir, "mounted-key");
    const key = randomBytes(32);
    writeFileSync(target, `${key.toString("hex")}\n`, { mode: 0o600 });
    symlinkSync(target, keyPath);
    expect(loadOrCreateKeyfile(keyPath)?.equals(key)).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe(`${key.toString("hex")}\n`);
  });
});

// The pre-db half of the boot secrets: the explicit value wins, an existing keyfile is read (and never
// replaced when unusable), a remote db has no keyfile, and a keyfile that does not exist yet is reported as
// absent WITHOUT being written — generating is `entry/boot`'s decision once the db says nothing depends on it.
describe("the boot secret resolvers", () => {
  const ExplicitSecret = "an-explicit-session-secret-of-40-chars!!";
  const localDb = "file:/somewhere/db/orbweaver.db";
  const source = (dir: string, explicit?: string): { explicit: string | undefined; databaseUrl: string; secretsDir: string } => ({
    explicit,
    databaseUrl: localDb,
    secretsDir: join(dir, "secrets"),
  });

  test("an absent session keyfile resolves to `absent` with its path, and nothing is written", () => {
    const dir = freshDir();
    const resolution = resolveSessionSecret(source(dir));
    expect(resolution).toEqual({ kind: "absent", path: join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret) });
    expect(existsSync(join(dir, "secrets"))).toBe(false);
  });

  test("an absent credentials keyfile resolves to `absent` with its path, and nothing is written", () => {
    const dir = freshDir();
    const resolution = resolveCredentialsKey(source(dir));
    expect(resolution).toEqual({ kind: "absent", path: join(dir, "secrets", SECRET_FILE_NAMES.credentialsKey) });
    expect(existsSync(join(dir, "secrets"))).toBe(false);
  });

  test("an existing session keyfile is read back as 64 hex chars", () => {
    const dir = freshDir();
    const keyPath = join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret);
    const key = loadOrCreateKeyfile(keyPath);
    const resolution = resolveSessionSecret(source(dir));
    expect(resolution).toEqual({ kind: "resolved", value: key?.toString("hex"), path: keyPath });
  });

  test("an existing credentials keyfile is read back as the same bytes", () => {
    const dir = freshDir();
    const keyPath = join(dir, "secrets", SECRET_FILE_NAMES.credentialsKey);
    const key = loadOrCreateKeyfile(keyPath);
    const resolution = resolveCredentialsKey(source(dir));
    expect(resolution.kind).toBe("resolved");
    expect(resolution.kind === "resolved" && resolution.value?.equals(key ?? Buffer.alloc(0))).toBe(true);
    expect(resolution.path).toBe(keyPath);
  });

  test("an explicit SESSION_SECRET wins, reads no file and writes none", () => {
    const dir = freshDir();
    expect(resolveSessionSecret(source(dir, ExplicitSecret))).toEqual({ kind: "resolved", value: ExplicitSecret, path: null });
    expect(existsSync(join(dir, "secrets"))).toBe(false);
  });

  test("an explicit CREDENTIALS_KEY wins, reads no file and writes none", () => {
    const dir = freshDir();
    const explicit = randomBytes(32);
    const resolution = resolveCredentialsKey(source(dir, explicit.toString("hex")));
    expect(resolution.kind === "resolved" && resolution.value?.equals(explicit)).toBe(true);
    expect(resolution.path).toBeNull();
    expect(existsSync(join(dir, "secrets"))).toBe(false);
  });

  test("an explicit SESSION_SECRET ignores an existing keyfile", () => {
    const dir = freshDir();
    loadOrCreateKeyfile(join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret));
    expect(resolveSessionSecret(source(dir, ExplicitSecret))).toEqual({ kind: "resolved", value: ExplicitSecret, path: null });
  });

  test("a corrupt session keyfile resolves to null and is never overwritten", () => {
    const dir = freshDir();
    mkdirSync(join(dir, "secrets"));
    const keyPath = join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret);
    writeFileSync(keyPath, "not-a-secret\n");
    expect(resolveSessionSecret(source(dir))).toEqual({ kind: "resolved", value: null, path: keyPath });
    expect(readFileSync(keyPath, "utf-8")).toBe("not-a-secret\n");
  });

  test("a corrupt credentials keyfile resolves to null and is never overwritten", () => {
    const dir = freshDir();
    mkdirSync(join(dir, "secrets"));
    const keyPath = join(dir, "secrets", SECRET_FILE_NAMES.credentialsKey);
    writeFileSync(keyPath, "garbage\n");
    expect(resolveCredentialsKey(source(dir))).toEqual({ kind: "resolved", value: null, path: keyPath });
    expect(readFileSync(keyPath, "utf-8")).toBe("garbage\n");
  });

  // Root reads a 0000 file anyway, so the unreadable case only means something for an unprivileged run.
  test.skipIf(process.getuid?.() === 0)("an unreadable session keyfile resolves to null and is never replaced", () => {
    const dir = freshDir();
    mkdirSync(join(dir, "secrets"));
    const keyPath = join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret);
    const original = `${randomBytes(32).toString("hex")}\n`;
    writeFileSync(keyPath, original, { mode: 0o600 });
    chmodSync(keyPath, 0o000);
    try {
      expect(resolveSessionSecret(source(dir))).toEqual({ kind: "resolved", value: null, path: keyPath });
    } finally {
      chmodSync(keyPath, 0o600);
    }
    expect(readFileSync(keyPath, "utf-8")).toBe(original);
  });

  test("a remote DATABASE_URL has no keyfile: resolved null, no path, nothing written", () => {
    const dir = freshDir();
    const remote = { explicit: undefined, databaseUrl: "libsql://example.turso.io", secretsDir: join(dir, "secrets") };
    expect(resolveSessionSecret(remote)).toEqual({ kind: "resolved", value: null, path: null });
    expect(resolveCredentialsKey(remote)).toEqual({ kind: "resolved", value: null, path: null });
    expect(existsSync(join(dir, "secrets"))).toBe(false);
  });

  test("the two secrets are independent files: one never reads the other", () => {
    const dir = freshDir();
    const secret = loadOrCreateKeyfile(join(dir, "secrets", SECRET_FILE_NAMES.sessionSecret));
    const key = loadOrCreateKeyfile(join(dir, "secrets", SECRET_FILE_NAMES.credentialsKey));
    expect(key?.equals(secret ?? Buffer.alloc(0))).toBe(false);
    const session = resolveSessionSecret(source(dir));
    const credentials = resolveCredentialsKey(source(dir));
    expect(session.kind === "resolved" ? session.value : null).toBe(secret?.toString("hex"));
    expect(credentials.kind === "resolved" && credentials.value?.equals(key ?? Buffer.alloc(0))).toBe(true);
  });
});

// The boot disclaimer names each secret's source; it must be the source the resolver actually used, and the
// keyfile it names is the one under the layout's secrets dir.
describe("bootSecretProvenance", () => {
  test("an empty CREDENTIALS_KEY is not explicit (the resolver falls back to the keyfile), an empty SESSION_SECRET is", () => {
    const provenance = bootSecretProvenance({
      sessionSecret: "",
      credentialsKey: "",
      databaseUrl: "file:/srv/orb/db/orbweaver.db",
      secretsDir: "/srv/orb/secrets",
    });
    expect(provenance.credentialsKey).toEqual({ explicit: false, keyfile: `/srv/orb/secrets/${SECRET_FILE_NAMES.credentialsKey}` });
    expect(provenance.sessionSecret).toEqual({ explicit: true, keyfile: `/srv/orb/secrets/${SECRET_FILE_NAMES.sessionSecret}` });
  });

  test("a remote database has no keyfile", () => {
    const provenance = bootSecretProvenance({
      sessionSecret: undefined,
      credentialsKey: undefined,
      databaseUrl: "libsql://db.example.turso.io",
      secretsDir: "/srv/orb/secrets",
    });
    expect(provenance).toEqual({ sessionSecret: { explicit: false, keyfile: null }, credentialsKey: { explicit: false, keyfile: null } });
  });
});
