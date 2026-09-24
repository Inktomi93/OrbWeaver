// entry/lifecycle — the owner_fallback_relayed line as production wires it. A single-user box behind a same-host
// tunnel sees every visitor as one loopback peer carrying a relay tell; the booted seam must log that once, not
// once per request. The unit suites inject their own notice, so only a booted lifecycle proves the wiring.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-relay-notice-"));
const OK = 200;
const BOOT_TIMEOUT_MS = 120_000;
const RELAYED_REQUESTS = 5;
const EVENT = "owner_fallback_relayed";

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("USER_RUNTIME_DIR", join(TEMP_DIR, "users"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", join(TEMP_DIR, "models"));
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
// The test reads the security line back from the log ring, which records only at or above LOG_LEVEL.
vi.stubEnv("LOG_LEVEL", "warn");
// The boot installs the egress firewall, which blocks loopback for this test's own fetches unless allowed.
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});
const { logRing } = await import("../../../packages/server/src/foundation/observability/index.ts");

const lifecycle = createLifecycle({ listenPort: 0 });
let base = "";

beforeAll(async () => {
  await lifecycle.boot();
  const address = lifecycle.listeningAddress();
  if (address === null) {
    throw new Error("boot completed without a bound listener");
  }
  base = `http://localhost:${String(address.port)}`;
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function authenticated(extra: Record<string, string> = {}): Promise<boolean> {
  const res = await fetch(`${base}/api/auth/me`, { headers: extra });
  expect(res.status).toBe(OK);
  return ((await res.json()) as { authenticated: boolean }).authenticated;
}

function relayedLines(): number {
  return logRing.recent().filter((line) => line.includes(`"event":"${EVENT}"`)).length;
}

test("many relayed loopback requests are all refused the owner and log one security line", async () => {
  const before = relayedLines();
  for (let i = 0; i < RELAYED_REQUESTS; i += 1) {
    expect(await authenticated({ "x-forwarded-for": `203.0.113.${String(i + 1)}` })).toBe(false);
  }
  expect(relayedLines() - before).toBe(1);
  // Control: the bare loopback request is still the owner, so the refusals above were the relay gate.
  expect(await authenticated()).toBe(true);
});
