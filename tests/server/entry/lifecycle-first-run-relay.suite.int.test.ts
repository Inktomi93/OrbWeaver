// entry/lifecycle — the local first-run gate as production wires it. A fresh `AUTH_MODE=local` box with no
// LOCAL_INITIAL_PASSWORD offers the owner-password claim only to a loopback request with no relay tell and an
// allowed `Host`. The route and flag unit tests inject their own gate, so only a booted lifecycle proves it.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { requestWithHost } from "../../support/host-request.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-first-run-"));
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const MISDIRECTED = 421;
const BOOT_TIMEOUT_MS = 120_000;
// A same-host tunnel connects over loopback and adds this header; the request is a stranger's.
const RELAYED = { "x-forwarded-for": "203.0.113.9" } as const;

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", undefined);
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

const lifecycle = createLifecycle({ listenPort: 0 });
let base = "";
// The same listener by IP literal, for the raw requests that carry their own `Host`.
let loopbackBase = "";
let port = "";

beforeAll(async () => {
  await lifecycle.boot();
  const address = lifecycle.listeningAddress();
  if (address === null) {
    throw new Error("boot completed without a bound listener");
  }
  port = String(address.port);
  base = `http://localhost:${port}`;
  loopbackBase = `http://127.0.0.1:${port}`;
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function localFirstRun(extra: Record<string, string> = {}): Promise<boolean> {
  const res = await fetch(`${base}/api/auth/config`, { headers: extra });
  expect(res.status).toBe(OK);
  const body = (await res.json()) as { localFirstRun: boolean };
  return body.localFirstRun;
}

async function formPost(path: string, fields: Record<string, string>, extra: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1", ...extra },
    body: new URLSearchParams(fields).toString(),
  });
  return res.status;
}

test("the localFirstRun flag is false for a relayed loopback request and true for a bare one", async () => {
  expect(await localFirstRun(RELAYED)).toBe(false);
  expect(await localFirstRun()).toBe(true);
});

test("a page on a name rebound to loopback is refused the first-run flag and the claim", async () => {
  const host = `rebind.attacker.example:${port}`;
  expect((await requestWithHost(loopbackBase, "/api/auth/config", { host })).status).toBe(MISDIRECTED);
  const claim = await requestWithHost(loopbackBase, "/api/auth/first-run", {
    host,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ password: OWNER_PASSWORD }).toString(),
  });
  expect(claim.status).toBe(MISDIRECTED);
  // Still unset: the refused claim wrote nothing, so the bare loopback claim below still succeeds.
  expect(await localFirstRun()).toBe(true);
});

test("a relayed loopback first-run claim is refused and leaves the owner password unset; a bare one claims it", async () => {
  expect(await formPost("/api/auth/first-run", { password: OWNER_PASSWORD }, RELAYED)).toBe(FORBIDDEN);
  // Still unset: the flag still offers setup, and the refused password does not sign in.
  expect(await localFirstRun()).toBe(true);
  expect(await formPost("/api/auth/login", { handle: "owner", password: OWNER_PASSWORD })).toBe(UNAUTHORIZED);

  // Control: the same claim with no relay tell succeeds, so the refusal above was the relay gate.
  expect(await formPost("/api/auth/first-run", { password: OWNER_PASSWORD })).toBe(OK);
  expect(await localFirstRun()).toBe(false);
  expect(await formPost("/api/auth/login", { handle: "owner", password: OWNER_PASSWORD })).toBe(OK);
});
