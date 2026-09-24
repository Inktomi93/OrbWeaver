// entry/lifecycle — secrets default on, end to end. A bare-metal `AUTH_MODE=local` box with no SESSION_SECRET
// and no CREDENTIALS_KEY boots, writes both keyfiles beside the db, and a password seeded on the first boot
// still verifies on the next: the pepper is read back, never regenerated.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-secret-"));
const SESSION_SECRET_FILE = join(TEMP_DIR, ".session-secret");
const CREDENTIALS_KEY_FILE = join(TEMP_DIR, ".credentials-key");
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const UNAUTHORIZED = 401;
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;
const LOGIN_BOOT_TIMEOUT_MS = 120_000;

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", OWNER_PASSWORD);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("USER_RUNTIME_DIR", join(TEMP_DIR, "users"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", join(TEMP_DIR, "models"));
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

async function ownerLoginStatus(port: number): Promise<number> {
  const res = await fetch(`http://localhost:${String(port)}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ handle: "owner", password: OWNER_PASSWORD }).toString(),
  });
  return res.status;
}

test(
  "an unset SESSION_SECRET is generated once beside the db and reused, so a password survives a restart",
  async () => {
    let firstSecret = "";
    await withBoot(async (port) => {
      firstSecret = readFileSync(SESSION_SECRET_FILE, "utf-8");
      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
      expect(statSync(SESSION_SECRET_FILE).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
      expect(statSync(CREDENTIALS_KEY_FILE).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
      expect(await ownerLoginStatus(port)).toBe(OK);
    });

    await withBoot(async (port) => {
      expect(readFileSync(SESSION_SECRET_FILE, "utf-8")).toBe(firstSecret);
      expect(await ownerLoginStatus(port)).toBe(OK);
    });

    // Control: a regenerated pepper cannot verify the stored password, so the login above proves reuse.
    rmSync(SESSION_SECRET_FILE);
    await withBoot(async (port) => {
      expect(existsSync(SESSION_SECRET_FILE)).toBe(true);
      expect(readFileSync(SESSION_SECRET_FILE, "utf-8")).not.toBe(firstSecret);
      expect(await ownerLoginStatus(port)).toBe(UNAUTHORIZED);
    });
  },
  LOGIN_BOOT_TIMEOUT_MS,
);
