import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import type { BridgeAuthority } from "../../../../packages/server/src/infra/plugin-host/bridge-rpc.ts";
import { authorizeBridgeCall, authorizeSyncCall } from "../../../../packages/server/src/infra/plugin-host/bridge-rpc.ts";
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

test("sync egress admissions keep their original grants", () => {
  expect(() => authorizeSyncCall(authority([]), "admitEgress")).toThrow(/lacks capability net\.fetch/u);
  expect(() => authorizeSyncCall(authority(["net.fetch"]), "admitEgress")).not.toThrow();
  expect(() => authorizeSyncCall(authority(["net.fetch_asset"]), "admitAssetEgress")).not.toThrow();
});

test("rehydration permits catalog reads but refuses effects and egress before dispatch", () => {
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "rehydration"), "storage.get", ["setting"])).not.toThrow();
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "rehydration"), "storage.set", ["setting", "changed"])).toThrow(
    /unavailable while rebuilding/u,
  );
  expect(() => authorizeBridgeCall(authority(["ui.surface"], null, "rehydration"), "ui.setState", ["panel", {}, null])).toThrow(
    /unavailable while rebuilding/u,
  );
  expect(() => authorizeSyncCall(authority(["net.fetch"], null, "rehydration"), "admitEgress")).toThrow(/unavailable while rebuilding/u);
  expect(() => authorizeSyncCall(authority([], null, "rehydration"), "seam.mintId")).toThrow(/unavailable while rebuilding/u);
  expect(() => authorizeSyncCall(authority([], null, "rehydration"), "seam.nowEpochMs")).not.toThrow();
});

test("lifecycle teardown authority cannot dispatch a late guest call", () => {
  expect(() => authorizeBridgeCall(authority(["storage.kv"], null, "lifecycle"), "storage.get", ["key"])).toThrow(/lifecycle teardown/u);
  expect(() => authorizeSyncCall(authority([], null, "lifecycle"), "seam.nowEpochMs")).toThrow(/lifecycle teardown/u);
});
