import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDirFromDbUrl, decode32Bytes, loadOrCreateKeyfile } from "@orb/server/infra/crypto";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

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

// biome-ignore lint/security/noSecrets: this is the name of the function under test, not a credential.
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
});
