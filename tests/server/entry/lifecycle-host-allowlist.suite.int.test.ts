// entry/lifecycle — the Host allowlist as production wires it, on the shipped single-user default. A page on a
// name its owner rebinds to 127.0.0.1 is same-origin with this server: its requests arrive on a loopback
// socket with no forwarding header, so the owner fallback admits them. The only tell is the foreign `Host`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { requestWithHost } from "../../support/host-request.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-host-allowlist-"));
const OK = 200;
const MISDIRECTED = 421;
const BOOT_TIMEOUT_MS = 120_000;
const REBOUND_REQUESTS = 5;
const EVENT = "host_not_allowed";
const REBOUND_NAME = "rebind.attacker.example";

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("ALLOWED_HOSTS", undefined);
vi.stubEnv("OIDC_REDIRECT_URIS", undefined);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("USER_RUNTIME_DIR", join(TEMP_DIR, "users"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", join(TEMP_DIR, "models"));
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
// The test reads the security line back from the log ring, which records only at or above LOG_LEVEL.
vi.stubEnv("LOG_LEVEL", "warn");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});
const { logRing } = await import("../../../packages/server/src/foundation/observability/index.ts");

const lifecycle = createLifecycle({ listenPort: 0 });
let base = "";
let port = "";

beforeAll(async () => {
  await lifecycle.boot();
  const address = lifecycle.listeningAddress();
  if (address === null) {
    throw new Error("boot completed without a bound listener");
  }
  port = String(address.port);
  base = `http://127.0.0.1:${port}`;
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

/** `/api/auth/me` from the loopback socket, as the browser on `host` would send it. */
function me(host: string, headers: Record<string, string> = {}): ReturnType<typeof requestWithHost> {
  return requestWithHost(base, "/api/auth/me", { host, headers });
}

function refusalLines(host: string): number {
  return logRing.recent().filter((line) => line.includes(`"event":"${EVENT}"`) && line.includes(host)).length;
}

test("a rebound name reaching the loopback socket is refused before the owner resolves", async () => {
  const res = await me(`${REBOUND_NAME}:${port}`);
  expect(res.status).toBe(MISDIRECTED);
  expect(res.body).not.toContain('"authenticated":true');
  // The refusal names the exact line an operator adds when the name is really theirs.
  expect(res.body).toContain(`ALLOWED_HOSTS=${REBOUND_NAME}`);
  expect(res.contentType).toContain("application/json");
});

test("a page on the rebound name cannot pass by forging X-Forwarded-Host from the loopback socket", async () => {
  const res = await me(`${REBOUND_NAME}:${port}`, { "x-forwarded-host": `localhost:${port}` });
  expect(res.status).toBe(MISDIRECTED);
  expect(res.body).not.toContain('"authenticated":true');
});

test("localhost, *.localhost and IP literals reach the owner on the same socket", async () => {
  for (const host of [`localhost:${port}`, `app.localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
    const res = await me(host);
    expect(res.status, host).toBe(OK);
    expect(res.body, host).toContain('"authenticated":true');
  }
});

test("the non-API refusal is a page naming the host and the key", async () => {
  const res = await requestWithHost(base, "/", { host: REBOUND_NAME });
  expect(res.status).toBe(MISDIRECTED);
  expect(res.contentType).toContain("text/html");
  expect(res.body).toContain(`ALLOWED_HOSTS=${REBOUND_NAME}`);
});

test("repeated requests for one refused name log one security line", async () => {
  const host = "repeat.attacker.example";
  for (let i = 0; i < REBOUND_REQUESTS; i += 1) {
    expect((await me(`${host}:${port}`)).status).toBe(MISDIRECTED);
  }
  expect(refusalLines(host)).toBe(1);
});
