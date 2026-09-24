import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  bootSecretProvenance,
  credentialsKeyFromEnv,
  dataDirFromDbUrl,
  decode32Bytes,
  loadOrCreateKeyfile,
  sessionSecretFromEnv,
} from "@orb/server/infra/crypto";
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

describe("dataDirFromDbUrl", () => {
  test("returns the parent dir of a file: URL", () => {
    const dir = dataDirFromDbUrl("file:./data/orbweaver.db");
    expect(dir).not.toBeNull();
    expect(dir?.endsWith("/data")).toBe(true);
  });

  test("returns null for a remote (non-file) URL — no local data dir to write a keyfile", () => {
    expect(dataDirFromDbUrl("libsql://example.turso.io")).toBeNull();
  });
});

describe("loadOrCreateKeyfile", () => {
  test("generates a 32-byte key on first call and re-reads the SAME key after", () => {
    const keyPath = join(freshDir(), ".credentials-key");
    const first = loadOrCreateKeyfile(keyPath);
    if (first === null) {
      throw new Error("expected a generated key");
    }
    expect(first.length).toBe(32);
    expect(existsSync(keyPath)).toBe(true);
    const second = loadOrCreateKeyfile(keyPath);
    expect(second?.equals(first)).toBe(true);
  });

  test("writes the keyfile with owner-only (0600) permissions", () => {
    const keyPath = join(freshDir(), ".credentials-key");
    loadOrCreateKeyfile(keyPath);
    // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  test("fails closed (null) on a corrupt existing keyfile — never overwrites", () => {
    const keyPath = join(freshDir(), ".credentials-key");
    writeFileSync(keyPath, "garbage-not-a-key\n");
    expect(loadOrCreateKeyfile(keyPath)).toBeNull();
    // The corrupt file is left untouched for the operator to investigate.
    expect(readFileSync(keyPath, "utf-8")).toBe("garbage-not-a-key\n");
  });

  test("two creators racing on an empty dir both return the ONE key that won the path", () => {
    const dir = freshDir();
    const keyPath = join(dir, ".credentials-key");
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
    expect(readdirSync(dir)).toEqual([".credentials-key"]);
  });

  test("a dangling symlink planted at the key path is never written through", () => {
    const dir = freshDir();
    const keyPath = join(dir, ".credentials-key");
    const target = join(dir, "planted-target");
    symlinkSync(target, keyPath);
    expect(loadOrCreateKeyfile(keyPath)).toBeNull();
    expect(existsSync(target)).toBe(false);
    expect(lstatSync(keyPath).isSymbolicLink()).toBe(true);
    expect(readdirSync(dir)).toEqual([".credentials-key"]);
  });

  test("control: a symlink to an existing key is read through, so a secrets mount keeps working", () => {
    const dir = freshDir();
    const keyPath = join(dir, ".credentials-key");
    const target = join(dir, "mounted-key");
    const key = randomBytes(32);
    writeFileSync(target, `${key.toString("hex")}\n`, { mode: 0o600 });
    symlinkSync(target, keyPath);
    expect(loadOrCreateKeyfile(keyPath)?.equals(key)).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe(`${key.toString("hex")}\n`);
  });
});

// Secrets default on: an unset CREDENTIALS_KEY or SESSION_SECRET is generated once beside the db and reused.
// A new value on a later boot would orphan every stored credential or every local password and session, so
// a keyfile that exists but cannot be used is never replaced.
describe("the generated secrets beside the db", () => {
  const Hex64 = /^[0-9a-f]{64}$/u;
  const ExplicitSecret = "an-explicit-session-secret-of-40-chars!!";
  const dbUrlIn = (dir: string): string => `file:${join(dir, "orbweaver.db")}`;

  test("an unset SESSION_SECRET creates `.session-secret` (0600) beside the db and reuses it", () => {
    const dir = freshDir();
    const first = sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) });
    expect(first).toMatch(Hex64);
    const keyPath = join(dir, ".session-secret");
    // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) })).toBe(first);
  });

  test("an explicit SESSION_SECRET wins and writes no file", () => {
    const dir = freshDir();
    expect(sessionSecretFromEnv({ explicit: ExplicitSecret, databaseUrl: dbUrlIn(dir) })).toBe(ExplicitSecret);
    expect(existsSync(join(dir, ".session-secret"))).toBe(false);
  });

  test("an explicit SESSION_SECRET ignores an existing keyfile", () => {
    const dir = freshDir();
    const generated = sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) });
    expect(sessionSecretFromEnv({ explicit: ExplicitSecret, databaseUrl: dbUrlIn(dir) })).toBe(ExplicitSecret);
    expect(generated).not.toBe(ExplicitSecret);
  });

  test("a corrupt `.session-secret` yields null and is never overwritten", () => {
    const dir = freshDir();
    const keyPath = join(dir, ".session-secret");
    writeFileSync(keyPath, "not-a-secret\n");
    expect(sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) })).toBeNull();
    expect(readFileSync(keyPath, "utf-8")).toBe("not-a-secret\n");
  });

  // Root reads a 0000 file anyway, so the unreadable case only means something for an unprivileged run.
  test.skipIf(process.getuid?.() === 0)("an unreadable `.session-secret` yields null and is never replaced", () => {
    const dir = freshDir();
    const keyPath = join(dir, ".session-secret");
    const original = `${randomBytes(32).toString("hex")}\n`;
    writeFileSync(keyPath, original, { mode: 0o600 });
    chmodSync(keyPath, 0o000);
    try {
      expect(sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) })).toBeNull();
    } finally {
      chmodSync(keyPath, 0o600);
    }
    expect(readFileSync(keyPath, "utf-8")).toBe(original);
  });

  test("a remote DATABASE_URL has no data dir: no secret, no file", () => {
    expect(sessionSecretFromEnv({ explicit: undefined, databaseUrl: "libsql://example.turso.io" })).toBeNull();
    expect(credentialsKeyFromEnv({ explicit: undefined, databaseUrl: "libsql://example.turso.io" })).toBeNull();
  });

  test("an unset CREDENTIALS_KEY creates `.credentials-key` beside the db with no opt-in knob, and reuses it", () => {
    const dir = freshDir();
    const first = credentialsKeyFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) });
    expect(first?.length).toBe(32);
    expect(existsSync(join(dir, ".credentials-key"))).toBe(true);
    expect(credentialsKeyFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) })?.equals(first ?? Buffer.alloc(0))).toBe(true);
  });

  test("an explicit CREDENTIALS_KEY wins and writes no file", () => {
    const dir = freshDir();
    const explicit = randomBytes(32);
    expect(credentialsKeyFromEnv({ explicit: explicit.toString("hex"), databaseUrl: dbUrlIn(dir) })?.equals(explicit)).toBe(true);
    expect(existsSync(join(dir, ".credentials-key"))).toBe(false);
  });

  test("the two secrets are independent files: one never reads the other", () => {
    const dir = freshDir();
    const secret = sessionSecretFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) });
    const key = credentialsKeyFromEnv({ explicit: undefined, databaseUrl: dbUrlIn(dir) });
    expect(key?.toString("hex")).not.toBe(secret);
  });
});

// The boot disclaimer names each secret's source; it must be the source the loader actually used.
describe("bootSecretProvenance", () => {
  test("an empty CREDENTIALS_KEY is not explicit (the loader falls back to the keyfile), an empty SESSION_SECRET is", () => {
    const provenance = bootSecretProvenance({ sessionSecret: "", credentialsKey: "", databaseUrl: "file:/srv/orb/orb.db" });
    expect(provenance.credentialsKey).toEqual({ explicit: false, keyfile: "/srv/orb/.credentials-key" });
    expect(provenance.sessionSecret).toEqual({ explicit: true, keyfile: "/srv/orb/.session-secret" });
  });

  test("a remote database has no keyfile", () => {
    const provenance = bootSecretProvenance({ sessionSecret: undefined, credentialsKey: undefined, databaseUrl: "libsql://db.example.turso.io" });
    expect(provenance).toEqual({ sessionSecret: { explicit: false, keyfile: null }, credentialsKey: { explicit: false, keyfile: null } });
  });
});
