// entry/lifecycle — a box whose BIND_HOST names one LAN interface also listens on loopback at the same port (D269), so
// the share relay and the IP certificate's https listener reach it as a loopback peer, and a person at this machine
// can claim the owner over loopback. The loopback listener widens nothing: a relayed request arriving on it is still
// refused every loopback-gated grant, and this machine's own LAN address is never loopback. Shutdown closes both.

import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Handle } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { afterAll, beforeAll, vi } from "vitest";
import { z } from "zod";
import { fakeRelaySeams } from "../../support/fake-relay.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { HostResponse } from "../../support/host-request.ts";
import { requestWithHost } from "../../support/host-request.ts";
import { lanAddress } from "../../support/node/lan-address.ts";
import { selfSignedIpPair, tlsRequest } from "../../support/node/tls-hop.ts";

const LAN = lanAddress();
const LOOPBACK = "127.0.0.1";
const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-lan-bind-"));
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const BOOT_TIMEOUT_MS = 120_000;
const RELAY_HOST = "calm-river-four-birds.trycloudflare.com";
const VISITOR = "203.0.113.9";
const FORM = { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" };
const SECURE_SESSION_COOKIE = "__Host-orb_session=";
// The signed-in half of `GET /api/auth/me`, parsed so the handle arrives branded.
const AUTH_ME = z.object({ handle: brandedId<Handle>() });

vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("BIND_HOST", LAN);
// A non-production build refuses a non-loopback bind without the deliberate-LAN opt-in (foundation/env/bind.ts).
vi.stubEnv("ALLOW_DEV_PUBLIC_BIND", "true");
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SHARE_RELAY", undefined);
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", undefined);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});
const { loopbackOrigin } = await import("../../../packages/server/src/foundation/env/index.ts");
const { startTlsTerminator } = await import("../../../packages/server/src/infra/network/index.ts");

const relaySeams = fakeRelaySeams();
const lifecycle = createLifecycle({ listenPort: 0, relaySeams });
let port = 0;
let ownerCookie = "";

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

// A body goes with its length, as a browser sends it: the app's body limit answers a chunked POST with a 500.
function send(
  host: string,
  path: string,
  init: { readonly method?: string; readonly headers?: Record<string, string>; readonly body?: string } = {},
): Promise<HostResponse> {
  const length = init.body === undefined ? {} : { "content-length": String(Buffer.byteLength(init.body)) };
  return requestWithHost(`http://${host}:${String(port)}`, path, { host, ...init, headers: { ...length, ...init.headers } });
}

async function refuses(host: string): Promise<boolean> {
  const socket = connect(port, host);
  try {
    await once(socket, "connect");
    return false;
  } catch {
    return true;
  } finally {
    socket.destroy();
  }
}

async function firstRunOffered(host: string, headers: Record<string, string> = {}): Promise<boolean> {
  const res = await send(host, "/api/auth/config", { headers });
  expect(res.status).toBe(OK);
  return (JSON.parse(res.body) as { localFirstRun: boolean }).localFirstRun;
}

/** A form POST over plain http, answered with its status and the cookies it set. */
function postForm(
  host: string,
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ readonly status: number; readonly cookie: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: host, port, path, method: "POST", headers: { ...FORM, ...headers, host, "content-length": String(Buffer.byteLength(body)) } },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, cookie: cookieHeader(res.headers) });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const CLAIM_BODY = new URLSearchParams({ password: OWNER_PASSWORD }).toString();

function claim(host: string, headers: Record<string, string> = {}): Promise<{ readonly status: number; readonly cookie: string }> {
  return postForm(host, "/api/auth/first-run", CLAIM_BODY, headers);
}

function versionShown(res: HostResponse): boolean {
  return "version" in (JSON.parse(res.body) as Record<string, unknown>);
}

function cookieHeader(headers: IncomingHttpHeaders): string {
  return (headers["set-cookie"] ?? []).map((cookie) => cookie.split(";")[0] ?? "").join("; ");
}

// The IP certificate's https listener exactly as the lifecycle's `startHttps` wires it: on the app's own interface,
// forwarding to its loopback origin.
async function withHttpsHop(run: (hop: { readonly port: number; readonly ca: string }) => Promise<void>): Promise<void> {
  const pair = selfSignedIpPair(LAN);
  const terminator = await startTlsTerminator({ port: 0, host: LAN, ...pair, upstream: () => loopbackOrigin(LAN, port) });
  try {
    await run({ port: terminator.port, ca: pair.certificatePem });
  } finally {
    await terminator.close();
  }
}

test("the app listens on the LAN address and on loopback, at one port", async () => {
  expect(lifecycle.listeningAddress()?.address).toBe(LAN);
  expect((await send(LAN, "/healthz")).status).toBe(OK);
  expect((await send(LOOPBACK, "/healthz")).status).toBe(OK);
});

test("healthz shows the build to a loopback peer only, never to a relayed request on the loopback listener", async () => {
  expect(versionShown(await send(LOOPBACK, "/healthz"))).toBe(true);
  expect(versionShown(await send(LOOPBACK, "/healthz", { headers: { "cf-connecting-ip": VISITOR } }))).toBe(false);
  // This machine's own LAN address is a LAN peer, never loopback.
  expect(versionShown(await send(LAN, "/healthz"))).toBe(false);
});

test("a relayed first-run claim on the loopback listener is refused, and the owner stays unclaimed", async () => {
  expect((await claim(LOOPBACK, { "x-forwarded-for": VISITOR })).status).not.toBe(OK);
  expect((await claim(LOOPBACK, { "cf-connecting-ip": VISITOR })).status).not.toBe(OK);
  expect((await claim(LAN)).status).not.toBe(OK);
  expect(await firstRunOffered(LOOPBACK)).toBe(true);
  expect(await firstRunOffered(LOOPBACK, { "x-forwarded-for": VISITOR })).toBe(false);
  expect(await firstRunOffered(LAN)).toBe(false);
});

// The terminator marks every request it forwards with `x-forwarded-proto` (and `x-forwarded-for`), and a relay tell
// refuses the first-run claim on every peer, loopback included.
test("a first-run claim through the https hop is refused by its forwarding tell; the same claim straight to loopback is admitted", async () => {
  await withHttpsHop(async (hop) => {
    const relayed = await tlsRequest({ host: LAN, port: hop.port, ca: hop.ca, path: "/api/auth/first-run", method: "POST", headers: FORM, body: CLAIM_BODY });
    expect(relayed.status).not.toBe(OK);
    expect(relayed.cookie).toBe("");
  });
  expect(await firstRunOffered(LOOPBACK)).toBe(true);

  const claimed = await claim(LOOPBACK);
  expect(claimed.status).toBe(OK);
  expect(claimed.cookie).not.toBe("");
  ownerCookie = claimed.cookie;
  expect(await firstRunOffered(LOOPBACK)).toBe(false);
});

test("share.start runs the relay against the loopback listener, and a visitor it carries reaches the app", async () => {
  const started = await send(LOOPBACK, "/api/trpc/share.start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-orb-csrf": "1", cookie: ownerCookie },
    body: "{}",
  });
  expect(started.status, started.body).toBe(OK);
  const relay = relaySeams.latest();
  expect(relay.origin).toBe(`http://${LOOPBACK}:${String(port)}`);
  relay.events.onUrl(`https://${RELAY_HOST}`);
  const visitor = await requestWithHost(relay.origin, "/api/auth/config", {
    host: RELAY_HOST,
    headers: { "cf-connecting-ip": VISITOR, "x-forwarded-for": VISITOR, "x-forwarded-proto": "https" },
  });
  expect(visitor.status).toBe(OK);
  expect(JSON.parse(visitor.body)).toMatchObject({ localFirstRun: false });
});

test("the IP certificate's https hop on this bind reaches the app over loopback, which believes it was https", async () => {
  const { handle } = AUTH_ME.parse(JSON.parse((await send(LOOPBACK, "/api/auth/me", { headers: { cookie: ownerCookie } })).body));
  await withHttpsHop(async (hop) => {
    const body = new URLSearchParams({ handle, password: OWNER_PASSWORD }).toString();
    const answer = await tlsRequest({ host: LAN, port: hop.port, ca: hop.ca, path: "/api/auth/login", method: "POST", headers: FORM, body });
    expect(answer.status).toBe(OK);
    expect(answer.cookie).toContain(SECURE_SESSION_COOKIE);
  });
});

test("shutdown closes the LAN listener and the loopback listener", async () => {
  expect(await refuses(LAN)).toBe(false);
  expect(await refuses(LOOPBACK)).toBe(false);
  await lifecycle.shutdown();
  expect(await refuses(LAN)).toBe(true);
  expect(await refuses(LOOPBACK)).toBe(true);
});
