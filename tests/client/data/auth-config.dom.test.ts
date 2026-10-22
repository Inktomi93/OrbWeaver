// Bootstrap memoization and live relay reads through the public data door and native query observers.
import { fetchLiveShare, useAuthConfig } from "@orb/client/data";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser/ct-door.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

const CONFIG = authConfigSchema.parse({
  mode: "local",
  localEnabled: true,
  oidcEnabled: false,
  oidcProviderName: "Test IdP",
  localFirstRun: false,
  discreetLogin: true,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  uploads: DEFAULT_UPLOAD_CAPS,
  transport: "https",
  clientScope: "public",
  share: { state: "off", url: null },
});
const SHARING_CONFIG = authConfigSchema.parse({ ...CONFIG, share: { state: "up", url: "https://calm-river-four-birds.trycloudflare.com" } });

function CaptureAuthConfig({ reads }: { readonly reads: ReturnType<typeof useAuthConfig>[] }): null {
  reads.push(useAuthConfig());
  return null;
}

function authRead(runtime: ReturnType<typeof createClientRuntime>): ReturnType<typeof useAuthConfig> {
  const defaults = runtime.queryClient.getDefaultOptions();
  // Explicit refetches, not the query retry scheduler, drive this cache-lifetime case.
  runtime.queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  const reads: ReturnType<typeof useAuthConfig>[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureAuthConfig, { reads }) }));
  const read = reads[0];
  if (read === undefined) {
    throw new Error("The production data providers did not expose the auth-config hook");
  }
  return read;
}

test("bootstrap retries refused reads, shares an in-flight read across caches and retains success after eviction", async () => {
  using lifetime = new DisposableStack();
  const firstRuntime = createClientRuntime();
  lifetime.defer(() => firstRuntime.queryClient.clear());
  const secondRuntime = createClientRuntime();
  lifetime.defer(() => secondRuntime.queryClient.clear());
  const first = authRead(firstRuntime);
  const second = authRead(secondRuntime);
  const transport = vi.fn<typeof fetch>(() => Promise.reject(new Error("Unscripted auth-config request")));
  vi.stubGlobal("fetch", transport);

  transport.mockRejectedValueOnce(new Error("Network unavailable"));
  await expect(first.refetch({ throwOnError: true })).rejects.toThrow("Network unavailable");
  transport.mockResolvedValueOnce(new Response("refused", { status: 500 }));
  await expect(first.refetch({ throwOnError: true })).rejects.toThrow("HTTP 500");
  transport.mockResolvedValueOnce(Response.json({ ...CONFIG, transport: "ftp" }));
  await expect(first.refetch({ throwOnError: true })).rejects.toThrow();

  const held = Promise.withResolvers<Response>();
  transport.mockImplementation(() => held.promise.then((response) => response.clone()));
  const firstRead = first.refetch({ throwOnError: true });
  const secondRead = second.refetch({ throwOnError: true });
  held.resolve(Response.json(CONFIG));
  const results = await Promise.all([firstRead, secondRead]);
  expect(results.map((result) => result.data)).toEqual([CONFIG, CONFIG]);
  expect(transport).toHaveBeenCalledTimes(4);

  firstRuntime.queryClient.clear();
  secondRuntime.queryClient.clear();
  const afterEviction = authRead(firstRuntime);
  expect((await afterEviction.refetch({ throwOnError: true })).data).toEqual(CONFIG);
  expect(transport).toHaveBeenCalledTimes(4);
  expect(transport).toHaveBeenCalledWith("/api/auth/config", { credentials: "same-origin" });
});

test("live share bypasses the bootstrap memo and reads the current relay with no-store", async () => {
  const transport = vi.fn<typeof fetch>(() => Promise.reject(new Error("Unscripted live-share request")));
  transport.mockResolvedValueOnce(Response.json(CONFIG)).mockResolvedValueOnce(Response.json(SHARING_CONFIG));
  vi.stubGlobal("fetch", transport);
  await expect(fetchLiveShare()).resolves.toEqual(CONFIG.share);
  await expect(fetchLiveShare()).resolves.toEqual(SHARING_CONFIG.share);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport).toHaveBeenNthCalledWith(1, "/api/auth/config", { credentials: "same-origin", cache: "no-store" });
  expect(transport).toHaveBeenNthCalledWith(2, "/api/auth/config", { credentials: "same-origin", cache: "no-store" });
});

test("live share refuses HTTP errors and malformed full configs before accepting a valid link", async () => {
  const transport = vi.fn<typeof fetch>(() => Promise.reject(new Error("Unscripted live-share request")));
  vi.stubGlobal("fetch", transport);
  transport.mockResolvedValueOnce(new Response("refused", { status: 502 }));
  await expect(fetchLiveShare()).rejects.toThrow("HTTP 502");
  for (const body of [{ ...CONFIG, share: { state: "up" } }, { share: SHARING_CONFIG.share }, { ...SHARING_CONFIG, transport: "ftp" }]) {
    transport.mockResolvedValueOnce(Response.json(body));
    await expect(fetchLiveShare()).rejects.toThrow();
  }
  transport.mockResolvedValueOnce(Response.json(SHARING_CONFIG));
  await expect(fetchLiveShare()).resolves.toEqual(SHARING_CONFIG.share);
  expect(transport).toHaveBeenCalledTimes(5);
});
