// domain/plugin/substrate/ui-host-dispatch — the per-function argument schema + bridge dispatch for every
// `UI_PROXYABLE_HOST_FUNCTIONS` member (U4, §4.6 / seam 5). The module's runtime contract,
// pinned here:
//   1. DISPATCH IS EXHAUSTIVE — every proxyable name resolves to an impl (a missing arm would throw a synchronous
//      "not a function" TypeError, which no valid name may do). This is the runtime shadow of the compile-time
//      `Record<UiProxyableHostFunction, …>` key: if the tuple ever grows without a matching impl, this loop reds.
//   2. A VALID CALL DISPATCHES to the SAME bridge op a server guest would ride, forwarding the parsed positional
//      args unchanged (the marshal law: args in, JSON-safe value out).
//   3. A REFUSAL IS A DIFFERENT OUTCOME FROM AN EMPTY RESULT — a wrongly-shaped arg (non-string key, empty key,
//      over-cap key/limit, extra args to a no-arg fn) REJECTS rather than reaching the op with garbage. This is
//      the file header's own headline: a `storage.get` with a bad key must throw, never answer `null`.
//   4. CHAT SCOPE IS AUTHORITY, NOT PAYLOAD — the two chat-scoped fns take the room from the verb's admitted
//      `chatId`; called with `null` they refuse (a named scope error), and the admitted id is forwarded, never
//      read from the arg bag.

import type { PluginBridge, PluginMessageView } from "@orb/contracts/plugin";
import { UI_PROXYABLE_HOST_FUNCTIONS } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { runUiHostCall } from "../../../../../packages/server/src/domain/plugin/substrate/ui-host-dispatch.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_ui_host_dispatch_00000001");
const MESSAGES: readonly PluginMessageView[] = [{ id: "m1", role: "user", authorDisplayName: "Ada", characterId: null, seq: 0, content: "hi" }];

/** A fully-typed `PluginBridge` double. Only the KV/chat-read ops are proxyable (`UI_PROXYABLE_HOST_FUNCTIONS`),
 *  so those are `vi.fn` spies with recorded returns; the write/host ops the proxy set deliberately EXCLUDES are
 *  stubbed to reject, which doubles as a tripwire — a future proxyable member wired to one of them would surface
 *  as a rejection here rather than as a silent host write. */
function makeBridge(): PluginBridge {
  const notProxied =
    (name: string): (() => never) =>
    (): never => {
      throw new Error(`bridge.${name} is not part of the UI proxy set and must not be dispatched here`);
    };
  const bridge = {
    chat: {
      listMessages: vi.fn(async (_chatId: ChatId, _limit: number | undefined): Promise<readonly PluginMessageView[]> => MESSAGES),
      getVariables: vi.fn(async (_chatId: ChatId) => ({ mood: "calm" })),
      applyVariableOps: notProxied("chat.applyVariableOps"),
      requestTurn: notProxied("chat.requestTurn"),
      // #788 F11 — the roster read is NOT proxyable (excluded, a priced widening), so a Tier-C dispatch must throw.
      listCharacters: notProxied("chat.listCharacters"),
    },
    // #788 F12 — the world-info reads are NOT proxyable (excluded), so a Tier-C dispatch of either must throw.
    worldInfo: {
      upsertEntry: notProxied("worldInfo.upsertEntry"),
      listBooks: notProxied("worldInfo.listBooks"),
      listEntries: notProxied("worldInfo.listEntries"),
    },
    // #788 seam-11 + #798 — the CAS asset read AND the fetch-asset CAS write are NOT proxyable (excluded), so a Tier-C dispatch must throw.
    assets: { read: notProxied("assets.read"), storeFetched: notProxied("assets.storeFetched") },
    // #788 F1 — first-party retrieval is NOT proxyable (excluded, embedding-compute class), so a Tier-C dispatch must throw.
    search: { documents: notProxied("search.documents") },
    imagery: { generatePicture: notProxied("imagery.generatePicture") },
    variables: {
      get: vi.fn(async (_key: string) => "v-user"),
      set: vi.fn(async (_key: string, _value: string) => undefined),
      delete: vi.fn(async (_key: string) => undefined),
    },
    storage: {
      get: vi.fn(async (_key: string) => "v-plugin"),
      set: vi.fn(async (_key: string, _value: string) => undefined),
      delete: vi.fn(async (_key: string) => undefined),
      list: vi.fn(async (_prefix: string | undefined) => ["k1", "k2"] as const),
      compareAndSet: vi.fn(async (_key: string, _expected: string | null, _next: string) => ({ applied: true, current: _next })),
    },
    notifications: { post: notProxied("notifications.post") },
    llm: { quiet: notProxied("llm.quiet") },
    suggest: notProxied("suggest"),
    admitEgress: (): void => undefined,
    admitAssetEgress: (): void => undefined,
    surfaceQuickReply: notProxied("surfaceQuickReply"),
    ui: { setState: notProxied("ui.setState"), toast: notProxied("ui.toast"), openDialog: notProxied("ui.openDialog") },
    // U8 canon writes — NOT proxyable (the excluded set), so a Tier-C guest must never reach them.
    databank: { ingest: notProxied("databank.ingest") },
    character: {
      ingest: notProxied("character.ingest"),
      ingestAsset: notProxied("character.ingestAsset"),
      // D148 per-card state — also NOT proxyable (both in the excluded set), so a Tier-C guest reaching them here throws.
      setCardData: notProxied("character.setCardData"),
      getCardData: notProxied("character.getCardData"),
    },
    pubsub: { emit: notProxied("pubsub.emit") },
  } satisfies PluginBridge;
  return bridge;
}

describe("runUiHostCall — dispatch coverage", () => {
  test("every proxyable function resolves to an impl (no member throws a synchronous 'not a function')", () => {
    // The runtime shadow of the exhaustive `Record<UiProxyableHostFunction, …>` key. A missing arm makes
    // `UI_HOST_CALL_IMPLS[fn]` undefined, and `undefined(...)` throws SYNCHRONOUSLY from the (non-async)
    // `runUiHostCall`. A present arm is an async lambda: bad args become a REJECTION, never a sync throw. So the
    // pin is "no member throws synchronously" — the async rejections are swallowed here on purpose (asserted
    // per-fn below). A wrong-shape `{}` guarantees every schema's `.parse` rejects rather than dispatching.
    const bridge = makeBridge();
    for (const fn of UI_PROXYABLE_HOST_FUNCTIONS) {
      expect(() => {
        void runUiHostCall(fn, bridge, {}, CHAT).catch(() => undefined);
      }, `${fn} must have a dispatch impl`).not.toThrow();
    }
  });
});

describe("runUiHostCall — a valid call dispatches to the bridge op", () => {
  test("storage.get forwards the parsed key and returns the op's value", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("storage.get", bridge, ["my-key"], null);
    expect(bridge.storage.get).toHaveBeenCalledExactlyOnceWith("my-key");
    expect(value).toBe("v-plugin");
  });

  test("storage.set forwards key+value and answers a literal null (a void op is not a hole)", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("storage.set", bridge, ["k", "val"], null);
    expect(bridge.storage.set).toHaveBeenCalledExactlyOnceWith("k", "val");
    expect(value).toBeNull();
  });

  test("storage.delete forwards the key and answers null", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("storage.delete", bridge, ["gone"], null);
    expect(bridge.storage.delete).toHaveBeenCalledExactlyOnceWith("gone");
    expect(value).toBeNull();
  });

  // #1442 — the ATOMIC arm across the Tier-C proxy. This path is the WHOLE reason the op exists: unlike a
  // server guest's call it rides no resident and no invoke queue (`verbs/ui-host-call.ts` calls the bridge
  // directly), so a scripted surface really is a concurrent writer of the same `(plugin, owner)` rows.
  test("storage.compareAndSet forwards key/expected/next and returns the outcome object", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("storage.compareAndSet", bridge, ["count", "3", "4"], null);
    expect(bridge.storage.compareAndSet).toHaveBeenCalledExactlyOnceWith("count", "3", "4");
    expect(value).toEqual({ applied: true, current: "4" });
  });

  test("storage.compareAndSet accepts a NULL precondition (the create-if-absent claim)", async () => {
    const bridge = makeBridge();
    await runUiHostCall("storage.compareAndSet", bridge, ["seq", null, "1"], null);
    expect(bridge.storage.compareAndSet).toHaveBeenCalledExactlyOnceWith("seq", null, "1");
  });

  // A MISSING precondition is a REFUSAL, not a silent create — the schema is `nullable`, never `optional`.
  // A client that forgot the argument must not be handed an unconditional write through the atomic door
  // (this file's "a refusal is a different outcome from an empty result" law, applied to the write side).
  test("storage.compareAndSet REFUSES an omitted precondition rather than treating it as `null`", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("storage.compareAndSet", bridge, ["seq", "1"], null)).rejects.toThrow();
    expect(bridge.storage.compareAndSet).not.toHaveBeenCalled();
  });

  test("storage.list forwards an explicit prefix", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("storage.list", bridge, ["pfx:"], null);
    expect(bridge.storage.list).toHaveBeenCalledExactlyOnceWith("pfx:");
    expect(value).toEqual(["k1", "k2"]);
  });

  test("storage.list forwards undefined when the optional prefix is omitted", async () => {
    const bridge = makeBridge();
    await runUiHostCall("storage.list", bridge, [], null);
    expect(bridge.storage.list).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("variables.get/set/delete forward to the user-namespace ops", async () => {
    const bridge = makeBridge();
    expect(await runUiHostCall("variables.get", bridge, ["mood"], null)).toBe("v-user");
    expect(bridge.variables.get).toHaveBeenCalledExactlyOnceWith("mood");
    expect(await runUiHostCall("variables.set", bridge, ["mood", "happy"], null)).toBeNull();
    expect(bridge.variables.set).toHaveBeenCalledExactlyOnceWith("mood", "happy");
    expect(await runUiHostCall("variables.delete", bridge, ["mood"], null)).toBeNull();
    expect(bridge.variables.delete).toHaveBeenCalledExactlyOnceWith("mood");
  });
});

describe("runUiHostCall — a bad argument REFUSES, it does not answer empty", () => {
  test("a non-string storage key rejects (the header's headline: refusal ≠ a null answer)", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("storage.get", bridge, [123], null)).rejects.toThrow();
    expect(bridge.storage.get).not.toHaveBeenCalled();
  });

  test("an empty key rejects (min length 1)", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("storage.get", bridge, [""], null)).rejects.toThrow();
    expect(bridge.storage.get).not.toHaveBeenCalled();
  });

  test("an over-cap key rejects (max 512 — a pathological key never reaches the op)", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("storage.get", bridge, ["x".repeat(513)], null)).rejects.toThrow();
    expect(bridge.storage.get).not.toHaveBeenCalled();
  });

  test("a missing value on a key+value fn rejects", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("storage.set", bridge, ["k"], null)).rejects.toThrow();
    expect(bridge.storage.set).not.toHaveBeenCalled();
  });

  test("extra args to a no-arg fn reject (the tuple is closed)", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("chat.getVariables", bridge, ["unexpected"], CHAT)).rejects.toThrow();
    expect(bridge.chat.getVariables).not.toHaveBeenCalled();
  });

  test("chat.listMessages refuses a limit over the 50-message host ceiling", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("chat.listMessages", bridge, [{ limit: 51 }], CHAT)).rejects.toThrow();
    expect(bridge.chat.listMessages).not.toHaveBeenCalled();
  });
});

describe("runUiHostCall — chat scope is authority, not payload", () => {
  test("chat.listMessages with no admitted room REFUSES with a named scope error", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("chat.listMessages", bridge, [{ limit: 10 }], null)).rejects.toThrow(/needs a chat scope/u);
    expect(bridge.chat.listMessages).not.toHaveBeenCalled();
  });

  test("chat.getVariables with no admitted room REFUSES with a named scope error", async () => {
    const bridge = makeBridge();
    await expect(runUiHostCall("chat.getVariables", bridge, [], null)).rejects.toThrow(/needs a chat scope/u);
    expect(bridge.chat.getVariables).not.toHaveBeenCalled();
  });

  test("chat.listMessages forwards the ADMITTED chatId and the parsed limit (room from the verb, not the args)", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("chat.listMessages", bridge, [{ limit: 10 }], CHAT);
    expect(bridge.chat.listMessages).toHaveBeenCalledExactlyOnceWith(CHAT, 10);
    expect(value).toEqual(MESSAGES);
  });

  test("chat.listMessages forwards undefined limit when the optional arg is omitted", async () => {
    const bridge = makeBridge();
    await runUiHostCall("chat.listMessages", bridge, [], CHAT);
    expect(bridge.chat.listMessages).toHaveBeenCalledExactlyOnceWith(CHAT, undefined);
  });

  test("chat.getVariables forwards the admitted chatId", async () => {
    const bridge = makeBridge();
    const value = await runUiHostCall("chat.getVariables", bridge, [], CHAT);
    expect(bridge.chat.getVariables).toHaveBeenCalledExactlyOnceWith(CHAT);
    expect(value).toEqual({ mood: "calm" });
  });
});
