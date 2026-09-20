// entry/compose/search-discovery — the derived-data cluster seam. Its wiring decisions are invisible at
// every other tier, and three of them are the kind that fail SILENTLY:
//
//   1. THE BUS ROUTING TABLE. The indexer subscriber is a closed `switch` over `DomainEvent` with an
//      `assertNeverEvent` default. `persona.updated` / `world-info.updated` are listed EXPLICITLY as
//      no-ops rather than swept up by a fallthrough — that is what keeps the default a real belt on the
//      NEXT event member. A fallthrough would make a new event type silently un-indexed forever; a
//      mis-routed case would embed the wrong source. Both arms are driven here through the captured
//      subscriber.
//   2. THE corpusAutoindex KNOB IS ONE-SIDED. OFF must leave the indexer BUILT-but-not-subscribed, while
//      the entity→room freshness fan stays subscribed regardless (open-room freshness is orthogonal to the
//      search knob — the shipped character-fan ruling). "OFF" accidentally unsubscribing the room fan would
//      stop every open room repainting on an entity edit, with no error anywhere.
//   3. THE EMBED-MODEL-CHANGE REINDEX IS A TRUSTED SYSTEM TRIGGER. `caller: null` bypasses the workloads
//      mode gate and `mode:"bulk"` spans every owner — so it must stay exactly three enqueues, both bulk,
//      both owner-less. A `caller`/`ownerId` that drifted here would either scope the sweep to one account
//      (leaving every other owner's vectors in the OLD embed space) or run a per-user job as nobody.
//
// The workload enqueues are observed with `vi.spyOn` on the RETURNED `workloads` service — the spy firing
// at all is the receipt that the object this seam exposes and the one `enqueueEmbedReindex` closed over are
// the same instance (a fork would leave the spy silent).

import type { DomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import { describe, vi } from "vitest";
import type { DomainEventBus } from "../../../../packages/server/src/entry/compose/event-bus.ts";
import type { SearchDiscoveryComposeDeps } from "../../../../packages/server/src/entry/compose/search-discovery.ts";
import { buildSearchDiscovery } from "../../../../packages/server/src/entry/compose/search-discovery.ts";
import { expect, test } from "../../../support/fixtures.ts";

// @orb-waive no-test-fabrication(unknown): never dereferenced — every op this pin drives is stubbed or spied before it can reach db. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

type Handler = (event: DomainEvent) => void | Promise<void>;

/** A bus that only RECORDS its subscribers — the seam's subscription decisions are the thing under test. */
function capturingBus(): { readonly bus: DomainEventBus; readonly handlers: Handler[] } {
  const handlers: Handler[] = [];
  const bus: DomainEventBus = {
    emit: vi.fn(),
    subscribe: (handler: Handler): (() => void) => {
      handlers.push(handler);
      return (): void => undefined;
    },
  };
  return { bus, handlers };
}

function build(corpusAutoindex: boolean, bus: DomainEventBus): ReturnType<typeof buildSearchDiscovery> {
  // @orb-waive no-test-fabrication(unknown): structural stand-ins for the cluster's sibling front doors — the seam stores them. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    audit: vi.fn(() => Promise.resolve(undefined)),
    roleClients: { summarize: vi.fn(), summarizerModel: "sum-v1", summarizerContextTokens: 8192 },
    eventBus: bus,
    attachCardTagByName: vi.fn(),
    resolveUserPresetParams: vi.fn(() => Promise.resolve({})),
    character: { listEmbeddableCharacterIds: vi.fn(), loadCardText: vi.fn() },
    assets: { listImageAssetIds: vi.fn(), loadAssetBytes: vi.fn(), assetCasRefById: vi.fn() },
    settings: { loadUserSettings: vi.fn(), updateUserSettingsSection: vi.fn() },
    getEffectiveConfig: () => ({}),
    emitChatEvent: vi.fn(() => Promise.resolve(undefined)),
    emitChatEventLive: vi.fn(),
    corpusAutoindex,
    resolveChatCapability: vi.fn(),
    getContributions: vi.fn(() => ({})),
  } as unknown as SearchDiscoveryComposeDeps;
  return buildSearchDiscovery(deps);
}

describe("buildSearchDiscovery — the corpusAutoindex knob is ONE-SIDED", () => {
  test("ON subscribes BOTH the indexer route and the entity→room freshness fan", () => {
    const { bus, handlers } = capturingBus();
    build(true, bus);

    expect(handlers).toHaveLength(2);
  });

  test("OFF leaves the indexer BUILT but unsubscribed — the room fan stays on regardless", () => {
    const { bus, handlers } = capturingBus();
    const built = build(false, bus);

    // Exactly one subscriber remains, and it is NOT the indexer route (proved by the routing pins below,
    // which only pass when the FIRST handler is the indexer's — here there is only the fan).
    expect(handlers).toHaveLength(1);
    // …and the indexer itself is still constructed, ready for the bulk sweep that calls it directly.
    expect(typeof built.indexer.onCharacterUpdated).toBe("function");
    expect(typeof built.indexer.onAssetCreated).toBe("function");
  });
});

describe("buildSearchDiscovery — the indexer's bus routing table (a closed switch, no fallthrough)", () => {
  function indexerRoute(): { readonly route: Handler; readonly built: ReturnType<typeof buildSearchDiscovery> } {
    const { bus, handlers } = capturingBus();
    const built = build(true, bus);
    const route = handlers[0];
    if (route === undefined) {
      throw new Error("indexer route not subscribed");
    }
    return { route, built };
  }

  test("character.updated routes to the CHARACTER indexer arm and nothing else", async () => {
    const { route, built } = indexerRoute();
    const onCharacter = vi.spyOn(built.indexer, "onCharacterUpdated").mockResolvedValue(undefined);
    const onAsset = vi.spyOn(built.indexer, "onAssetCreated").mockResolvedValue(undefined);

    // @orb-waive no-test-fabrication(DomainEvent): a deliberate minimal event value for a routing assertion — the payload is the domain's. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    await route({ type: "character.updated" } as DomainEvent);

    expect(onCharacter).toHaveBeenCalledTimes(1);
    expect(onAsset).not.toHaveBeenCalled();
  });

  test("asset.created routes to the ASSET indexer arm and nothing else", async () => {
    const { route, built } = indexerRoute();
    const onCharacter = vi.spyOn(built.indexer, "onCharacterUpdated").mockResolvedValue(undefined);
    const onAsset = vi.spyOn(built.indexer, "onAssetCreated").mockResolvedValue(undefined);

    // @orb-waive no-test-fabrication(DomainEvent): a deliberate minimal event value for a routing assertion — the payload is the domain's. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    await route({ type: "asset.created" } as DomainEvent);

    expect(onAsset).toHaveBeenCalledTimes(1);
    expect(onCharacter).not.toHaveBeenCalled();
  });

  test("the two entity→room members are EXPLICIT no-ops — personas and lorebooks are not embedded sources", async () => {
    const { route, built } = indexerRoute();
    const onCharacter = vi.spyOn(built.indexer, "onCharacterUpdated").mockResolvedValue(undefined);
    const onAsset = vi.spyOn(built.indexer, "onAssetCreated").mockResolvedValue(undefined);

    // @orb-waive no-test-fabrication(DomainEvent): deliberate minimal event values for a routing assertion — the payloads are the domain's. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    await route({ type: "persona.updated" } as DomainEvent);
    // @orb-waive no-test-fabrication(DomainEvent): same. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    await route({ type: "world-info.updated" } as DomainEvent);

    expect(onCharacter).not.toHaveBeenCalled();
    expect(onAsset).not.toHaveBeenCalled();
  });

  test("an UNKNOWN event member REFUSES loudly (the assertNever belt is reachable, not decorative)", () => {
    const { route } = indexerRoute();

    // @orb-waive no-test-fabrication(unknown): an off-union value is the whole point — this drives the `assertNeverEvent` default. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    expect(() => route({ type: "brand.new.event" } as unknown as DomainEvent)).toThrow(/unhandled domain event/u);
  });
});

describe("buildSearchDiscovery — the embed-model-change reindex is a BOX-WIDE, owner-less system trigger", () => {
  test("enqueues all three BULK embed-space sweeps", async () => {
    const built = build(true, capturingBus().bus);
    // @orb-waive no-test-fabrication(Awaited<ReturnType<typeof built.workloads.start>>): the enqueue RESULT is never read by this seam — only the arguments are asserted. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const started = { id: "wl_1" } as Awaited<ReturnType<typeof built.workloads.start>>;
    const start = vi.spyOn(built.workloads, "start").mockResolvedValue(started);

    built.enqueueEmbedReindex();
    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledTimes(3);
    });

    const calls = start.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.input.kind).sort()).toStrictEqual(["databank-reindex", "index", "memory-backfill"]);
    for (const call of calls) {
      // `caller: null` is the trusted-system bypass of the mode gate, and bulk/ownerId:null is what makes
      // the sweep span every owner — a per-owner scope here strands everyone else in the OLD embed space.
      expect(call.caller).toBeNull();
      expect(call.mode).toBe("bulk");
      expect(call.ownerId).toBeNull();
    }
    // The index sweep must be the FORCED all-sources pass; a non-forced one no-ops on hash-matched rows.
    expect(calls.find((c) => c.input.kind === "index")?.input.params).toStrictEqual({ source: "all", force: true });
  });

  test("an enqueue REJECTION never escapes (the settings write that triggered it must not fail)", async () => {
    const built = build(true, capturingBus().bus);
    const start = vi.spyOn(built.workloads, "start").mockRejectedValue(new Error("already active"));

    expect(() => {
      built.enqueueEmbedReindex();
    }).not.toThrow();
    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledTimes(3);
    });
  });
});

describe("buildSearchDiscovery — the cluster product is complete", () => {
  test("returns every member the keystone binds, including the two forward-refs it hands back", () => {
    const built = build(true, capturingBus().bus);

    expect(Object.keys(built).sort()).toStrictEqual(
      [
        "embeddings",
        "indexer",
        "persona",
        "resolvePersonasForParticipants",
        "presetCtx",
        "preset",
        "stats",
        "search",
        "discovery",
        "notifications",
        "workloads",
        "enqueueEmbedReindex",
        "listCorpusOwners",
      ].sort(),
    );
  });
});
