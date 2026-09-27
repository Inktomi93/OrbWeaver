// entry/lifecycle — the owner fallback on a single-user box pinned to one LAN interface. The loopback listener that
// bind adds (D269) serves the operator at this machine as before, and widens nothing: a relayed request on it is
// refused the owner, and a peer outside the declared AUTH_FALLBACK_TRUSTED_PEERS (this machine's own LAN address
// included) gets no fallback.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { requestWithHost } from "../../support/host-request.ts";
import { lanAddress } from "../../support/node/lan-address.ts";

const LAN = lanAddress();
const LOOPBACK = "127.0.0.1";
const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-lan-bind-owner-fallback-"));
const OK = 200;
const BOOT_TIMEOUT_MS = 120_000;
const VISITOR = "203.0.113.9";
// A declared peer set is single-user's only door to a non-loopback bind; this one excludes every address on this host.
const DECLARED_PEERS = "198.51.100.0/24";

vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("BIND_HOST", LAN);
vi.stubEnv("ALLOW_DEV_PUBLIC_BIND", "true");
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("AUTH_FALLBACK_TRUSTED_PEERS", DECLARED_PEERS);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

const lifecycle = createLifecycle({ listenPort: 0 });
let port = 0;

beforeAll(async () => {
  await lifecycle.boot();
  const address = lifecycle.listeningAddress();
  if (address === null) {
    throw new Error("boot completed without a bound listener");
  }
  port = address.port;
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function isOwner(host: string, headers: Record<string, string> = {}): Promise<boolean> {
  const res = await requestWithHost(`http://${host}:${String(port)}`, "/api/auth/me", { host, headers });
  expect(res.status).toBe(OK);
  return (JSON.parse(res.body) as { authenticated: boolean }).authenticated;
}

test("the operator at this machine is the owner over the loopback listener", async () => {
  expect(lifecycle.listeningAddress()?.address).toBe(LAN);
  expect(await isOwner(LOOPBACK)).toBe(true);
});

test("a relayed request on the loopback listener is refused the owner fallback", async () => {
  expect(await isOwner(LOOPBACK, { "x-forwarded-for": VISITOR })).toBe(false);
  expect(await isOwner(LOOPBACK, { "cf-connecting-ip": VISITOR })).toBe(false);
  expect(await isOwner(LOOPBACK, { forwarded: `for=${VISITOR}` })).toBe(false);
});

test("a peer outside the declared set gets no fallback, this machine's own LAN address included", async () => {
  expect(await isOwner(LAN)).toBe(false);
});
