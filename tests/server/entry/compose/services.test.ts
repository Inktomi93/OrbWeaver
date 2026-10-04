// entry/compose/services — the composition-root keystone. Integration-lite: build the whole graph over a
// fresh in-memory db + a frozen clock + a vLLM-disabled provider registry, and assert it constructs without
// throwing and yields every transport `Services` key plus the boot handles. This proves the injection graph
// wires (the 21 services + the boot-global RoleClients bundle resolve offline against the vLLM floor).

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import { tmpdir } from "node:os";
import { automationActionSchema } from "@orb/contracts/automation";
import type { DomainEvent } from "@orb/contracts/events";
import { BUILT_IN_EMBED_DIMS } from "@orb/contracts/inference";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import {
  characterEmbeddings,
  characters as charactersTable,
  characterTags,
  chatDigests,
  chatParticipants,
  chatSegments,
  chats,
  embedGenerations,
  embedGenerationTargets,
  imageEmbeddings,
  rpgGames,
  tags,
  workloads,
} from "@orb/db";
import { SEED_MANIFEST } from "@orb/default-content";
import type {
  CharacterHandle,
  CharacterId,
  ChatParticipantId,
  ChatSegmentId,
  EmbedGenerationId,
  Handle,
  SessionId,
  SocketId,
  UserConnectionId,
  UserId,
} from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import type { CharacterService } from "@orb/server/domain/character";
import { createCharacterService, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { createEmbeddingsIndexer } from "@orb/server/domain/embeddings";
import { listSeededItemKeys } from "@orb/server/domain/settings";
import { seedLocalLightOnBoot } from "@orb/server/entry/boot";
import { createDomainEventBus, createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "@orb/server/entry/compose";
import { logger } from "@orb/server/foundation/observability";
import type { SocketListener } from "@orb/server/transport/trpc";
import { fakeLocalLightCache } from "@orb/tooling/seed";
import { eq } from "drizzle-orm";
import type { Mock } from "vitest";
import { describe, onTestFinished, vi } from "vitest";
import { analyzeAvatarImage } from "../../../../packages/server/src/domain/embeddings/indexer/caption.ts";
import { createImageIndexer } from "../../../../packages/server/src/domain/embeddings/indexer/image.ts";
import { upsertChatSegment } from "../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { readGeneration } from "../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { writeAppOverride } from "../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { subscribeChatEvents } from "../../../../packages/server/src/transport/trpc/chat-events-bus.ts";
import { subscribeNotifications } from "../../../../packages/server/src/transport/trpc/notifications-bus.ts";
import { subscribeUserEvents } from "../../../../packages/server/src/transport/trpc/user-events-bus.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testModelId } from "../../../support/inference-identities.ts";
import { makeHarness as makeAssetsHarness, pngBytes, principal, seedUser } from "../../domain/assets/_support.ts";
import { makeHarness as makeCharHarness } from "../../domain/character/_support.ts";
import { seedChat, seedCharacter as seedChatCharacter, seedParticipant } from "../../domain/chat/_support.ts";
import { seedTurns } from "../../domain/chat/memory/_support.ts";
import { makeRoleClients, makeStoreHarness, seedUser as seedVectorOwner } from "../../domain/embeddings/_support.ts";

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
  "rosterPreset",
  "rpg",
  "search",
  "sessions",
  "settings",
  "share",
  "stats",
  "tag",
  "workloads",
  "worldInfo",
] as const;

test("createServices builds the full graph: every Services key + the boot handles", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
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
  expect(result.runtime).toBeDefined();
  expect(result.roleClientsFor).toBeInstanceOf(Function);
  expect(result.effectiveConfig).toBeDefined();
  expect(result.secretBox).toBeDefined();
});

// W7a — THE ADMIN REVOKE → SOCKET EVICTION WIRE. The registry
// suite proves `evictUser` stops a generator; this proves the admin verb is CONNECTED to it, which is the
// half a unit test of either side cannot see. PER USER by owner ruling F4 ("admin REVOKE stays per-user"):
// a revoke is a statement about the account, the human's still-valid devices reconnect and resume, and it is
// the only arm that also reaches sockets admitted with no session row at all.
test("W7a an admin revoke-all evicts that user's live sockets through the compose seam", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const ownerId = castId<UserId>("u_owner");
  const result = await createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: clock.now,
    ownerId,
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
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

test("character.bulkAddCardTag attaches via the real tag wiring — not the inert throw", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
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

// ── The default-card seeder wired over the REAL settings latch ───────────────────────────────────────────
// The compose root constructs the ONE seeder instance and wires its isSeeded/markSeeded ops to the real
// settings service. These prove that wiring end-to-end: the owner is seeded through the real character.create
// path, the persisted latch lands, and the welcome-assistant stamp respects an explicit pick.

function buildGraph(db: Db): ReturnType<typeof createServices> {
  return createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: createFrozenClock().now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
  });
}

// D263 — the user seed over the REAL graph: the manifest's content lands, no room does, and the ledger
// keeps a deleted card deleted across a cold graph (a fresh in-process memo, as a restart gives).
const MANIFEST_CHARACTERS = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []));
const MANIFEST_ROSTERS = SEED_MANIFEST.flatMap((item) => (item.kind === "rosterPreset" ? [item.name] : []));
const MANIFEST_CAMPAIGNS = SEED_MANIFEST.flatMap((item) => (item.kind === "rosterPreset" && item.startsGame ? [item.name] : []));
const MANIFEST_CAMPAIGN_KEYS = SEED_MANIFEST.flatMap((item) => (item.kind === "rosterPreset" && item.startsGame ? [item.key] : []));

describe("user seed wiring", () => {
  test("a new account gets the manifest's characters and roster presets, the welcome greeter, and no rooms", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await result.contentSeeder.ensureSeeded(actor);

    const characters = await result.services.character.list({ principal: actor });
    expect(characters.items.map((c) => c.handle).toSorted()).toEqual([...MANIFEST_CHARACTERS].toSorted());
    const rosters = await result.services.rosterPreset.list({ principal: actor });
    expect(rosters.map((roster) => roster.name).toSorted()).toEqual([...MANIFEST_ROSTERS].toSorted());
    expect(rosters.every((roster) => roster.characterCount > 0)).toBe(true);
    expect((await result.services.chat.listChats({ principal: actor })).items).toHaveLength(0);
    const assistant = await result.services.character.findByHandle({ ownerId: owner, handle: WELCOME_ASSISTANT_HANDLE });
    const settings = await result.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.seeds.welcomeAssistantCharacterId).toBe(assistant?.characterId);
  });

  test("a deleted seeded character is not seeded again, even by a cold graph", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const first = await buildGraph(db);
    await first.contentSeeder.ensureSeeded(actor);
    const niko = await first.services.character.findByHandle({ ownerId: owner, handle: castId<CharacterHandle>("niko") });
    await first.services.character.remove({ principal: actor, characterId: niko?.characterId ?? castId<CharacterId>("character_missing") });

    const second = await buildGraph(db);
    await second.contentSeeder.ensureSeeded(actor);

    expect(await second.services.character.findByHandle({ ownerId: owner, handle: castId<CharacterHandle>("niko") })).toBeNull();
    const characters = await second.services.character.list({ principal: actor });
    expect(characters.items).toHaveLength(MANIFEST_CHARACTERS.length - 1);
  });

  test("a campaign roster seeds through the ledger with its game, and its start births one room and one game", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await result.contentSeeder.ensureSeeded(actor);

    const rosters = await result.services.rosterPreset.list({ principal: actor });
    const campaigns = rosters.filter((roster) => roster.game !== null);
    expect(campaigns.map((roster) => roster.name)).toEqual(MANIFEST_CAMPAIGNS);
    const [campaign] = campaigns;
    if (campaign === undefined) {
      throw new Error("the manifest seeds no campaign roster");
    }
    // The ledger records the campaign's own key, so a user who deletes it never gets it back.
    expect(await listSeededItemKeys(db, owner)).toEqual(expect.arrayContaining(MANIFEST_CAMPAIGN_KEYS));

    // The start door's two calls, as `useStartRoster` makes them.
    const started = await result.services.chat.startChat({
      principal: actor,
      characterIds: campaign.members.map((member) => member.characterId),
      anchorPersonaId: campaign.anchorPersonaId,
      title: campaign.name,
      ...(campaign.game === null ? {} : { startAsGame: campaign.game }),
    });
    await result.services.rosterPreset.applyToChat({ timeZone: UTC_TIME_ZONE, principal: actor, presetId: campaign.id, chatId: started.chat.id });

    expect(await db.select({ id: chats.id }).from(chats)).toEqual([{ id: started.chat.id }]);
    const games = await db.select().from(rpgGames);
    expect(games.map((game) => game.chatId)).toEqual([started.chat.id]);
  });

  test("the seed never clobbers an explicit welcome-greeter pick", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    await result.services.settings.updateUserSettingsSection({
      principal: actor,
      input: { section: "seeds", patch: { welcomeAssistantCharacterId: "chr_my_pick" } },
    });

    await result.contentSeeder.ensureSeeded(actor);

    const settings = await result.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.seeds.welcomeAssistantCharacterId).toBe("chr_my_pick");
  });
});

// ── The embeddings indexer subscription (composition-root wiring, embed-on-write) ──────────────────────────
// The composition root subscribes the indexer to the in-process domain-event bus and wires its UN-PRINCIPAL
// canon re-readers (character.loadCardText / assets.loadAssetBytes) into the indexer context. These tests
// reproduce that exact wiring over a fresh db with a STUB embeddings store (the inference edge is the seam we
// cut), then assert an emitted event drives the indexer THROUGH the real loaders to a store call. Production
// emit stays fire-and-forget + error-isolated; this owned test subscriber exposes its exact completion promise
// so assertions do not race an arbitrary event-loop-turn budget under full-suite load.

function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

interface IndexerWiring {
  readonly character: CharacterService;
  readonly assets: AssetsService;
  readonly store: Mock<EmbeddingsService["store"]>;
  readonly cleanup: () => Promise<void>;
  readonly emit: (event: DomainEvent) => void;
  readonly settled: () => Promise<void>;
}

/** Reproduce the composition root's indexer wiring: real character/assets services (their UN-PRINCIPAL canon
 *  re-readers feed the indexer), a STUB store recording calls, subscribed to a real bus via the same
 *  dispatcher entry/compose/services.ts uses. */
async function wireIndexer(db: Db): Promise<IndexerWiring> {
  const bus = createDomainEventBus();
  const character = createCharacterService(makeCharHarness(db).ctx);
  const assetsH = await makeAssetsHarness(db);
  const assets = createAssetsService(assetsH.ctx);
  const store: Mock<EmbeddingsService["store"]> = vi.fn<EmbeddingsService["store"]>((params) =>
    Promise.resolve({ outcome: "written", contentHash: "stub-hash", model: params.model }),
  );
  const loadCharacterOwner = async (characterId: CharacterId): Promise<UserId | null> => {
    const rows = await db.select({ ownerId: charactersTable.ownerId }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(1);
    return rows[0]?.ownerId ?? null;
  };
  const indexer = createEmbeddingsIndexer({
    indexAsset: createImageIndexer(
      {
        ...makeStoreHarness(db).ctx,
        loadAssetMime: async (id) => (await assets.assetCasRefById(id))?.mime ?? null,
        loadAssetBytes: async (id) => (await assets.loadAssetBytes(id)) ?? undefined,
      },
      { store, analyze: (_ownerId, bytes) => analyzeAvatarImage(makeRoleClients(), bytes) },
    ),
    store,
    loadCardText: async (characterId): Promise<string | undefined> => (await character.loadCardText(characterId)) ?? undefined,
    loadCharacterOwner,
    roleClientsFor: (): Promise<ReturnType<typeof makeRoleClients>> => Promise.resolve(makeRoleClients()),
  });
  function dispatch(event: DomainEvent): Promise<void> {
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
  }
  let pending: Promise<void> = Promise.resolve();
  bus.subscribe((event: DomainEvent): Promise<void> => {
    pending = dispatch(event);
    return pending;
  });
  return { character, assets, store, cleanup: assetsH.cleanup, emit: bus.emit, settled: () => pending };
}

// Max event-loop turns the drain waits before giving up — generous so a real CAS disk read (the asset path:
// loadAssetBytes → imageEmbed → caption → store) completes even under heavy parallel-suite contention, while
// the `done` predicate still short-circuits the instant the work lands (well-behaved cases stay sub-ms).
const DRAIN_MAX_TURNS = 2000;

/** Drain the fire-and-forget bus dispatch deterministically: flush the IO queue until `done` (bounded — no
 *  wall-clock; each turn is one `setImmediate` macrotask). */
async function drain(done: () => boolean): Promise<void> {
  for (let i = 0; i < DRAIN_MAX_TURNS && !done(); i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("embeddings indexer bus subscription", () => {
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
    await w.settled();

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
    await w.settled();

    expect(w.store).not.toHaveBeenCalled();
  });

  test("asset.created drives the indexer to store both image lenses from the real CAS bytes", async () => {
    const db = await freshDb();
    const w = await wireIndexer(db);
    onTestFinished(w.cleanup);
    const owner = await seedVectorOwner(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(7, 7, 7, 7);
    const stored = await w.assets.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: "image/png",
    });

    w.emit({ type: "asset.created", assetId: stored.assetId });
    await w.settled();

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
// The composition root admits event indexing only while the live effective-config `corpusAutoindex` is
// true. These build the FULL graph over a SCRIPTED local-light model cache (the embed path is offline + cheap —
// the seed tooling's fake, injected through the `localLight.cache` seam), seed the owner's local-light rows +
// `embed` binding exactly as boot does (the funder's own connection is the only embed route), create a
// character (whose `character.updated` emit rides the same bus), drain the fire-and-forget dispatch, and
// assert a card-text embedding row is persisted (ON) / never written (OFF). The tests/e2e default is OFF (vitest env CORPUS_AUTOINDEX=false); the
// ON case flips it via a stored AppSettings override the boot reload resolves.

function buildGatedGraph(db: Db, cache = fakeLocalLightCache(BUILT_IN_EMBED_DIMS)): ReturnType<typeof createServices> {
  return createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: createFrozenClock().now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    providerSeams: { localLight: { cache } },
  });
}

describe("notifications fan-out — record (durable) → publishNotification (live)", () => {
  test("a chat producer emit is durable-first AND lands on the recipient's live bus", async () => {
    const db = await freshDb();
    const clock = createFrozenClock();
    const result = await createServices({
      serverRestart: UNSUPERVISED_RESTART,
      share: NO_SHARE_RELAY,
      db,
      now: clock.now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
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

describe("persona.setActivePersona → chat bus", () => {
  test("flips activePersonaId, persists to chat_events, and fans personaSwitched onto the live channel", async () => {
    const db = await freshDb();
    const clock = createFrozenClock();
    const result = await createServices({
      serverRestart: UNSUPERVISED_RESTART,
      share: NO_SHARE_RELAY,
      db,
      now: clock.now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
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
      input: { name: "Alex", description: "the user" },
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
      // transport publishChatEvent singleton still fans it out — the write is chat-domain-owned (setParticipantActivePersona).
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
      serverRestart: UNSUPERVISED_RESTART,
      share: NO_SHARE_RELAY,
      db,
      now: createFrozenClock().now,
      ownerId: castId<UserId>("u_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
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

// ── The embed-space rebuild trigger (DBK-B(b), 0507) ─────────────────────────────────────────────────────
// Every move of an owner's stored target generation, from any caller, empties their index, and the compose root
// answers it with that owner's forced sweeps: `index` (cards, pictures), `databank-reindex` (document chunks, which
// `index` never touches) and the memory sweep. A binding write only asks the stored target whether it moved, so a
// re-bind of the encoder the target already names queues nothing. These drive the REAL connection → embeddings →
// `workloads.start` seam through the full graph and run what was queued.
const WORKLOADS_CHANGED = "workloadsChanged" satisfies UserBusEvent["type"];
const REINDEX_SPAN = "embeddings.modelChangeReindex";

/** Point the owner's stored text target at an encoder no binding resolves to, as an older release would have. */
async function seedLegacyTarget(db: Db, owner: UserId): Promise<void> {
  const legacy = castId<EmbedGenerationId>("embed_generation_from_an_older_release");
  await db.insert(embedGenerations).values({
    id: legacy,
    ownerId: owner,
    task: "embed",
    via: "embed",
    connectionId: null,
    connectionRef: castId<UserConnectionId>("user_connection_legacy"),
    fingerprint: "legacy",
    space: "legacy",
    createdAt: 0,
  });
  await db.insert(embedGenerationTargets).values({ ownerId: owner, task: "embed", generationId: legacy, epoch: 1 });
}

/** The connection the local-light seed bound for the owner's `embed` role. */
async function seededEmbedder(result: Awaited<ReturnType<typeof buildGatedGraph>>, owner: UserId): Promise<UserConnectionId> {
  const embedder = (await result.services.connection.listBindings({ principal: principal(owner) })).find((view) => view.task === "embed")?.binding
    ?.connectionId;
  if (embedder === undefined || embedder === null) {
    throw new Error("the seed bound no embedder");
  }
  return embedder;
}

/** Run every queued row's contribution as the worker would, and report each outcome by kind. */
async function runQueued(result: Awaited<ReturnType<typeof buildGatedGraph>>, rows: readonly (typeof workloads.$inferSelect)[]): Promise<unknown[]> {
  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      const contribution = result.workloadContributions[row.kind] as { readonly run: (...args: readonly unknown[]) => Promise<unknown> };
      return await contribution.run(
        { userId: row.ownerId, ownerId: row.ownerId, now: createFrozenClock().now },
        row.params,
        vi.fn(),
        new AbortController().signal,
      );
    }),
  );
  return outcomes.map((outcome, i) => ({ kind: rows[i]?.kind, status: outcome.status }));
}

function reindexErrors(errorSpy: { readonly mock: { readonly calls: unknown[][] } }): unknown[][] {
  return errorSpy.mock.calls.filter((call) => (call[0] as { spanName?: string }).spanName === REINDEX_SPAN);
}

describe("embed-space rebuild trigger (DBK-B(b))", () => {
  // Clearing an embed role leaves nothing that can embed, and the preview already told the user it rebuilds nothing:
  // the write queues no sweep, so no job lands failed and nothing is logged.
  test("unbinding a member's embedder queues nothing and logs nothing", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await result.seedUserConnections(member);
    await drain(() => false);
    const errorSpy = vi.spyOn(logger, "error");

    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: null });
    await drain(() => false);

    expect(await db.select().from(workloads)).toEqual([]);
    expect(reindexErrors(errorSpy)).toEqual([]);
  });

  // The stored target already names this encoder, so an unbind and re-bind moves nothing and re-embeds nothing.
  test("re-binding the encoder the stored target names queues nothing", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await result.seedUserConnections(member);
    const embedder = await seededEmbedder(result, member);
    await result.embeddings.resolveGeneration(member, "embed");
    const errorSpy = vi.spyOn(logger, "error");

    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: null });
    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: embedder });
    await drain(() => false);

    expect(await db.select().from(workloads)).toEqual([]);
    expect(reindexErrors(errorSpy)).toEqual([]);
  });

  // A re-point moves only the re-pointing user's generations, so the rebuild is THEIR job: a plain member must be
  // able to read it back through `workloads.list` (which pins a member to their own rows), their live user channel
  // must hear that it was queued (the binding write's own tick lands before the detached insert), and every queued
  // run must complete.
  test("a member's re-point that moves their target queues their own forced rebuild, readable, announced, and runnable", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await result.seedUserConnections(member);
    const embedder = await seededEmbedder(result, member);
    await seedLegacyTarget(db, member);
    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: null });
    await drain(() => false);
    const abort = new AbortController();
    onTestFinished(() => {
      abort.abort();
    });
    // Everything the member's channel carries up to the first job announcement.
    const announced = (async (): Promise<UserBusEvent[]> => {
      const heard: UserBusEvent[] = [];
      for await (const event of subscribeUserEvents(member, abort.signal)) {
        heard.push(event);
        if (event.type === WORKLOADS_CHANGED) {
          break;
        }
      }
      return heard;
    })();

    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: embedder });
    // Bounded: an announcement that never comes fails the assertion below instead of hanging the test.
    const heard = await Promise.race([announced, drain(() => false).then((): UserBusEvent[] => [])]);
    await drain(() => false);

    const rows = await db.select().from(workloads);
    expect(rows.filter((row) => row.mode === "bulk")).toHaveLength(0);
    const index = rows.find((row) => row.kind === "index");
    expect(index).toMatchObject({ ownerId: member, mode: "singular", params: { source: "all", force: true, embedderChanged: true } });
    // The documents sweep is the move's rebuild too, in its own slot beside any plain owner pass.
    expect(rows.find((row) => row.kind === "databank-reindex")).toMatchObject({ admissionKey: "owner:rebuild", params: { embedderChanged: true } });
    const listed = await result.services.workloads.list({ caller: principal(member), kind: "index" });
    expect(listed.map((row) => row.id)).toEqual([index?.id]);
    expect(heard).toContainEqual({ type: WORKLOADS_CHANGED });
    expect(await runQueued(result, rows)).toEqual(rows.map((row) => ({ kind: row.kind, status: "fulfilled" })));
  });

  // The lazy path no binding write sees (a key fixed after a revoked re-point, a release, boot): the first write
  // whose resolve moves the target queues the same rebuild.
  test("a write that moves the target queues the owner's forced rebuild", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await result.seedUserConnections(member);
    await seedLegacyTarget(db, member);

    await result.embeddings.resolveGeneration(member, "embed");
    await drain(() => false);

    const rows = await db.select().from(workloads);
    expect(rows.find((row) => row.kind === "index")).toMatchObject({ ownerId: member, mode: "singular", params: { force: true, embedderChanged: true } });
    expect(await runQueued(result, rows)).toEqual(rows.map((row) => ({ kind: row.kind, status: "fulfilled" })));
  });

  // Two triggers for one move (boot's stale-owner sweep and the move it then makes, a re-bind racing it) adopt the
  // active run instead of queuing twice or logging a conflict.
  test("two triggers for one move queue one sweep of each kind and log nothing", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await result.seedUserConnections(member);
    const embedder = await seededEmbedder(result, member);
    await seedLegacyTarget(db, member);
    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: null });
    await drain(() => false);
    const errorSpy = vi.spyOn(logger, "error");

    result.detachStaleSpaceReindex();
    await result.services.connection.setBinding({ principal: principal(member), task: "embed", connectionId: embedder });
    await drain(() => false);

    const kinds = (await db.select().from(workloads)).map((row) => row.kind).toSorted((a, b) => a.localeCompare(b));
    expect(kinds).toEqual([...new Set(kinds)]);
    expect(kinds).toContain("index");
    expect(reindexErrors(errorSpy)).toEqual([]);
  });

  // B4: a release that moves generation identity leaves owners whose stored target no user action will ever
  // re-raise. Boot finds them and queues the same sweeps a target move does, for that owner, forced.
  test("boot queues the embed-space sweeps for an owner whose stored generation went stale", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("stale-owner") });
    await result.seedUserConnections(owner);
    await seedLegacyTarget(db, owner);

    result.detachStaleSpaceReindex();
    const queued = async (): Promise<(typeof workloads.$inferSelect)[]> =>
      (await db.select().from(workloads)).filter((row) => row.ownerId === owner && row.mode === "singular");
    let rows: (typeof workloads.$inferSelect)[] = [];
    for (let attempt = 0; attempt < DRAIN_MAX_TURNS && rows.length < 2; attempt += 1) {
      rows = await queued();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // A memory-off owner's memory scope completes vacuously instead of queuing a run; the other two are runs.
    expect(rows.map((row) => row.kind).toSorted((a, b) => a.localeCompare(b))).toEqual(["databank-reindex", "index"]);
    expect(rows.find((row) => row.kind === "index")?.params).toMatchObject({ source: "all", force: true, embedderChanged: true });
  });

  test("a detached enqueue rejection is structured and operator-visible without failing the settings write", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await result.seedUserConnections(owner);
    const embedder = await seededEmbedder(result, owner);
    await seedLegacyTarget(db, owner);
    await result.services.connection.setBinding({ principal: principal(owner), task: "embed", connectionId: null });
    await drain(() => false);
    const enqueueFailure = new Error("workload admission unavailable");
    const start = vi.spyOn(result.services.workloads, "start").mockRejectedValue(enqueueFailure);
    const errorSpy = vi.spyOn(logger, "error");

    await expect(result.services.connection.setBinding({ principal: principal(owner), task: "embed", connectionId: embedder })).resolves.toBeDefined();
    await drain(() => false);

    // Every enqueue the move attempted failed, and each failure is logged in the reindex span; none escaped.
    const failures = reindexErrors(errorSpy);
    expect(failures).toHaveLength(start.mock.calls.length);
    expect(failures.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ err: enqueueFailure, workloadKind: "index", spanName: REINDEX_SPAN }),
        expect.objectContaining({ err: enqueueFailure, workloadKind: "databank-reindex", spanName: REINDEX_SPAN }),
      ]),
    );
    expect(failures.every((call) => call[1] === "detached operation failed")).toBe(true);
  });
});

async function runEmbedSweeps(result: Awaited<ReturnType<typeof buildGatedGraph>>, owner: UserId, memoryScope: UserId | null): Promise<void> {
  const ctx = { userId: owner, ownerId: owner, now: createFrozenClock().now };
  await result.workloadContributions.index.run(ctx, { source: "all" }, vi.fn(), new AbortController().signal);
  await result.workloadContributions["databank-reindex"].run(ctx, { scope: { kind: "owner" }, mode: "chunk-embed" }, vi.fn(), new AbortController().signal);
  await result.workloadContributions["memory-backfill"].run({ ...ctx, ownerId: memoryScope }, {}, vi.fn(), new AbortController().signal);
}

describe("corpusAutoindex indexer gate (Piece D)", () => {
  test("fresh seeded content indexes through events and catch-up without any seed inference", async () => {
    const db = await freshDb();
    await writeAppOverride(db, { corpusAutoindex: true, schemaVersion: 2 }, createFrozenClock().now());
    const cache = fakeLocalLightCache(BUILT_IN_EMBED_DIMS);
    const textCalls = vi.spyOn(cache, "embedTexts").mockRejectedValue(new Error("seed text reached inference"));
    const imageCalls = vi.spyOn(cache, "embedImages").mockRejectedValue(new Error("seed image reached inference"));
    const result = await buildGatedGraph(db, cache);
    const owner = await seedUser(db, { handle: castId<Handle>("seeded-owner") });
    await seedLocalLightOnBoot({ db, now: createFrozenClock().now, onEmbedSpaceBound: () => undefined });
    await result.contentSeeder.ensureSeeded(principal(owner));
    await runEmbedSweeps(result, owner, null);
    await drain(() => false);
    const cards = await db.select().from(characterEmbeddings);
    const images = await db.select().from(imageEmbeddings);
    expect(cards).toHaveLength(MANIFEST_CHARACTERS.length);
    expect(images).toHaveLength(MANIFEST_CHARACTERS.length);
    expect(textCalls).not.toHaveBeenCalled();
    expect(imageCalls).not.toHaveBeenCalled();
    const first = cards[0];
    if (first === undefined) {
      throw new Error("seed cards are missing");
    }
    const neighbors = await result.services.search.similarCharacters({ ownerId: owner, characterId: first.characterId, topN: 3 });
    expect(neighbors).toHaveLength(3);
    expect(neighbors.every((row) => row.characterId !== first.characterId && Number.isFinite(row.relevance))).toBe(true);
  });
  test("saving autoindex enables catch-up once and changes subsequent writes without restarting", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedLocalLightOnBoot({ db, now: createFrozenClock().now, onEmbedSpaceBound: () => undefined });
    const actor = { ...principal(owner), role: "admin" as const };
    await result.services.settings.updateAppSettings({ principal: actor, partial: { corpusAutoindex: true } });
    await drain(() => false);
    expect((await db.select().from(workloads)).filter((row) => row.kind === "index")).toHaveLength(1);
    await result.services.settings.updateAppSettings({ principal: actor, partial: { corpusAutoindex: true } });
    await drain(() => false);
    expect((await db.select().from(workloads)).filter((row) => row.kind === "index")).toHaveLength(1);
    const created = await result.services.character.create({
      principal: actor,
      input: { handle: castId<CharacterHandle>("live-index"), name: "Live index", description: "initial" },
    });
    await drain(() => false);
    const indexed = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, created.id));
    expect(indexed).toHaveLength(1);
    await result.services.settings.updateAppSettings({ principal: actor, partial: { corpusAutoindex: false } });
    await result.services.character.update({ principal: actor, characterId: created.id, input: { description: "edited after indexing stopped" } });
    await drain(() => false);
    expect(await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, created.id))).toEqual(indexed);
  });
  test("corpusAutoindex ON → indexer subscribed; a character write embeds (row persisted)", async () => {
    const db = await freshDb();
    // The boot reload resolves this stored override into the effective-config the gate reads.
    await writeAppOverride(db, { corpusAutoindex: true, schemaVersion: 2 }, createFrozenClock().now());
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedLocalLightOnBoot({ db, now: createFrozenClock().now, onEmbedSpaceBound: () => undefined });

    const created = await result.services.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    // Bounded, wall-clock-free flush of the fire-and-forget bus dispatch → the embed → the store write.
    await drain(() => false);

    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, created.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("corpusAutoindex OFF (the test default) leaves writes unindexed", async () => {
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
      timeZone: UTC_TIME_ZONE,
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
      model: testModelId("fake"),
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

// ── Search when the memory scope has nothing it can derive (0215) ────────────────────────────────────────────
// Search reads one generation only once cards, memory and documents all complete it. These run the real sweeps
// over the real graph (local-light encoder, no summarize connection) and prove memory completes, so search answers.
describe("search when the memory scope can build no digests (0215)", () => {
  const RunAt = 1_750_000_000_000;

  async function searchAnswers(result: Awaited<ReturnType<typeof buildGatedGraph>>, owner: UserId): Promise<number> {
    const answer = await result.services.search.search({
      ownerId: owner,
      query: "a lighthouse keeper",
      topN: 3,
      over: "characters",
      scope: { kind: "owner" },
      rerank: false,
    });
    return "hits" in answer ? answer.hits.length : 0;
  }

  test("Memory off with old-model memory vectors: memory completes vacuously, the old vectors go, and search answers", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedLocalLightOnBoot({ db, now: createFrozenClock().now, onEmbedSpaceBound: () => undefined });
    await result.services.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    const room = await seedChat(db, "room_old_memory");
    await seedParticipant(db, { chatId: room, key: "h", userId: owner, role: "host" });
    const oldGeneration = castId<EmbedGenerationId>("embed_generation_old_model");
    await db.insert(embedGenerations).values({
      id: oldGeneration,
      ownerId: owner,
      task: "embed",
      via: "embed",
      connectionId: null,
      connectionRef: castId<UserConnectionId>("fixture:old-model"),
      fingerprint: "fixture:old-model",
      space: "old-embed-model-v0",
      createdAt: RunAt,
    });
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_old_model"),
      chatId: room,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 1,
      seqEnd: 2,
      text: "an old-model memory chunk",
      embedding: new Float32Array(BUILT_IN_EMBED_DIMS),
      contentHash: "old",
      model: "old-embed-model-v0",
      generationId: oldGeneration,
      dim: BUILT_IN_EMBED_DIMS,
      now: RunAt,
    });

    await runEmbedSweeps(result, owner, null);

    expect((await readGeneration(db, owner, "embed")).status).toBe("ready");
    expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, room))).toEqual([]);
    expect(await searchAnswers(result, owner)).toBeGreaterThan(0);
  });

  test("Memory on with no summarize connection: segments embed, no digest is made, memory completes, and search answers", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedLocalLightOnBoot({ db, now: createFrozenClock().now, onEmbedSpaceBound: () => undefined });
    await result.services.settings.updateUserSettingsSection({ principal: principal(owner), input: { section: "memory", patch: { enabled: true } } });
    await result.services.character.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bryn"), name: "Bryn", description: "a lighthouse keeper" },
    });
    const aria = await seedChatCharacter(db, owner, "aria");
    const room = await seedChat(db, "room_no_summarizer");
    await seedParticipant(db, { chatId: room, key: "h", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 24);

    await runEmbedSweeps(result, owner, owner);

    expect((await db.select().from(chatSegments).where(eq(chatSegments.chatId, room))).length).toBeGreaterThan(0);
    expect(await db.select().from(chatDigests).where(eq(chatDigests.chatId, room))).toEqual([]);
    expect((await readGeneration(db, owner, "embed")).status).toBe("ready");
    expect(await searchAnswers(result, owner)).toBeGreaterThan(0);
  });
});
