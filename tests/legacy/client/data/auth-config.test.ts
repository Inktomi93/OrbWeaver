// data/auth-config — the deployment auth-config bootstrap read (the config half of the pre-tRPC seam
// moved out of features/auth so a chat context tab can read `multiHumanCapable` without a cross-feature
// reach). `fetch` is stubbed at the global boundary (the route-guards.test.ts / upload-asset.test.ts
// precedent). Pins the memoization contract: N concurrent callers share ONE network fetch, and a failed
// fetch clears the memo so the next call retries instead of caching the failure forever. `vi.resetModules`
// + a fresh dynamic import per test — the module-level `configPromise` memo would otherwise leak the
// PREVIOUS test's cached result across tests in the same file.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { reimportBudget } from "@orb/testkit/node/reimport-budget.ts";
import { afterEach, vi } from "vitest";
import type { AuthConfig } from "#client/data/auth-config.ts";

// The re-import IS the subject here (see the header): every case pays a fresh transform of the client
// data module's graph, inside the first test's timer. Measured cold and alone on a quiet box
// (2026-09-19, `pnpm test:scoped … --reporter=verbose`): the first test 1732 ms, the two after it 48/44 ms
// — the whole cost is the transform. 30 s is that number with the contention headroom `reimportBudget`'s
// header derives; the 5 s project default is what reds this file in a cold scoped run.
vi.setConfig({ testTimeout: reimportBudget(30_000) });

const CONFIG: AuthConfig = {
  mode: "local",
  localEnabled: true,
  oidcEnabled: false,
  oidcProviderName: "your identity provider",
  localFirstRun: false,
  discreetLogin: false,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  uploads: DEFAULT_UPLOAD_CAPS,
  transport: "https",
  clientScope: "private",
  share: { state: "off", url: null },
};

type FetchAuthConfig = typeof import("#client/data/auth-config.ts").fetchAuthConfig;

async function freshFetchAuthConfig(): Promise<FetchAuthConfig> {
  vi.resetModules();
  const mod = await import("#client/data/auth-config.ts");
  return mod.fetchAuthConfig;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchAuthConfig memoizes — N concurrent callers share ONE network fetch", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify(CONFIG), { status: 200 }));
  });
  const fetchAuthConfig = await freshFetchAuthConfig();

  const [a, b, c] = await Promise.all([fetchAuthConfig(), fetchAuthConfig(), fetchAuthConfig()]);
  expect(a).toEqual(CONFIG);
  expect(b).toEqual(CONFIG);
  expect(c).toEqual(CONFIG);
  expect(calls).toBe(1);
});

test("a failed fetch clears the memo so the next caller retries instead of caching the failure", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
  const fetchAuthConfig = await freshFetchAuthConfig();
  await expect(fetchAuthConfig()).rejects.toThrow("ECONNREFUSED");

  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(CONFIG), { status: 200 })));
  await expect(fetchAuthConfig()).resolves.toEqual(CONFIG);
});

test("a non-ok response throws an HTTP-status error", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 500 })));
  const fetchAuthConfig = await freshFetchAuthConfig();
  await expect(fetchAuthConfig()).rejects.toThrow("HTTP 500");
});

test.each([
  ["missing fields", { mode: CONFIG.mode }],
  ["unknown mode", { ...CONFIG, mode: "saml" }],
  ["unknown transport", { ...CONFIG, transport: "ftp" }],
  ["unknown client scope", { ...CONFIG, clientScope: "trusted" }],
  ["malformed flag", { ...CONFIG, localFirstRun: "true" }],
  ["malformed upload cap", { ...CONFIG, uploads: { ...CONFIG.uploads, image: "unlimited" } }],
  ["missing share link", { ...CONFIG, share: { state: "up" } }],
])("fetchAuthConfig refuses %s and retries after the parse failure", async (_label, body) => {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));
  const fetchAuthConfig = await freshFetchAuthConfig();
  await expect(fetchAuthConfig()).rejects.toThrow();

  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(CONFIG)));
  await expect(fetchAuthConfig()).resolves.toEqual(CONFIG);
});

test("fetchAuthConfig refuses every missing required field rather than inventing a default", async () => {
  const fetchAuthConfig = await freshFetchAuthConfig();
  for (const field of Object.keys(CONFIG)) {
    const body = Object.fromEntries(Object.entries(CONFIG).filter(([key]) => key !== field));
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));
    await expect(fetchAuthConfig(), field).rejects.toThrow();
  }
});

// The share half changes while the server runs, so the live read is never served from the memo: two calls are two
// fetches, and each answers the share the server holds at that moment.
test("fetchLiveShare reads fresh each call and returns the parsed config's share fields", async () => {
  const shares = [
    { state: "off", url: null },
    { state: "up", url: "https://calm-river-four-birds.trycloudflare.com" },
  ];
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    const share = shares[calls];
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ ...CONFIG, share }), { status: 200 }));
  });
  vi.resetModules();
  const { fetchLiveShare } = await import("#client/data/auth-config.ts");
  await expect(fetchLiveShare()).resolves.toEqual(shares[0]);
  await expect(fetchLiveShare()).resolves.toEqual(shares[1]);
  expect(calls).toBe(2);
});

test("fetchLiveShare throws on a non-ok response or a malformed share, so no link is built on it", async () => {
  vi.resetModules();
  const { fetchLiveShare } = await import("#client/data/auth-config.ts");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 502 })));
  await expect(fetchLiveShare()).rejects.toThrow("HTTP 502");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ ...CONFIG, share: { state: "up" } }), { status: 200 })));
  await expect(fetchLiveShare()).rejects.toThrow();
});

test("fetchLiveShare refuses an incomplete or malformed config even when its share block is valid", async () => {
  vi.resetModules();
  const { fetchLiveShare } = await import("#client/data/auth-config.ts");
  for (const body of [{ share: CONFIG.share }, { ...CONFIG, transport: "ftp" }, { ...CONFIG, uploads: null }]) {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body)));
    await expect(fetchLiveShare()).rejects.toThrow();
  }
});
