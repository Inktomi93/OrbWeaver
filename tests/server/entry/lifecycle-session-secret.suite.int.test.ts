// entry/lifecycle — the boot secrets, end to end. A bare-metal `AUTH_MODE=local` box with no SESSION_SECRET
// and no CREDENTIALS_KEY boots, writes both keyfiles under the data root's `secrets/`, seals a provider
// credential and a password with them, and a restart reads them back. Once rows depend on a secret, a boot
// that finds its keyfile missing REFUSES and names the file instead of regenerating over the data.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-secret-"));
const SESSION_SECRET_FILE = join(TEMP_DIR, "secrets", SECRET_FILE_NAMES.sessionSecret);
const CREDENTIALS_KEY_FILE = join(TEMP_DIR, "secrets", SECRET_FILE_NAMES.credentialsKey);
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;
const LOGIN_BOOT_TIMEOUT_MS = 180_000;

vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", OWNER_PASSWORD);
// The boot seeds this into the owner's sealed credentials, so a credential row depends on the key.
vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-not-a-real-key-for-the-secrets-suite");
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
// The boot installs the egress firewall, which blocks loopback for this test's own fetches unless allowed.
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

afterAll(() => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
});

/** Boot a fresh lifecycle over the same data dir, run `body` against its port, then shut it down. */
async function withBoot(body: (port: number) => Promise<void>): Promise<void> {
  const lifecycle = createLifecycle({ listenPort: 0 });
  try {
    await lifecycle.boot();
    const address = lifecycle.listeningAddress();
    if (address === null) {
      throw new Error("boot completed without a bound listener");
    }
    await body(address.port);
  } finally {
    await lifecycle.shutdown();
  }
}

/** Boot over the same data dir and expect the refusal `named` before any listener binds. */
async function bootRefuses(named: string): Promise<void> {
  const lifecycle = createLifecycle({ listenPort: 0 });
  try {
    await expect(lifecycle.boot()).rejects.toThrow(named);
    expect(lifecycle.listeningAddress()).toBeNull();
  } finally {
    await lifecycle.shutdown();
  }
}

async function ownerLoginStatus(port: number): Promise<number> {
  const res = await fetch(`http://localhost:${String(port)}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ handle: "owner", password: OWNER_PASSWORD }).toString(),
  });
  return res.status;
}

test(
  "unset secrets are generated once under secrets/ and reused; once rows depend on one, a missing keyfile refuses the boot by name",
  async () => {
    let firstSecret = "";
    let firstKey = "";
    await withBoot(async (port) => {
      firstSecret = readFileSync(SESSION_SECRET_FILE, "utf-8");
      firstKey = readFileSync(CREDENTIALS_KEY_FILE, "utf-8");
      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
      expect(statSync(SESSION_SECRET_FILE).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
      expect(statSync(CREDENTIALS_KEY_FILE).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
      expect(await ownerLoginStatus(port)).toBe(OK);
    });

    await withBoot(async (port) => {
      expect(readFileSync(SESSION_SECRET_FILE, "utf-8")).toBe(firstSecret);
      expect(readFileSync(CREDENTIALS_KEY_FILE, "utf-8")).toBe(firstKey);
      expect(await ownerLoginStatus(port)).toBe(OK);
    });

    // The owner has a password hash, so a boot without the pepper's keyfile refuses instead of minting a new
    // pepper that could never verify it. The refusal names the file and writes nothing.
    rmSync(SESSION_SECRET_FILE);
    await bootRefuses(SESSION_SECRET_FILE);
    expect(existsSync(SESSION_SECRET_FILE)).toBe(false);

    // Same for the credentials key: the seeded provider credential is sealed with it.
    writeFileSync(SESSION_SECRET_FILE, firstSecret, { mode: OWNER_ONLY });
    rmSync(CREDENTIALS_KEY_FILE);
    await bootRefuses(CREDENTIALS_KEY_FILE);
    expect(existsSync(CREDENTIALS_KEY_FILE)).toBe(false);
  },
  LOGIN_BOOT_TIMEOUT_MS,
);
