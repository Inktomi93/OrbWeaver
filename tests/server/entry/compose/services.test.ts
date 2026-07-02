// entry/compose/services — the composition-root keystone. Integration-lite: build the whole graph over a
// fresh in-memory db + a frozen clock + a vLLM-disabled provider registry, and assert it constructs without
// throwing and yields every transport `Services` key plus the boot handles. This proves the injection graph
// wires (the 15 services + the boot-global RoleClients bundle resolve offline against the vLLM floor).

import { tmpdir } from "node:os";
import type { DomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import { characterEmbeddings, characterTags, chatParticipants, chats, tags } from "@orb/db";
import type { ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import type { CharacterService } from "@orb/server/domain/character";
import { createCharacterService, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { createEmbeddingsIndexer } from "@orb/server/domain/embeddings";
import { createDomainEventBus, createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { eq } from "drizzle-orm";
import type { Mock } from "vitest";
import { describe, onTestFinished, vi } from "vitest";
import { writeAppOverride } from "../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { subscribeNotifications } from "../../../../packages/server/src/transport/trpc/notifications-bus.ts";
import { createFrozenClock } from "../../../support/clock";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import {
  makeHarness as makeAssetsHarness,
  pngBytes,
  principal,
  seedUser,
} from "../../domain/assets/_support.ts";
import { makeHarness as makeCharHarness } from "../../domain/character/_support.ts";
import { EMBED_DIM, makeRoleClients } from "../../domain/embeddings/_support.ts";

const SERVICE_KEYS = [
  "admin",
  "buddy",
  "character",
  "chat",
  "connection",
  "credentials",
  "discovery",
  "notifications",
  "persona",
  "preset",
  "search",
  "settings",
  "stats",
  "tag",
  "workloads",
  "worldInfo",
] as const;

test("createServices builds the full graph: all 16 Services keys + the boot handles", async () => {
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
  expect(result.runnerEnv).toBeDefined();
  expect(result.roleClients).toBeDefined();
  expect(result.bindRoleClients).toBeInstanceOf(Function);
  expect(result.effectiveConfig).toBeDefined();
  expect(result.secretBox).toBeDefined();
  // vLLM disabled → no engine handle for the lifecycle to supervise.
  expect(result.vllmEngine).toBeNull();
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

test("the backend registry sources the resolved vLLM concurrency from AppSettings (PD-14)", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  // An admin AppSettings override the boot reload resolves into the effective-config the registry reads.
  // embed:2 is distinct from the backend's DEFAULT_EMBED_CONCURRENCY (4): observing exactly 2 in-flight embed
  // requests proves the RESOLVED override (not the deps default) reached the constructed vLLM backend.
  await writeAppOverride(
    db,
    { vllmConcurrency: { embed: 2, summarize: 3 }, schemaVersion: 2 },
    clock.now(),
  );

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

  const owner = await seedUser(db, { handle: "owner" });
  const created = await result.services.character.create({
    principal: principal(owner),
    input: { handle: "hero-card", name: "Hero", description: "a card" },
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
  const junction = await db
    .select()
    .from(characterTags)
    .where(eq(characterTags.characterId, created.id));
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
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);

    expect(result.characterSeeder).toBeDefined();
    await result.characterSeeder.ensureSeeded(actor);

    // 5 cards through the real create path.
    const list = await result.services.character.list({ principal: actor });
    expect(list).toHaveLength(5);

    // The persisted latch is set + the welcome-assistant id points at the seeded Assistant.
    const settings = await result.services.settings.getUserSettings({ principal: actor });
    expect(settings.config.onboarding.defaultCharactersSeeded).toBe(true);
    const assistant = await result.services.character.findByHandle({
      ownerId: owner,
      handle: WELCOME_ASSISTANT_HANDLE,
    });
    expect(settings.config.seeds.welcomeAssistantCharacterId).toBe(assistant?.characterId);
  });

  test("markSeeded never clobbers an explicit welcome-assistant pick", async () => {
    const db = await freshDb();
    const result = await buildGraph(db);
    const owner = await seedUser(db, { handle: "owner" });
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
  const store: Mock<EmbeddingsService["store"]> = vi.fn<EmbeddingsService["store"]>(() =>
    Promise.resolve({ outcome: "written", contentHash: "stub-hash" }),
  );
  const indexer = createEmbeddingsIndexer({
    store,
    loadCardText: async (characterId): Promise<string | undefined> =>
      (await character.loadCardText(characterId)) ?? undefined,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> =>
      (await assets.loadAssetBytes(assetId)) ?? undefined,
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
    const owner = await seedUser(db, { handle: "owner" });
    const created = await w.character.create({
      principal: principal(owner),
      input: { handle: "bryn", name: "Bryn", description: "a lighthouse keeper" },
    });
    const expected = await w.character.loadCardText(created.id);

    w.emit({ type: "character.updated", characterId: created.id });
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

  test("asset.created drives the indexer to store both image lenses from the real CAS bytes", async () => {
    const db = await freshDb();
    const w = await wireIndexer(db);
    onTestFinished(w.cleanup);
    const owner = await seedUser(db, { handle: "owner" });
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
      const content =
        params?.lens === "image-raw" || params?.lens === "image-captioned"
          ? params.content
          : undefined;
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
    const host = await seedUser(db, { handle: "host" });
    const member = await seedUser(db, { handle: "member" });
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

describe("corpusAutoindex indexer gate (Piece D)", () => {
  test("corpusAutoindex ON → indexer subscribed; a character write embeds (row persisted)", async () => {
    const db = await freshDb();
    // The boot reload resolves this stored override into the effective-config the gate reads.
    await writeAppOverride(
      db,
      { corpusAutoindex: true, schemaVersion: 2 },
      createFrozenClock().now(),
    );
    const result = await buildGatedGraph(db);
    const owner = await seedUser(db, { handle: "owner" });

    const created = await result.services.character.create({
      principal: principal(owner),
      input: { handle: "bryn", name: "Bryn", description: "a lighthouse keeper" },
    });
    // Bounded, wall-clock-free flush of the fire-and-forget bus dispatch → the embed → the store write.
    await drain(() => false);

    const rows = await db
      .select()
      .from(characterEmbeddings)
      .where(eq(characterEmbeddings.characterId, created.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("corpusAutoindex OFF (the test default) → indexer NOT subscribed; the write embeds nothing", async () => {
    const db = await freshDb();
    const result = await buildGatedGraph(db); // no override → env floor (false) resolves
    const owner = await seedUser(db, { handle: "owner" });

    const created = await result.services.character.create({
      principal: principal(owner),
      input: { handle: "bryn", name: "Bryn", description: "a lighthouse keeper" },
    });
    await drain(() => false);

    const rows = await db
      .select()
      .from(characterEmbeddings)
      .where(eq(characterEmbeddings.characterId, created.id));
    expect(rows).toHaveLength(0);
  });
});
