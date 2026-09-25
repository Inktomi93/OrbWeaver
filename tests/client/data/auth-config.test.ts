// data/auth-config — the deployment auth-config bootstrap read (the config half of the pre-tRPC seam
// moved out of features/auth so a chat context tab can read `multiHumanCapable` without a cross-feature
// reach). `fetch` is stubbed at the global boundary (the route-guards.test.ts / upload-asset.test.ts
// precedent). Pins the memoization contract: N concurrent callers share ONE network fetch, and a failed
// fetch clears the memo so the next call retries instead of caching the failure forever. `vi.resetModules`
// + a fresh dynamic import per test — the module-level `configPromise` memo would otherwise leak the
// PREVIOUS test's cached result across tests in the same file.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { afterEach, vi } from "vitest";
import type { AuthConfig } from "../../../packages/client/src/data/auth-config.ts";
import { expect, test } from "../../support/fixtures.ts";
import { reimportBudget } from "../../support/reimport-budget.ts";

// The re-import IS the subject here (see the header): every case pays a fresh transform of the client
// data module's graph, inside the first test's timer. Measured cold and alone on a quiet box
// (2026-09-19, `pnpm test:scoped … --reporter=verbose`): the first test 1732 ms, the two after it 48/44 ms
// — the whole cost is the transform. 30 s is that number with the contention headroom `reimportBudget`'s
// header derives; the 5 s project default is what reds this file in a cold scoped run.
vi.setConfig({ testTimeout: reimportBudget(30_000) });

const CONFIG: AuthConfig = {
  mode: "local",
  requiresLogin: true,
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

type FetchAuthConfig = typeof import("../../../packages/client/src/data/auth-config.ts").fetchAuthConfig;

async function freshFetchAuthConfig(): Promise<FetchAuthConfig> {
  vi.resetModules();
  const mod = await import("../../../packages/client/src/data/auth-config.ts");
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

// The share half changes while the server runs, so the live read is never served from the memo: two calls are two
// fetches, and each answers the share the server holds at that moment.
test("fetchLiveShare reads fresh each call, and parses only the share fields", async () => {
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
  const { fetchLiveShare } = await import("../../../packages/client/src/data/auth-config.ts");
  await expect(fetchLiveShare()).resolves.toEqual(shares[0]);
  await expect(fetchLiveShare()).resolves.toEqual(shares[1]);
  expect(calls).toBe(2);
});

test("fetchLiveShare throws on a non-ok response or a malformed share, so no link is built on it", async () => {
  vi.resetModules();
  const { fetchLiveShare } = await import("../../../packages/client/src/data/auth-config.ts");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 502 })));
  await expect(fetchLiveShare()).rejects.toThrow("HTTP 502");
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ ...CONFIG, share: { state: "up" } }), { status: 200 })));
  await expect(fetchLiveShare()).rejects.toThrow();
});
