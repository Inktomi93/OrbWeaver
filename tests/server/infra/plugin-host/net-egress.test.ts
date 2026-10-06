import type { PluginInvocationLiveness } from "@orb/contracts/plugin";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { vi } from "vitest";
import { __setEgressResolverForTest } from "../../../../packages/server/src/infra/network/egress.ts";
import type { PluginEgressBridge } from "../../../../packages/server/src/infra/plugin-host/net-egress.ts";
import { createPluginNetEgress } from "../../../../packages/server/src/infra/plugin-host/net-egress.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { pngBytes } from "../../domain/embeddings/_support.ts";

const URL = "https://api.allowed.test/image.png";
const LIVE: PluginInvocationLiveness = { aborted: false, onAbort: () => (): void => undefined };

test("malformed guest init fields are dropped and a successful transport detaches cancellation", async () => {
  let detached = 0;
  const liveness: PluginInvocationLiveness = {
    aborted: false,
    onAbort: () => () => {
      detached += 1;
    },
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("plain reply"));
  const egress = createPluginNetEgress(["api.allowed.test"], {
    admitEgress: () => undefined,
    admitAssetEgress: () => undefined,
    assets: { storeFetched: () => Promise.reject(new Error("text fetch must not store")) },
  });
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal("fetch", fetch);
  try {
    expect(await egress.fetch(URL, { method: "DELETE", headers: ["not-a-header-map"], body: { private: "inert" } }, liveness)).toEqual({
      status: 200,
      body: "plain reply",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.method).toBeUndefined();
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("0")).toBe(false);
    expect(detached).toBe(1);
  } finally {
    __setEgressResolverForTest(null);
  }
});

test("the two admission belts precede transport and a guest init cannot widen manifest authority", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ accepted: true }));
  const store = vi.fn<PluginEgressBridge["assets"]["storeFetched"]>(async () => ({ assetId: mintTypeId(ID_PREFIX.asset) }));
  let refuse = true;
  const text = vi.fn(() => {
    if (refuse) {
      throw new Error("text belt refused");
    }
  });
  const asset = vi.fn(() => {
    if (refuse) {
      throw new Error("asset belt refused");
    }
  });
  const egress = createPluginNetEgress(["api.allowed.test"], { admitEgress: text, admitAssetEgress: asset, assets: { storeFetched: store } });
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(egress.fetch(URL, {}, LIVE)).rejects.toThrow("text belt refused");
    await expect(egress.fetchAsset(URL, LIVE)).rejects.toThrow("asset belt refused");
    expect(fetch).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    refuse = false;
    expect(await egress.fetch(URL, { method: "POST", headers: { "x-fixture": "owned" }, body: "body", allowedHosts: ["foreign.test"] }, LIVE)).toMatchObject({
      status: 200,
      body: '{"accepted":true}',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: "body" });
    await expect(egress.fetch("https://foreign.test/secret", { allowedHosts: ["foreign.test"] }, LIVE)).rejects.toMatchObject({ reason: "host-not-allowed" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledTimes(3);
    expect(asset).toHaveBeenCalledTimes(1);
  } finally {
    __setEgressResolverForTest(null);
  }
});

test("only an admitted 2xx sniffed image reaches CAS, while malformed or oversized pixels do not", async () => {
  let response = (): Response => new Response(pngBytes(1, 1), { headers: { "content-type": "image/png" } });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
  const id = mintTypeId(ID_PREFIX.asset);
  const store = vi.fn<PluginEgressBridge["assets"]["storeFetched"]>(async () => ({ assetId: id }));
  const asset = vi.fn(() => undefined);
  const text = vi.fn(() => undefined);
  const egress = createPluginNetEgress(["api.allowed.test"], { admitEgress: text, admitAssetEgress: asset, assets: { storeFetched: store } });
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal("fetch", fetch);
  try {
    expect(await egress.fetchAsset(URL, LIVE)).toEqual({ assetId: id });
    expect(store.mock.calls[0]?.[1]).toBe("image/png");
    response = (): Response => new Response("unavailable", { status: 503 });
    await expect(egress.fetchAsset(URL, LIVE)).rejects.toThrow();
    response = (): Response => new Response("not an image", { headers: { "content-type": "image/png" } });
    await expect(egress.fetchAsset(URL, LIVE)).rejects.toThrow();
    response = (): Response => new Response(pngBytes(50_000, 50_000), { headers: { "content-type": "image/png" } });
    await expect(egress.fetchAsset(URL, LIVE)).rejects.toThrow();
    expect(store).toHaveBeenCalledTimes(1);
    expect(asset).toHaveBeenCalledTimes(4);
    expect(text).not.toHaveBeenCalled();
  } finally {
    __setEgressResolverForTest(null);
  }
});

test("invocation cancellation reaches the in-flight transport and releases its listener on failure", async () => {
  const reached = Promise.withResolvers<void>();
  let abort = (): void => {
    throw new Error("listener not installed");
  };
  let detached = 0;
  const liveness: PluginInvocationLiveness = {
    aborted: false,
    onAbort: (notify) => {
      abort = notify;
      return () => {
        detached += 1;
      };
    },
  };
  const store = vi.fn<PluginEgressBridge["assets"]["storeFetched"]>(async () => ({ assetId: mintTypeId(ID_PREFIX.asset) }));
  const egress = createPluginNetEgress(["api.allowed.test"], {
    admitEgress: () => undefined,
    admitAssetEgress: () => undefined,
    assets: { storeFetched: store },
  });
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal(
    "fetch",
    (_input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("fixture transport aborted")), { once: true });
        reached.resolve();
      }),
  );
  try {
    const pending = egress.fetch(URL, {}, liveness);
    const refused = expect(pending).rejects.toThrow();
    await reached.promise;
    abort();
    await refused;
    expect(detached).toBe(1);
    expect(store).not.toHaveBeenCalled();
  } finally {
    __setEgressResolverForTest(null);
  }
});
