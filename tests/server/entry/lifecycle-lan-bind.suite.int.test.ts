// entry/lifecycle — a box whose BIND_HOST names one LAN interface also listens on loopback at the same port (D269), so
// the share relay and the IP certificate's https listener reach it as a loopback peer, and a person at this machine
// can claim the owner over loopback. The loopback listener widens nothing: a relayed request arriving on it is still
// refused every loopback-gated grant, and this machine's own LAN address is never loopback. Shutdown closes both.

import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { createFrozenClock } from "../../support/clock.ts";
import { fakeRelaySeams } from "../../support/fake-relay.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { HostResponse } from "../../support/host-request.ts";
import { requestWithHost } from "../../support/host-request.ts";
import { lanAddress } from "../../support/node/lan-address.ts";
import { ipCertificatePem } from "../../support/node/x509.ts";

const LAN = lanAddress();
const LOOPBACK = "127.0.0.1";
const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-lan-bind-"));
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const BOOT_TIMEOUT_MS = 120_000;
const RELAY_HOST = "calm-river-four-birds.trycloudflare.com";
const VISITOR = "203.0.113.9";
const LIFETIME_MS = 160 * 3_600_000;
// The TLS client checks the certificate against the real clock, so it stays valid for years around the frozen one.
const VALID_LIFETIMES = 1000;
const FORM = { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" };
const SECURE_SESSION_COOKIE = "__Host-orb_session=";

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

function claim(host: string, headers: Record<string, string> = {}): Promise<{ readonly status: number; readonly cookie: string }> {
  return postForm(host, "/api/auth/first-run", new URLSearchParams({ password: OWNER_PASSWORD }).toString(), headers);
}

function versionShown(res: HostResponse): boolean {
  return "version" in (JSON.parse(res.body) as Record<string, unknown>);
}

function cookieHeader(headers: IncomingHttpHeaders): string {
  return (headers["set-cookie"] ?? []).map((cookie) => cookie.split(";")[0] ?? "").join("; ");
}

function certificateFor(address: string): { readonly certificatePem: string; readonly keyPem: string } {
  const clock = createFrozenClock();
  const keys: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    certificatePem: ipCertificatePem({
      address,
      subjectPublicKey: keys.publicKey,
      issuerKey: keys.privateKey,
      issuerName: address,
      serial: 1,
      notBefore: clock.now() - LIFETIME_MS,
      notAfter: clock.now() + LIFETIME_MS * VALID_LIFETIMES,
    }),
    keyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
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

test("a person at this machine claims the owner over loopback", async () => {
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
  const pair = certificateFor(LAN);
  // Exactly as the lifecycle's `startHttps` wires it: the app's own interface, forwarding to its loopback origin.
  const terminator = await startTlsTerminator({ port: 0, host: LAN, ...pair, upstream: () => loopbackOrigin(LAN, port) });
  try {
    const handle = (JSON.parse((await send(LOOPBACK, "/api/auth/me", { headers: { cookie: ownerCookie } })).body) as { handle: string }).handle;
    const body = new URLSearchParams({ handle, password: OWNER_PASSWORD }).toString();
    const answer = await new Promise<{ readonly status: number; readonly cookie: string }>((resolve, reject) => {
      const req = httpsRequest(
        {
          host: LAN,
          port: terminator.port,
          path: "/api/auth/login",
          method: "POST",
          headers: { ...FORM, "content-length": String(Buffer.byteLength(body)) },
          ca: pair.certificatePem,
          agent: false,
        },
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
    expect(answer.status).toBe(OK);
    expect(answer.cookie).toContain(SECURE_SESSION_COOKIE);
  } finally {
    await terminator.close();
  }
});

test("shutdown closes the LAN listener and the loopback listener", async () => {
  expect(await refuses(LAN)).toBe(false);
  expect(await refuses(LOOPBACK)).toBe(false);
  await lifecycle.shutdown();
  expect(await refuses(LAN)).toBe(true);
  expect(await refuses(LOOPBACK)).toBe(true);
});
