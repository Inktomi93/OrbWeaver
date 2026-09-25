// entry/lifecycle — the share relay as production wires it, over a fake launcher (no download, no tunnel). A fresh
// `AUTH_MODE=local` box launched with `SHARE_RELAY=quick` must not start the relay while the owner is unclaimed; the
// loopback first-run claim starts it in-process; its host is admitted only while it is up; shutdown ends it.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RelayEvents, RelayLauncher } from "@orb/server/infra/relay";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { requestWithHost } from "../../support/host-request.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-share-relay-"));
const OWNER_PASSWORD = "correct-horse-battery";
const OK = 200;
const MISDIRECTED = 421;
const BOOT_TIMEOUT_MS = 120_000;
const FIRST_HOST = "calm-river-four-birds.trycloudflare.com";
const SECOND_HOST = "quiet-lake-two-foxes.trycloudflare.com";

vi.stubEnv("DATA_DIR", TEMP_DIR);
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SHARE_RELAY", "quick");
vi.stubEnv("AUTH_FALLBACK", undefined);
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("CREDENTIALS_KEY", undefined);
vi.stubEnv("LOCAL_INITIAL_PASSWORD", undefined);
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
// The boot refusal is read back from the log ring, which records only at or above LOG_LEVEL.
vi.stubEnv("LOG_LEVEL", "warn");
// The boot installs the egress firewall, which blocks loopback for this test's own fetches unless allowed.
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});
const { logRing } = await import("../../../packages/server/src/foundation/observability/index.ts");

interface FakeRelay {
  readonly origin: string;
  readonly events: RelayEvents;
  stopped: boolean;
}

const relays: FakeRelay[] = [];
const launcher: RelayLauncher = {
  launch: (origin, events) => {
    const relay: FakeRelay = { origin, events, stopped: false };
    relays.push(relay);
    return Promise.resolve({
      stop: (): void => {
        relay.stopped = true;
      },
    });
  },
};

function latestRelay(): FakeRelay {
  const relay = relays.at(-1);
  if (relay === undefined) {
    throw new Error("no relay was launched");
  }
  return relay;
}

const lifecycle = createLifecycle({ listenPort: 0, relayLauncher: launcher });
let base = "";
let loopbackBase = "";
let port = "";
let ownerCookie = "";

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

async function shareConfig(cookie = ""): Promise<unknown> {
  const res = await fetch(`${base}/api/auth/config`, { headers: cookie === "" ? {} : { cookie } });
  expect(res.status).toBe(OK);
  return ((await res.json()) as { share: unknown }).share;
}

async function statusFor(host: string): Promise<number> {
  return (await requestWithHost(loopbackBase, "/api/auth/config", { host })).status;
}

async function shareMutation(verb: "start" | "stop"): Promise<Response> {
  return await fetch(`${base}/api/trpc/share.${verb}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-orb-csrf": "1", cookie: ownerCookie },
    body: "{}",
  });
}

test("SHARE_RELAY at boot with an unclaimed owner starts no relay and names the local setup", async () => {
  const refusal = await vi.waitFor(() => {
    const line = logRing.recent().find((entry) => entry.includes('"code":"share_owner_unclaimed"'));
    if (line === undefined) {
      throw new Error("the boot share start has not settled yet");
    }
    return line;
  });
  expect(refusal).toContain(`Open http://localhost:${port} on this machine`);
  expect(relays).toEqual([]);
  expect(await shareConfig()).toEqual({ state: "off", url: null });
  expect(await statusFor(FIRST_HOST)).toBe(MISDIRECTED);
});

test("the loopback first-run claim starts the waiting relay in-process; its host is admitted once it reports its URL", async () => {
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

  await vi.waitFor(() => {
    expect(relays).toHaveLength(1);
  });
  expect(latestRelay().origin).toBe(`http://127.0.0.1:${port}`);
  expect(await shareConfig(ownerCookie)).toEqual({ state: "starting", url: null });
  expect(await statusFor(FIRST_HOST)).toBe(MISDIRECTED);

  latestRelay().events.onUrl(`https://${FIRST_HOST}`);
  expect(await statusFor(FIRST_HOST)).toBe(OK);
  expect(await shareConfig(ownerCookie)).toEqual({ state: "up", url: `https://${FIRST_HOST}` });
  expect(await shareConfig()).toEqual({ state: "up", url: null });
});

// A share turns on the seating a public link needs: invites (multi-human) and a blank sign-in form, so the page a
// stranger reaches through the link never pre-fills the owner's handle.
test("the share the claim started left discreet login and multi-human seating on", async () => {
  const res = await fetch(`${base}/api/auth/config`);
  expect(res.status).toBe(OK);
  expect(await res.json()).toMatchObject({ discreetLogin: true, defaultHandle: null, multiHumanCapable: true });
});

test("share.stop drops the relay host at once; share.start runs a new relay whose old name stays refused", async () => {
  const stopped = await shareMutation("stop");
  expect(stopped.status).toBe(OK);
  expect(latestRelay().stopped).toBe(true);
  expect(await statusFor(FIRST_HOST)).toBe(MISDIRECTED);
  expect(await shareConfig(ownerCookie)).toEqual({ state: "off", url: null });

  const started = await shareMutation("start");
  expect(started.status).toBe(OK);
  expect(relays).toHaveLength(2);
  latestRelay().events.onUrl(`https://${SECOND_HOST}`);
  expect(await statusFor(SECOND_HOST)).toBe(OK);
  expect(await statusFor(FIRST_HOST)).toBe(MISDIRECTED);
});

test("shutdown ends the relay first", async () => {
  await lifecycle.shutdown();
  expect(latestRelay().stopped).toBe(true);
});
