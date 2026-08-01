// data/auth-config — the deployment auth-config bootstrap read (the config half of the pre-tRPC seam
// moved out of features/auth so a chat context tab can read `multiHumanCapable` without a cross-feature
// reach). `fetch` is stubbed at the global boundary (the route-guards.test.ts / upload-asset.test.ts
// precedent). Pins the memoization contract: N concurrent callers share ONE network fetch, and a failed
// fetch clears the memo so the next call retries instead of caching the failure forever. `vi.resetModules`
// + a fresh dynamic import per test — the module-level `configPromise` memo would otherwise leak the
// PREVIOUS test's cached result across tests in the same file.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { afterEach, vi } from "vitest";
import type { AuthConfig } from "../../../packages/client/src/data/auth-config";
import { expect, test } from "../../support/fixtures";

const CONFIG: AuthConfig = {
  mode: "local",
  requiresLogin: true,
  localEnabled: true,
  oidcEnabled: false,
  discreetLogin: false,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  uploads: DEFAULT_UPLOAD_CAPS,
};

type FetchAuthConfig = typeof import("../../../packages/client/src/data/auth-config").fetchAuthConfig;

async function freshFetchAuthConfig(): Promise<FetchAuthConfig> {
  vi.resetModules();
  const mod = await import("../../../packages/client/src/data/auth-config");
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
