// entry/lifecycle — a container shares exactly as bare metal does: Start sharing fetches the pinned relay once, checks
// it and keeps it in the data dir's cache, where a later start finds it and downloads nothing.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { fakeRelaySeams } from "../../support/fake-relay.ts";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-share-container-"));
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const BOOT_TIMEOUT_MS = 120_000;

vi.stubEnv("ORB_CONTAINER", "true");
vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SHARE_RELAY", undefined);
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", undefined);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
// The boot installs the egress firewall, which blocks loopback for this test's own fetches unless allowed.
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});
const { DATA_LAYOUT_DIRS } = await import("../../../packages/server/src/foundation/data-layout/index.ts");

const relay = fakeRelaySeams();
const lifecycle = createLifecycle({ listenPort: 0, relaySeams: relay });
const cachedRelay = join(TEMP_DIR, DATA_LAYOUT_DIRS.relay, `${relay.pin.version}-${relay.file}`);
const assetUrl = `${relay.pin.releaseBase}/${relay.pin.version}/${relay.file}`;
let base = "";
let ownerCookie = "";

beforeAll(async () => {
  await lifecycle.boot();
  const address = lifecycle.listeningAddress();
  if (address === null) {
    throw new Error("boot completed without a bound listener");
  }
  base = `http://localhost:${String(address.port)}`;
  const claim = await fetch(`${base}/api/auth/first-run`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ password: OWNER_PASSWORD }).toString(),
  });
  expect(claim.status).toBe(OK);
  ownerCookie = claim.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function shareMutation(verb: "start" | "stop"): Promise<Response> {
  return await fetch(`${base}/api/trpc/share.${verb}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-orb-csrf": "1", cookie: ownerCookie },
    body: "{}",
  });
}

test("Start sharing in a container downloads the pinned relay into the data dir's cache and runs it from there", async () => {
  const started = await shareMutation("start");
  expect(started.status).toBe(OK);
  expect(relay.fetched).toEqual([assetUrl]);
  expect(relay.latest().executable).toBe(cachedRelay);
  expect(readFileSync(cachedRelay)).toEqual(Buffer.from(relay.bytes));
});

test("a later start runs the cached relay and downloads nothing", async () => {
  expect((await shareMutation("stop")).status).toBe(OK);
  expect((await shareMutation("start")).status).toBe(OK);
  expect(relay.fetched).toEqual([assetUrl]);
  expect(relay.relays).toHaveLength(2);
  expect(relay.latest().executable).toBe(cachedRelay);
});
