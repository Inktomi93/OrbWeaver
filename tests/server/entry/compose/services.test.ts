// entry/compose/services — the composition-root keystone. Integration-lite: build the whole graph over a
// fresh in-memory db + a frozen clock + a vLLM-disabled provider registry, and assert it constructs without
// throwing and yields every transport `Services` key plus the boot handles. This proves the injection graph
// wires (the 21 services + the boot-global RoleClients bundle resolve offline against the vLLM floor).

import { tmpdir } from "node:os";
import { automationActionSchema } from "@orb/contracts/automation";
import type { DomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import { characterEmbeddings, characterTags, chatParticipants, chats, tags, workloads } from "@orb/db";
import type { CharacterHandle, ChatParticipantId, Handle, SessionId, SocketId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import type { CharacterService } from "@orb/server/domain/character";
import { CARD_PACK_VERSION, createCharacterService, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { createEmbeddingsIndexer } from "@orb/server/domain/embeddings";
import { createDomainEventBus, createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { DEFAULT_EMBED_MODEL } from "@orb/server/infra/providers";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import type { SocketListener } from "@orb/server/transport/trpc";
import { eq } from "drizzle-orm";
import type { Mock } from "vitest";
import { describe, onTestFinished, vi } from "vitest";
import { writeAppOverride } from "../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { subscribeChatEvents } from "../../../../packages/server/src/transport/trpc/chat-events-bus.ts";
import { subscribeNotifications } from "../../../../packages/server/src/transport/trpc/notifications-bus.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeHarness as makeAssetsHarness, pngBytes, principal, seedUser } from "../../domain/assets/_support.ts";
import { makeHarness as makeCharHarness } from "../../domain/character/_support.ts";
import { EMBED_DIM, makeRoleClients } from "../../domain/embeddings/_support.ts";

const SERVICE_KEYS = [
  "admin",
  "assets",
  "automation",
  "character",
  "chat",
  "connection",
  "credentials",
  "databank",
  "discovery",
  "imagery",
  "notifications",
  "persona",
  "plugin",
  "preset",
  "refinery",
  // The regex library service (D121-E) — this list was the one coupled site the regex lane missed
  // (the SERVICE_KEYS-phantom class; fixed at `d8a67e94`).
  "regex",
  "rpg",
  "search",
  "sessions",
  "settings",
  "stats",
  "tag",
  "workloads",
  "worldInfo",
] as const;

test("createServices builds the full graph: every Services key + the boot handles", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  for (const key of SERVICE_KEYS) {
    expect(result.services[key], `services.${key}`).toBeDefined();
  }
  expect(Object.keys(result.services)).toHaveLength(SERVICE_KEYS.length);

  // Boot handles the lifecycle/seam consume.
  expect(result.sessions).toBeDefined();
  expect(result.embeddings).toBeDefined();
  expect(result.indexer).toBeDefined();
  expect(result.assets).toBeDefined();
  expect(result.exportService).toBeDefined();
  expect(result.eventBus).toBeDefined();
  expect(result.workloadContributions).toBeDefined();
  expect(result.roleClients).toBeDefined();
  expect(result.bindRoleClients).toBeInstanceOf(Function);
  expect(result.effectiveConfig).toBeDefined();
  expect(result.secretBox).toBeDefined();
  // vLLM disabled → no engine handle for the lifecycle to supervise.
  expect(result.vllmEngine).toBeNull();
});

// W7a — THE ADMIN REVOKE → SOCKET EVICTION WIRE (staleness-and-session-freshness.md §4.4.3). The registry
// suite proves `evictUser` stops a generator; this proves the admin verb is CONNECTED to it, which is the
// half a unit test of either side cannot see. PER USER by owner ruling F4 ("admin REVOKE stays per-user"):
// a revoke is a statement about the account, the human's still-valid devices reconnect and resume, and it is
// the only arm that also reaches sockets admitted with no session row at all.
test("W7a an admin revoke-all evicts that user's live sockets through the compose seam", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const ownerId = castId<UserId>("u_owner");
  const result = await createServices({
    db,
    now: clock.now,
    ownerId,
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  const victim = castId<UserId>("u_victim");
  const bystander = castId<UserId>("u_bystander");
  const stopped: string[] = [];
  const listener = (who: string): SocketListener => ({
    onAttach: () => undefined,
    onAnnounce: () => undefined,
    onDetach: () => undefined,
    onEvicted: (): void => {
      stopped.push(who);
    },
  });
  const victimCell = result.sockets.adopt(victim, castId<SocketId>("socket_victim"), castId<SessionId>("sess_victim"));
  result.sockets.goLive(victimCell, listener("victim"));
  const bystanderCell = result.sockets.adopt(bystander, castId<SocketId>("socket_bystander"), castId<SessionId>("sess_bystander"));
  result.sockets.goLive(bystanderCell, listener("bystander"));

  await result.services.admin.revokeUserSessions({
    principal: { userId: ownerId, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "cookie" },
    userId: victim,
  });

  expect(stopped).toEqual(["victim"]);
});

test("the boot-global RoleClients bundle resolves the derive roles to the vLLM floor model", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  // vLLM AVAILABLE (vllmDisabled:false) so the derive-role fallback does NOT fire — empty settings →
  // roleDefaults default to the local vLLM source, so embed resolves to the env embed model. (No engine
  // call: binding only RESOLVES each role's model.)
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: false,
  });

  expect(result.roleClients.embedModel).toBe(env.VLLM_EMBED_MODEL);
  expect(result.roleClients.summarizerModel).toBe(env.VLLM_GEN_MODEL);
});

test("with vLLM unavailable (no GPU) the boot-global derive bundle falls back to local-light", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  // vllmDisabled:true ⇒ vllmAvailable=false ⇒ the derive roles (embed) reroute to local-light (empty model,
  // self-defaulting to jina); summarize (generation) stays on the vLLM floor model — never local-light.
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  expect(result.roleClients.embedModel).toBe(""); // local-light self-default (jina-clip-v2, 1024-dim)
  expect(result.roleClients.summarizerModel).toBe(env.VLLM_GEN_MODEL);
});

// SELECTOR HOT-RELOAD (owner dogfood 2026-08-13). HONEST LABEL: this is a FENCE, not the defect proof — it
// passes against the pre-fix source, because the hop it covers was never the broken one. The DEFECT proof is
// `role-clients.test.ts`'s re-point suite (6 reds against HEAD), which pins that the `RoleClients` binder
// re-resolves PER CALL instead of baking four boot-time closures.
// What this fence is worth: the binder's proof runs on a double, and the chain settings-write → resolveRole →
// wire is only closed if the hop UNDER the binder is genuinely live. That hop is a "is the settings read
// cached?" question no double can answer — so it is asserted here, against the REAL settings service, the REAL
// `loadUserSettings`, and the REAL resolver over a real row, in one process with no restart. If someone ever
// puts a cache in front of `loadUserSettings`, this reds and the owner's symptom comes back without it.
test("a REAL settings re-point changes what the REAL resolveRole answers — same process, no restart", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const ownerId = await seedUser(db, { role: "owner" });
  const result = await createServices({
    db,
    now: clock.now,
    ownerId,
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: false,
  });
  const owner = principal(ownerId, "owner");

  // Boot: empty settings ⇒ the embed role sits on the local vLLM engine's configured model.
  expect(result.roleClients.embedModel).toBe(env.VLLM_EMBED_MODEL);

  // The owner moves the embed role in Settings › Connections. `local-light` is the one alternative that needs
  // no stored credential, so this stays hermetic — the point is the SELECTION changing, not which target.
  await result.services.settings.updateUserSettingsSection({
    principal: owner,
    input: { section: "routing", patch: { roleDefaults: { embed: { source: "local-light" } } } },
  });

  const after = await result.services.connection.resolveRole({ role: "embed", principal: owner });
  expect(after.credential.source).toBe("local-light");
  // The config-derived heal resolves local-light's own configured model, not the stale vLLM pin.
  expect(after.model).toBe(DEFAULT_EMBED_MODEL);
});

test("the backend registry sources the resolved vLLM concurrency from AppSettings (PD-14)", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  // An admin AppSettings override the boot reload resolves into the effective-config the registry reads.
  // embed:2 is distinct from the backend's DEFAULT_EMBED_CONCURRENCY (4): observing exactly 2 in-flight embed
  // requests proves the RESOLVED override (not the deps default) reached the constructed vLLM backend.
  await writeAppOverride(db, { vllmConcurrency: { embed: 2, summarize: 3 }, schemaVersion: 2 }, clock.now());

  // A recording fake engine client: track the peak simultaneous in-flight embed requests. The setTimeout(0)
  // yield lets every started worker increment before any resolves, so the peak == the worker count, which the
  // embed surface caps at min(concurrency, chunks). With chunkSize 1 + 6 inputs the cap is the concurrency.
  let active = 0;
  let peak = 0;
  const vllmClient: VllmEngineClient = {
    enginePost: async <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      const { input } = body as { input: string[] };
      return {
        data: input.map((_text, i) => ({ index: i, embedding: [1, 2, 3, 4] })),
        model: "fake",
      } as T;
    },
    engineStream: () => Promise.reject(new Error("embed must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };

  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    // vLLM enabled (so the backend is registered) with a fake loopback client + a unit chunk size.
    vllmDisabled: false,
    providerSeams: { vllmClient, vllmChunkSize: 1, vllmEmbedDim: 4 },
  });

  // embed routes to the vLLM floor (empty user settings); 6 inputs @ chunkSize 1 → 6 chunks. The peak
  // in-flight is min(resolved embed concurrency = 2, 6) === 2 — the override, NOT the default 4.
  await result.roleClients.embed(["a", "b", "c", "d", "e", "f"]);
  expect(peak).toBe(2);
});

test("character.bulkAddCardTag attaches via the real tag wiring (PD-49) — not the inert throw", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const created = await result.services.character.create({
    principal: principal(owner),
    input: { handle: castId<CharacterHandle>("hero-card"), name: "Hero", description: "a card" },
  });

  // The injected attachCardTag port now reaches tag.attachCardTagByName (the inert throw is gone): a by-name
  // add resolve-or-creates the owner's tag and writes the accepted junction row, end-to-end through compose.
  await result.services.character.bulkAddCardTag({
    principal: principal(owner),
    tagName: "  favorites  ",
    characterIds: [created.id],
  });

  const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
  expect(tagRows.map((t) => t.name)).toEqual(["favorites"]); // trimmed, resolve-or-created via tag
  const junction = await db.select().from(characterTags).where(eq(characterTags.characterId, created.id));
  expect(junction).toHaveLength(1);
  expect(junction[0]?.tagId).toBe(tagRows[0]?.id);
  expect(junction[0]?.status).toBe("accepted");
});

// ── The default-card seeder (PD-32) wired over the REAL settings latch ───────────────────────────────────
// The compose root constructs the ONE seeder instance and wires its isSeeded/markSeeded ops to the real
// settings service. These prove that wiring end-to-end: the owner is seeded through the real character.create
// path, the persisted latch lands, and the welcome-assistant stamp respects an explicit pick.

function buildGraph(db: Db): ReturnType<typeof createServices> {
  return createServices({
    db,
    now: createFrozenClock().now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });
}

describe("default-card seeder wiring (PD-32)", () => {
  test("ensureSeeded seeds the owner's pack + lands the latch + stamps the welcome assistant", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    expect(result.characterSeeder).toBeDefined();
    await result.characterSeeder.ensureSeeded(actor);

    // The whole authored pack through the real create path.
    const list = await result.services.character.list({ principal: actor });
    expect(list.items).toHaveLength(DEFAULT_CHARACTER_CARDS.length);

    // The persisted latch is set + the welcome-assistant id points at the seeded Assistant.
    const settings = await result.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.onboarding.defaultCharactersSeeded).toBe(true);
    const assistant = await result.services.character.findByHandle({
      ownerId: owner,
      handle: WELCOME_ASSISTANT_HANDLE,
    });
    expect(settings.config.seeds.welcomeAssistantCharacterId).toBe(assistant?.characterId);
    // The pack stamp lands through the REAL settings write — the door every future pack bump migrates through.
    expect(settings.config.onboarding.defaultCharactersPackVersion).toBe(CARD_PACK_VERSION);
  });

  test("the pack stamp round-trips: a library rolled back to v0 is re-migrated, not re-seeded", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const first = await buildGraph(db);
    await first.characterSeeder.ensureSeeded(actor);

    // Roll the STAMP back (the latch stays set) — the pre-v2-install shape, written through the real seam.
    await first.services.settings.updateUserSettingsSection({
      principal: actor,
      input: { section: "onboarding", patch: { defaultCharactersPackVersion: 0 } },
    });

    // A cold graph (fresh in-process memo) must read that stamp back and run the migration, not the seed.
    const second = await buildGraph(db);
    await second.characterSeeder.ensureSeeded(actor);

    const list = await second.services.character.list({ principal: actor });
    expect(list.items).toHaveLength(DEFAULT_CHARACTER_CARDS.length); // no duplicate pack
    const settings = await second.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.onboarding.defaultCharactersPackVersion).toBe(CARD_PACK_VERSION);
  });

  test("markSeeded never clobbers an explicit welcome-assistant pick", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    // The user already chose a welcome assistant before the first-run seed fires.
    await result.services.settings.updateUserSettingsSection({
      principal: actor,
      input: { section: "seeds", patch: { welcomeAssistantCharacterId: "chr_my_pick" } },
    });

    await result.characterSeeder.ensureSeeded(actor);

    const settings = await result.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.onboarding.defaultCharactersSeeded).toBe(true); // latch still set
    expect(settings.config.seeds.welcomeAssistantCharacterId).toBe("chr_my_pick"); // not clobbered
  });
});

// ── The embeddings indexer SUBSCRIPTION (PD-48) ──────────────────────────────────────────────────────────
// The composition root subscribes the indexer to the in-process domain-event bus and wires its UN-PRINCIPAL
// canon re-readers (character.loadCardText / assets.loadAssetBytes) into the indexer context. These tests
// reproduce that exact wiring over a fresh db with a STUB embeddings store (the inference edge is the seam we
// cut), then assert an emitted event drives the indexer THROUGH the real loaders to a store call. The emit is
// fire-and-forget + error-isolated (event-bus.ts), so we drain the IO queue deterministically (bounded
// setImmediate flushes — no wall-clock) before asserting.

function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

interface IndexerWiring {
  readonly character: CharacterService;
  readonly assets: AssetsService;
  readonly store: Mock<EmbeddingsService["store"]>;
  readonly cleanup: () => Promise<void>;
  readonly emit: (event: DomainEvent) => void;
}

/** Reproduce the composition root's indexer wiring: real character/assets services (their UN-PRINCIPAL canon
 *  re-readers feed the indexer), a STUB store recording calls, subscribed to a real bus via the same
 *  dispatcher entry/compose/services.ts uses. */
async function wireIndexer(db: Db): Promise<IndexerWiring> {
  const bus = createDomainEventBus();
  const character = createCharacterService(makeCharHarness(db).ctx);
  const assetsH = await makeAssetsHarness(db);
  const assets = createAssetsService(assetsH.ctx);
  const store: Mock<EmbeddingsService["store"]> = vi.fn<EmbeddingsService["store"]>(() => Promise.resolve({ outcome: "written", contentHash: "stub-hash" }));
  const indexer = createEmbeddingsIndexer({
    store,
    loadCardText: async (characterId): Promise<string | undefined> => (await character.loadCardText(characterId)) ?? undefined,
    loadAssetMime: async (assetId): Promise<string | null> => (await assets.assetCasRefById(assetId))?.mime ?? null,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    roleClients: makeRoleClients(),
    embedDim: EMBED_DIM,
    imageEmbedDim: EMBED_DIM,
  });
  bus.subscribe((event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case "character.updated":
        return indexer.onCharacterUpdated(event);
      case "asset.created":
        return indexer.onAssetCreated(event);
      // The chat-crew + rpg domain-event mirrors touch no embeddable canon — the indexer ignores them.
      // Same for the entity→room bridge's two members: personas and lorebooks are not embedded sources, so
      // they are explicit no-ops here (mirroring the production subscriber at compose/search-discovery.ts).
      case "persona.updated":
      case "world-info.updated":
        return Promise.resolve();

      default:
        return assertNeverEvent(event);
    }
  });
  return { character, assets, store, cleanup: assetsH.cleanup, emit: bus.emit };
}

// Max event-loop turns the drain waits before giving up — generous so a real CAS disk read (the asset path:
// loadAssetBytes → imageEmbed → caption → store) completes even under heavy parallel-suite contention, while
// the `done` predicate still short-circuits the instant the work lands (well-behaved cases stay sub-ms).
const DRAIN_MAX_TURNS = 2000;

/** Drain the fire-and-forget bus dispatch deterministically: flush the IO queue until `done` (bounded — no
 *  wall-clock; each turn is one `setImmediate` macrotask). */
async function drain(done: () => boolean): Promise<void> {
  for (let i = 0; i < DRAIN_MAX_TURNS && !done(); i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a deterministic bounded drain of fire-and-forget dispatch.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("embeddings indexer bus subscription (PD-48)", () => {
  test("character.updated drives the indexer to store the card-text projection", async () => {
    const db = await freshDb();
    const w = await wireIndexer(db);
    onTestFinished(w.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await w.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    const expected = await w.character.loadCardText(created.id);

    w.emit({ type: "character.updated", characterId: created.id, contentChanged: true });
    await drain(() => w.store.mock.calls.length > 0);

    expect(w.store).toHaveBeenCalledTimes(1);
    const params = w.store.mock.calls[0]?.[0];
    expect(params?.kind).toBe("card");
    // Narrow the now-5-arm StoreParams union to the card-text arm (segment/digest carry `text`, not `content`).
    if (params?.lens !== "card-text") {
      throw new Error("expected a card-text store call");
    }
    expect(params.content).toBe(expected);
  });

  test("a flag-only character.updated (contentChanged=false) drives ZERO store work", async () => {
    const db = await freshDb();
    const w = await wireIndexer(db);
    onTestFinished(w.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await w.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("star"), name: "Star", description: "a starred card" },
    });

    // A star toggle: same card content, contentChanged=false → the indexer skips before touching the store,
    // so the embed backend (and its model-load crash window) is never reached on an identity-flag edit.
    w.emit({ type: "character.updated", characterId: created.id, contentChanged: false });
    await drain(() => w.store.mock.calls.length > 0);

    expect(w.store).not.toHaveBeenCalled();
  });

  test("asset.created drives the indexer to store both image lenses from the real CAS bytes", async () => {
    const db = await freshDb();
    const w = await wireIndexer(db);
    onTestFinished(w.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(7, 7, 7, 7);
    const stored = await w.assets.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: "image/png",
    });

    w.emit({ type: "asset.created", assetId: stored.assetId });
    await drain(() => w.store.mock.calls.length >= 2);

    expect(w.store).toHaveBeenCalledTimes(2);
    const lenses = w.store.mock.calls.map((c) => c[0]?.lens);
    expect(lenses).toEqual(["image-raw", "image-captioned"]);
    for (const call of w.store.mock.calls) {
      const params = call[0];
      // Both image arms carry `content` (the bytes); narrow off the union before reading it.
      const content = params?.lens === "image-raw" || params?.lens === "image-captioned" ? params.content : undefined;
      // CAS returns the bytes as a Buffer (a Uint8Array subclass) — compare by value, not subtype.
      expect(content instanceof Uint8Array && Array.from(content)).toEqual(Array.from(bytes));
    }
  });
});

// ── The corpusAutoindex indexer GATE (Piece D) ───────────────────────────────────────────────────────────
// The composition root subscribes the indexer to the bus ONLY when the effective-config `corpusAutoindex` is
// true. These build the FULL graph vLLM-ENABLED with a deterministic fake engine client (so the embed path is
// offline + cheap — vllmAvailable=true ⇒ NO local-light load), create a character (whose `character.updated`
// emit rides the same bus), drain the fire-and-forget dispatch, and assert a card-text embedding row is
// persisted (ON) / never written (OFF). The tests/e2e default is OFF (vitest env CORPUS_AUTOINDEX=false); the
// ON case flips it via a stored AppSettings override the boot reload resolves.

/** A deterministic, offline fake vLLM engine client: every /v1/embeddings returns one full-dim vector per
 *  input so the embed → store chain completes without a GPU or a network. */
function fakeEmbedClient(): VllmEngineClient {
  return {
    enginePost: <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      const { input } = body as { input: string[] };
      return Promise.resolve({
        data: input.map((_text, i) => ({
          index: i,
          embedding: Array.from({ length: env.VLLM_EMBED_DIM }, () => 0.01),
        })),
        model: "fake-embed",
      } as T);
    },
    engineStream: () => Promise.reject(new Error("embed must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
}

function buildGatedGraph(db: Db): ReturnType<typeof createServices> {
  return createServices({
    db,
    now: createFrozenClock().now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    // vLLM ENABLED with the fake client → embed routes to vLLM (vllmAvailable=true), not local-light.
    vllmDisabled: false,
    providerSeams: { vllmClient: fakeEmbedClient() },
  });
}

describe("notifications fan-out (PD-23) — record (durable) → publishNotification (live)", () => {
  test("a chat producer emit is durable-first AND lands on the recipient's live bus", async () => {
    const db = await freshDb();
    const clock = createFrozenClock();
    const result = await createServices({
      db,
      now: clock.now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
      vllmDisabled: true,
    });
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    // A REAL TypeID — the notification event schema validates the branded id shape at the record seam.
    const chatId = mintTypeId(ID_PREFIX.chat);
    await db.insert(chats).values({ id: chatId, createdAt: clock.now(), updatedAt: clock.now() });
    await db.insert(chatParticipants).values([
      {
        id: castId<ChatParticipantId>("chat_participant_h"),
        chatId,
        kind: "human",
        userId: host,
        role: "host",
        joinSeq: 0,
        joinedAt: clock.now(),
      },
      {
        id: castId<ChatParticipantId>("chat_participant_m"),
        chatId,
        kind: "human",
        userId: member,
        role: "member",
        joinSeq: 0,
        joinedAt: clock.now(),
      },
    ]);

    // Tail the recipient's live channel BEFORE the producer emits (`on()` buffers from call time).
    const ac = new AbortController();
    const iter = subscribeNotifications(member, ac.signal)[Symbol.asyncIterator]();
    const nextLive = iter.next();
    try {
      await result.services.chat.kick({ principal: principal(host), chatId, userId: member });

      // LIVE half: the PERSISTED InboxView (with its seq) arrives on the per-user bus…
      const live = await nextLive;
      expect(live.done).toBe(false);
      expect(live.value?.payload).toMatchObject({
        type: "kicked",
        recipientUserId: member,
        chatId,
      });
      expect(live.value?.seq).toBeGreaterThan(0);
      // …DURABLE half: the same event is on the recipient's inbox (deliverable without the bus).
      const inbox = await result.services.notifications.list({ principal: principal(member) });
      expect(inbox.items.map((i) => i.type)).toContain("kicked");
      expect(inbox.items.find((i) => i.type === "kicked")?.seq).toBe(live.value?.seq);
    } finally {
      // Pre-arm the terminal next() so the abort's AbortError rejection is HANDLED (no unhandled noise).
      const closed = iter.next().catch(() => undefined);
      ac.abort();
      await closed;
    }
  });
});

describe("persona.setActivePersona → chat bus (PD-120)", () => {
  test("flips activePersonaId, persists to chat_events, and fans personaSwitched onto the live channel", async () => {
    const db = await freshDb();
    const clock = createFrozenClock();
    const result = await createServices({
      db,
      now: clock.now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
      vllmDisabled: true,
    });
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const chatId = mintTypeId(ID_PREFIX.chat);
    await db.insert(chats).values({ id: chatId, createdAt: clock.now(), updatedAt: clock.now() });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_h"),
      chatId,
      kind: "human",
      userId: host,
      role: "host",
      joinSeq: 0,
      joinedAt: clock.now(),
    });
    const persona = await result.services.persona.create({
      principal: principal(host),
      input: { name: "Nate", description: "the user" },
    });

    // Tail the room's LIVE channel BEFORE persona flips it (subscribeChatEvents buffers from call time —
    // the same `on()` precedent the notifications test above uses).
    const ac = new AbortController();
    const iter = subscribeChatEvents(chatId, ac.signal)[Symbol.asyncIterator]();
    const nextLive = iter.next();
    try {
      await result.services.persona.setActivePersona({
        principal: principal(host),
        chatId,
        targetUserId: host,
        personaId: persona.id,
      });

      // LIVE half: personaSwitched arrives with a durable seq (persona composes BEFORE chat.ts's own bus
      // instance, so this proves the second createChatBus still writes the SAME chat_events log + the ONE
      // transport publishChatEvent singleton still fans it out — see services.ts's PD-120 comment).
      const live = await nextLive;
      expect(live.done).toBe(false);
      expect(live.value?.event).toEqual({
        type: "personaSwitched",
        chatId,
        from: null,
        to: persona.id,
      });
      expect(live.value?.seq).toBeGreaterThan(0);

      // DURABLE half: the row write committed (the participant's activePersonaId actually flipped).
      const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
      expect(row?.activePersonaId).toBe(persona.id);
    } finally {
      const closed = iter.next().catch(() => undefined);
      ac.abort();
      await closed;
    }
  });
});

// ── persona.remove re-points the seed pointers (owner invariant: never NO current persona while you own one) ─
// The compose root wires persona's `repointSeedsAfterPersonaDelete` op to the REAL settings section-patch.
// These prove that end-to-end: deleting the CURRENT persona re-points to the default (else the newest
// remaining), and deleting the DEFAULT re-points it to the newest remaining. A survivor always resolves.
describe("persona.remove seed re-point (owner invariant)", () => {
  function graph(db: Db): ReturnType<typeof createServices> {
    return createServices({
      db,
      now: createFrozenClock().now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
      vllmDisabled: true,
    });
  }

  test("deleting the CURRENT persona re-points current → the default persona", async () => {
    const db = await freshDb();
    const result = await graph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const keeper = await result.services.persona.create({
      principal: actor,
      input: { name: "Keeper", description: "k" },
    });
    const doomed = await result.services.persona.create({
      principal: actor,
      input: { name: "Doomed", description: "d" },
    });
    await result.services.settings.updateUserSettingsSection({
      principal: actor,
      input: {
        section: "seeds",
        patch: { currentPersonaId: doomed.id, defaultPersonaId: keeper.id },
      },
    });

    await result.services.persona.remove({ principal: actor, personaId: doomed.id });

    const { seeds } = (await result.services.settings.getUserSettings({ principal: actor })).config;
    expect(seeds.currentPersonaId).toBe(keeper.id); // re-pointed to the (surviving) default
    expect(seeds.defaultPersonaId).toBe(keeper.id); // default untouched (it wasn't the deleted one)
  });

  test("deleting the CURRENT persona with NO valid default re-points current → the newest remaining", async () => {
    const db = await freshDb();
    const result = await graph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const older = await result.services.persona.create({
      principal: actor,
      input: { name: "Older", description: "o" },
    });
    const doomed = await result.services.persona.create({
      principal: actor,
      input: { name: "Doomed", description: "d" },
    });
    // Current is the doomed one; NO default set (defaultPersonaId stays null).
    await result.services.settings.updateUserSettingsSection({
      principal: actor,
      input: { section: "seeds", patch: { currentPersonaId: doomed.id } },
    });

    await result.services.persona.remove({ principal: actor, personaId: doomed.id });

    const { seeds } = (await result.services.settings.getUserSettings({ principal: actor })).config;
    // Only `older` remains → it's the newest-remaining (and the only) survivor.
    expect(seeds.currentPersonaId).toBe(older.id);
  });

  test("deleting the DEFAULT persona re-points the default pointer to the newest remaining", async () => {
    const db = await freshDb();
    const result = await graph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const survivor = await result.services.persona.create({
      principal: actor,
      input: { name: "Survivor", description: "s" },
    });
    const doomedDefault = await result.services.persona.create({
      principal: actor,
      input: { name: "DoomedDefault", description: "d" },
    });
    // The doomed persona is BOTH default and NOT current — current points at the survivor already.
    await result.services.settings.updateUserSettingsSection({
      principal: actor,
      input: {
        section: "seeds",
        patch: { currentPersonaId: survivor.id, defaultPersonaId: doomedDefault.id },
      },
    });

    await result.services.persona.remove({ principal: actor, personaId: doomedDefault.id });

    const { seeds } = (await result.services.settings.getUserSettings({ principal: actor })).config;
    expect(seeds.currentPersonaId).toBe(survivor.id); // untouched (wasn't deleted)
    expect(seeds.defaultPersonaId).toBe(survivor.id); // re-pointed off the deleted default
  });
});

// ── The embed-model change → reindex trigger (DBK-B(b)) ──────────────────────────────────────────────────
// The compose root wires `onEmbedModelChanged` to `enqueueEmbedReindex`, which must re-embed EVERY vector
// source into the box's new space: the `index` runner (character/image/memory chunks) AND — added by DBK-B(b)
// — a bulk `databank-reindex` (document chunks live in `document_chunks`, which `index` never touches). A model
// change that enqueued only `index` would strand every document chunk in the OLD space. This drives the REAL
// settings → trigger → `workloads.start` seam through the full graph (no faked enqueue) and asserts BOTH rows.
describe("embed-model change reindex trigger (DBK-B(b))", () => {
  test("changing the embed model enqueues BOTH a bulk index AND a bulk databank-reindex", async () => {
    const db = await freshDb();
    const result = await buildGraph(db); // vLLM-disabled full graph
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    // No bulk reindex work exists before the change (causation control).
    const before = await db.select().from(workloads);
    expect(before.filter((r) => r.mode === "bulk" && (r.kind === "index" || r.kind === "databank-reindex"))).toHaveLength(0);

    await result.services.settings.updateUserSettingsSection({
      principal: principal(owner),
      input: { section: "routing", patch: { roleDefaults: { embed: { model: "qwen3-embed-v2" } } } },
    });

    // The trigger is fire-and-forget (`void workloads.start(...).catch(...)`); flush the IO queue deterministically.
    await drain(() => false);

    const bulkKinds = new Set((await db.select().from(workloads)).filter((r) => r.mode === "bulk").map((r) => r.kind));
    expect(bulkKinds.has("index")).toBe(true); // character/image/memory chunks
    expect(bulkKinds.has("databank-reindex")).toBe(true); // document chunks — the DBK-B(b) addition
  });
});

describe("corpusAutoindex indexer gate (Piece D)", () => {
  test("corpusAutoindex ON → indexer subscribed; a character write embeds (row persisted)", async () => {
    const db = await freshDb();
    // The boot reload resolves this stored override into the effective-config the gate reads.
    await writeAppOverride(db, { corpusAutoindex: true, schemaVersion: 2 }, createFrozenClock().now());
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const created = await result.services.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    // Bounded, wall-clock-free flush of the fire-and-forget bus dispatch → the embed → the store write.
    await drain(() => false);

    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, created.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("corpusAutoindex OFF (the test default) → indexer NOT subscribed; the write embeds nothing", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db); // no override → env floor (false) resolves
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const created = await result.services.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    await drain(() => false);

    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, created.id));
    expect(rows).toHaveLength(0);
  });
});

// ── Automation generate_image threads the MA-8/D96 diffusion knobs through the REAL compose graph ──────────
// The ONE composed-real witness that a rule-fired `generate_image` carrying diffusion params reaches
// `imagery.generatePicture` WITH them: the arm executor forwards `action.params` onto `AutomationImageRequest`,
// and the compose mapping (services.ts `automationOps.imagery.generatePicture`) forwards `req.params` onto
// `GeneratePictureParams`. Spying on the SAME imagery instance the automation closure calls (result.services
// .imagery === the compose-local `imagery`) proves the params survive both hops end-to-end.
describe("automation generate_image forwards diffusion params through the composed graph", () => {
  test("a rule-fired generate_image reaches imagery.generatePicture with its MA-8 diffusion knobs", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    // A host chat the owner authors + fires rules on (the real host-authority + dispatch gates read these rows).
    const chatId = mintTypeId(ID_PREFIX.chat);
    await db.insert(chats).values({ id: chatId, createdAt: 1000, updatedAt: 1000 });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_auto_host"),
      chatId,
      kind: "human",
      userId: owner,
      role: "host",
      joinSeq: 0,
      joinedAt: 1000,
    });

    const rule = await result.services.automation.createRule({
      principal: actor,
      chatId,
      name: "draw on open",
      trigger: { bus: "chat", type: "chatOpened" },
      predicateCel: null,
      actions: [automationActionSchema.parse({ type: "generate_image", mode: "free", prompt: "a lighthouse" })],
    });
    await result.services.automation.setRuleEnabled({ principal: actor, ruleId: rule.id, enabled: true });

    // Intercept the REAL imagery op the compose mapping calls (no image backend needed — we assert the request).
    const fakePicture = {
      images: [],
      prompt: "a lighthouse",
      promptSource: "user",
      mode: "free",
      model: "fake",
      costUsd: 0,
      reused: false,
      warnings: [],
    } as const;
    const spy = vi.spyOn(result.services.imagery, "generatePicture").mockResolvedValue(fakePicture);

    await result.services.automation.handleEvent({ type: "chatOpened", chatId });

    expect(spy).toHaveBeenCalledTimes(1);
    const reqParams = spy.mock.calls[0]?.[0];
    expect(reqParams?.mode).toBe("free");
    expect(reqParams?.prompt).toBe("a lighthouse");
  });
});
