// The guest's WASM memory grows past its initial size mid-invocation, and host calls marshalled after that
// growth still carry and return the right bytes. Its own file so the module-wide memory starts at its initial size.

import type { PluginBridge } from "@orb/contracts/plugin";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { createLocalPluginHost } from "@orb/server/infra/plugin-host";
import { PLUGIN_WASM_MEMORY_INITIAL_BYTES } from "../../../../packages/server/src/infra/plugin-host/budgets.ts";
import { __readGuestMemoryBytesForTest } from "../../../../packages/server/src/infra/plugin-host/module.ts";
import { expect, test } from "../../../support/fixtures.ts";

const GROWTH_MEBIBYTES = 24;
const CARD = { nested: { list: [1, 2, 3], text: "after growth" }, flag: true };
const STORED = JSON.stringify(CARD);

function seams(): HostSeams {
  let id = 0;
  return { nowEpochMs: () => 1_700_000_000_000, nextRandom: () => 0.5, mintId: () => `heap-id-${id++}` };
}

function recordingBridge(store: Map<string, string>, cards: Map<string, Record<string, unknown>>): PluginBridge {
  return {
    chat: {
      listMessages: () => Promise.resolve([]),
      getVariables: () => Promise.resolve({}),
      listCharacters: () => Promise.resolve([]),
      applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
      requestTurn: () => Promise.resolve(),
    },
    worldInfo: { listBooks: () => Promise.resolve([]), listEntries: () => Promise.resolve([]), upsertEntry: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_heap" }) },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    assets: { read: () => Promise.resolve(null), storeFetched: () => Promise.resolve({ assetId: "asset_heap" }) },
    search: { documents: () => Promise.resolve([]) },
    storage: {
      get: (key): Promise<string | null> => Promise.resolve(store.get(key) ?? null),
      set: (key, value): Promise<void> => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([...store.keys()]),
      compareAndSet: () => Promise.resolve({ applied: true, current: "next" }),
    },
    notifications: { post: () => Promise.resolve() },
    llm: { quiet: () => Promise.resolve({ text: "quiet" }) },
    suggest: () => Promise.resolve(),
    admitEgress: () => undefined,
    admitAssetEgress: () => undefined,
    surfaceQuickReply: () => Promise.resolve(),
    ui: { setState: () => Promise.resolve(), toast: () => Promise.resolve(), openDialog: () => Promise.resolve() },
    databank: { ingest: () => Promise.resolve({ documentId: "document_heap" }) },
    character: {
      ingest: () => Promise.resolve({ characterId: "character_heap", created: true }),
      ingestAsset: () => Promise.resolve({ characterId: "character_heap", created: true }),
      setCardData: (characterId, data): Promise<void> => {
        cards.set(characterId, data);
        return Promise.resolve();
      },
      getCardData: (characterId): Promise<Record<string, unknown> | null> => Promise.resolve(cards.get(characterId) ?? null),
    },
    pubsub: { emit: () => Promise.resolve() },
  };
}

test("host calls marshalled after the guest heap grows past its initial WASM memory carry the right bytes", { timeout: 30_000 }, async () => {
  const store = new Map<string, string>();
  const cards = new Map<string, Record<string, unknown>>();
  const host = createLocalPluginHost(seams());
  // The handler grows the heap first, so the context's cached FFI views predate the growth, then round-trips an
  // object argument (the property-name walk) and string arguments and results through the membrane.
  const outcome = await host.createInstance({
    mainJs: `
      const h = orb.host(1);
      h.tools.register({
        name: "grow",
        description: "grow the heap, then marshal host calls",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          const held = [];
          for (let i = 0; i < ${GROWTH_MEBIBYTES}; i += 1) { const block = new Uint8Array(1048576); block.fill(i); held.push(block); }
          globalThis.__held = held;
          await h.character.setCardData("character_card", ${STORED});
          const card = await h.character.getCardData("character_card");
          await h.storage.set("key", JSON.stringify(card));
          const read = await h.storage.get("key");
          return JSON.stringify({ card, read });
        },
      });`,
    grants: ["tools.register", "storage.kv", "character.card_state"],
    bridge: recordingBridge(store, cards),
    chat: null,
  });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  const handler = outcome.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: tool did not register");
  }
  expect(__readGuestMemoryBytesForTest()).toBe(PLUGIN_WASM_MEMORY_INITIAL_BYTES);

  const result = await host.invoke(outcome.instance, handler, "{}", null);

  expect(__readGuestMemoryBytesForTest()).toBeGreaterThan(PLUGIN_WASM_MEMORY_INITIAL_BYTES);
  expect(cards.get("character_card")).toEqual(CARD);
  expect(JSON.parse(result)).toEqual({ card: CARD, read: STORED });
  host.dispose(outcome.instance);
});
