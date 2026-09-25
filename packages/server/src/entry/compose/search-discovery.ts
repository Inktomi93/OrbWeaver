// Composition seam for the derived-data cluster + the two broad-consumer singletons built in the same region:
// embeddings (+ its event-driven indexer and the corpusAutoindex bus subscription), the character.updated→chat
// fan, persona, preset (+ its portability ctx), stats, search, discovery, notifications, workloads, and the
// embed-model-change → bulk purge+reindex enqueue. Owns no business logic — it wires each service's
// injected ops onto the already-built infra handles + sibling front doors.
//
// FORWARD-REFS this seam PRODUCES for earlier blocks: `persona` (the character seeder's createPersona +
// character block's persona reads deref it at request time) and `preset` (character's greeting-template resolver).
// The keystone threads those back as request-time getters. `workloads` is produced here and consumed by the
// keystone's `enqueueEmbedReindex` holder, databank, and portability — the keystone assigns the returned
// `enqueueEmbedReindex` onto its late-bound holder so the settings write's embed-model trigger fires it.

import type { DurableChatBusEvent, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { AppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { characters as charactersTable, personas as personasTable } from "@orb/db";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import { can, isAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { MemoryEmbedSpace } from "#domain/chat";
import { createResolveStandingAsks } from "#domain/chat";
import { resolveActiveDocumentIds } from "#domain/databank";
import type { DiscoveryContext, DiscoveryService } from "#domain/discovery";
import { createDiscoveryService, distinctCorpusOwners } from "#domain/discovery";
import type { EmbeddingsIndexer, EmbeddingsService, ResolveEmbeddingConnection } from "#domain/embeddings";
import { createEmbeddingsIndexer, createEmbeddingsService } from "#domain/embeddings";
import type { NotificationsService } from "#domain/notifications";
import { createNotificationsService } from "#domain/notifications";
import type { PersonaContext, PersonaService, ResolvePersonasForParticipants } from "#domain/persona";
import { createPersonaService, createResolvePersonasForParticipants } from "#domain/persona";
import type { PresetContext, PresetService } from "#domain/preset";
import { createPresetService } from "#domain/preset";
import type { SearchService } from "#domain/search";
import { createSearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import type { StatsService } from "#domain/stats";
import { createStatsService } from "#domain/stats";
import type { TagService } from "#domain/tag";
import type { WorkloadContributions, WorkloadService } from "#domain/workloads";
import { createWorkloadService } from "#domain/workloads";
import type { AuditEntry, SpanAttrs } from "#foundation/observability";
import { superviseDetached, superviseSettled } from "#foundation/observability";
import { requireAuthorOrHost, resolveTier0Range, setParticipantActivePersona } from "../../domain/chat/index.ts";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import type { DomainEventBus } from "./event-bus.ts";
import { minter } from "./minter.ts";
import { createResolvePresetUsage } from "./preset-usage.ts";
import { createDeleteReachCapture, createRoomEntityFan } from "./room-reach.ts";
import { createResolveVisibleRooms } from "./visible-rooms.ts";

/** The embed-space sweep enqueues' own trace root, for both scopes. One name so the debug surface and any future
 *  filter agree; the enqueues share it and are told apart by the `workloadKind` attribute and the request id. */
const EMBED_REINDEX_SPAN = "embeddings.modelChangeReindex";

/** One embed-space sweep enqueue, run under its own root span. */
interface EmbedSweep {
  readonly requestId: string;
  readonly attrs: SpanAttrs;
  readonly start: () => Promise<unknown>;
}

/** Exhaustiveness guard for the closed `DomainEvent` union — a new event member without a bus route is a
 *  tsc error here, not a silent drop. */
function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

/** What the search/discovery cluster seam needs from the composition root. */
export interface SearchDiscoveryComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** The per-FUNDER role-client binder (§8.5b): embeddings/search/discovery resolve the entity OWNER's rows
   *  (vector tasks are owner-scoped, §7.5) and the workload's acting user for the summarize passes. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly resolveEmbeddingConnection: ResolveEmbeddingConnection;
  readonly eventBus: DomainEventBus;
  readonly attachCardTagByName: TagService["attachCardTagByName"];
  /** The card owner's default-preset params (the side-gen sampling ladder's middle rung — distill + analyze). */
  readonly resolveUserPresetParams: DiscoveryContext["resolveUserPresetParams"];
  readonly character: Pick<CharacterService, "listEmbeddableCharacterIds" | "loadCardText">;
  readonly assets: Pick<AssetsService, "listImageAssetIds" | "loadAssetBytes" | "assetCasRefById">;
  readonly settings: Pick<SettingsService, "loadUserSettings" | "updateUserSettingsSection">;
  /** LIVE effective-config getter (the memory tier-grid seam reads memoryDefaults per call). */
  readonly getEffectiveConfig: () => AppSettings;
  /** chat's bus durable-first emit — persona's active-persona write publishes onto it. */
  readonly emitChatEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** chat's DURABLE-APPEND-FREE fan (design §3.4) — the entity→room bridge's only emit surface. Separate dep
   *  from `emitChatEvent` because they are different lanes, not two spellings of one: this one writes no
   *  `chat_events` row and carries no seq. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
  /** ON ⇒ subscribe the indexer to the bus (embed-on-write); OFF ⇒ built-but-not-subscribed. */
  readonly corpusAutoindex: boolean;
  /** preset's ONE cross-feature op: the caller's chat-role capability, for `preset.resolveEffective`'s
   *  projection of the generation funnel. `connection` composes BEFORE this seam at the keystone, so it is a
   *  plain dep, not a forward-ref. */
  readonly resolveChatCapability: PresetContext["resolveChatCapability"];
  /** The LATE-BOUND workload contribution registry (assembled after chat, at the keystone) — the workloads
   *  verbs deref it per call as their per-kind params validator. */
  readonly getContributions: () => WorkloadContributions;
  /** chat's memory-enabled read (LATE-BOUND: chat composes after this seam), for the memory-off receipt. */
  readonly isMemoryEnabled: (ownerId: UserId) => Promise<boolean>;
}

/** The cluster compose product. `enqueueEmbedReindex` is returned so the keystone can bind it onto its
 *  late-bound embed-space-change holder (the trigger). */
export interface SearchDiscoveryComposeResult {
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS participants op — injected into the chat compose (the FOREIGN-inputs
   *  resolver's ONE room-plane persona read). Built from the SAME `PersonaContext` as the service. */
  readonly resolvePersonasForParticipants: ResolvePersonasForParticipants;
  readonly presetCtx: PresetContext;
  readonly preset: PresetService;
  readonly stats: StatsService;
  readonly search: SearchService;
  readonly discovery: DiscoveryService;
  readonly notifications: NotificationsService;
  readonly workloads: WorkloadService;
  /** Enqueue the embed-space sweeps: `null` for every owner (a binding change), a `UserId` for that owner (a seed).
   *  Settles once every enqueue has; never rejects, because a failed enqueue is logged in its own span. */
  readonly enqueueEmbedReindex: (scope: UserId | null) => Promise<void>;
  /** {@link SearchDiscoveryComposeResult.enqueueEmbedReindex} for a trigger that must not wait on it: the same
   *  sweeps, started detached. */
  readonly detachEmbedReindex: (scope: UserId | null) => void;
  /** A memory-off owner's vacuous memory receipt against their current target, or `null` (memory on, or no
   *  target). The memory sweep's terminal records it for an owner the sweep covered but built nothing for. */
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<MemoryEmbedSpace | null>;
  /** The bulk-pass announce audience — every owner with corpus rows, bound over this seam's `db`. Threaded
   *  into BOTH discovery's five analytics contributions and embeddings' `index` sweep as their
   *  `listCorpusOwners` op, so the box-wide arm's `corpusRecomputed` fan reaches every owner it touched
   *  (event-bus coverage survey §2.5/F6). Bound HERE, not at the caller, so the domain's own query stays
   *  behind the seam that owns discovery. */
  readonly listCorpusOwners: () => Promise<UserId[]>;
}

export function buildSearchDiscovery(deps: SearchDiscoveryComposeDeps): SearchDiscoveryComposeResult {
  const { db, now, audit, roleClientsFor, eventBus, character, assets, settings } = deps;
  // The two OWNER reads the vector substrate needs to pick a space: a card's owner (`characters.ownerId`, a
  // plain column read — the character front door is Principal-scoped and a sweep has none) and an asset's.
  const loadCharacterOwner = async (characterId: Parameters<typeof character.loadCardText>[0]): Promise<UserId | null> => {
    const rows = await db.select({ ownerId: charactersTable.ownerId }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(1);
    return rows[0]?.ownerId ?? null;
  };
  const loadAssetOwner = async (assetId: Parameters<typeof assets.assetCasRefById>[0]): Promise<UserId | null> =>
    (await assets.assetCasRefById(assetId))?.ownerId ?? null;

  const embeddings = createEmbeddingsService({
    db,
    roleClientsFor,
    resolveEmbeddingConnection: deps.resolveEmbeddingConnection,
    now,
    newCharacterEmbeddingId: minter(ID_PREFIX.characterEmbedding),
    newImageEmbeddingId: minter(ID_PREFIX.imageEmbedding),
    newChatDigestId: minter(ID_PREFIX.chatDigest),
    newChatSegmentId: minter(ID_PREFIX.chatSegment),
    newDocumentChunkId: minter(ID_PREFIX.documentChunk),
    listCharacterIds: character.listEmbeddableCharacterIds,
    loadCardText: async (characterId): Promise<string | undefined> => (await character.loadCardText(characterId)) ?? undefined,
    listImageAssetIds: assets.listImageAssetIds,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    loadCharacterOwner,
    loadAssetOwner,
    embedDim: EMBED_SPACE_DIMS,
    imageEmbedDim: EMBED_SPACE_DIMS,
  });

  const indexer = createEmbeddingsIndexer({
    store: embeddings.store,
    // The indexer touches its OWN `image_index_skips` table directly (the admission floor) — db + clock, as
    // the bulk `embedAssets` sweep does. Cross-domain canon re-reads below stay injected ops.
    db,
    now,
    loadCardText: async (characterId): Promise<string | undefined> => (await character.loadCardText(characterId)) ?? undefined,
    // The embeddability gate reads the stored mime by id (reuses the un-principal `assetCasRefById` row lookup).
    loadAssetMime: async (assetId): Promise<string | null> => (await assets.assetCasRefById(assetId))?.mime ?? null,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    loadCharacterOwner,
    loadAssetOwner,
    roleClientsFor,
    embedDim: EMBED_SPACE_DIMS,
    imageEmbedDim: EMBED_SPACE_DIMS,
  });
  // OFF ⇒ the indexer is built but not subscribed (a clean boot with no embed-on-write). Distinct from
  // memoryDefaults.mode (chat digests) — two separate knobs.
  if (deps.corpusAutoindex) {
    eventBus.subscribe((event: DomainEvent): Promise<void> => {
      switch (event.type) {
        case "character.updated":
          return indexer.onCharacterUpdated(event);
        case "asset.created":
          return indexer.onAssetCreated(event);
        // The entity→room bridge's two members (§3.6). NOT indexer inputs — personas and lorebooks are not
        // embedded sources — and named explicitly rather than caught by a fallthrough, which is what makes the
        // `assertNeverEvent` below a real belt on the NEXT member.
        case "persona.updated":
        case "world-info.updated":
          return Promise.resolve();
        default:
          return assertNeverEvent(event);
      }
    });
  }

  // THE ENTITY→ROOM BRIDGE (design §3.5): every content-affecting entity event → a live-only
  // `roomEntityChanged` on each room whose member-visible projection reads that entity. Always-on (not gated
  // on corpusAutoindex) — open-room freshness is orthogonal to the search knob, the shipped character fan's
  // own ruling. This subscriber REPLACES the `character.updated → durable chatUpdated` fan
  // (`emit-character-updated.ts`, deleted in the same commit): the member-card dialog now repaints, the
  // per-edit refetch narrows from the whole-room `chatUpdated` set to three reads, and the per-seated-room
  // `chat_events` INSERT is gone. A SECOND subscriber beside the indexer's, deliberately: the two consumers
  // have different filters (the indexer skips flag-only edits and is knob-gated) and the bus error-isolates
  // per subscriber, so a failing reach query can never cost an embedding.
  const fanEntityUpdateToRooms = createRoomEntityFan(db, deps.emitChatEventLive);
  eventBus.subscribe(fanEntityUpdateToRooms);

  // The DELETE half of the bridge (design §3.6 residual): a persona/book delete NULLs/cascades its seating
  // junctions, so the fan-on-event subscriber above resolves ∅ post-write. The delete verbs snapshot their
  // reach BEFORE the delete through this capture and fan the returned thunk after — same live-only emit surface.
  const deleteReachCapture = createDeleteReachCapture(db, deps.emitChatEventLive);

  // Named (not inlined into the service call) because TWO things are built from it: the Principal-scoped
  // `PersonaService` and the PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) the chat
  // FOREIGN-inputs resolver reads a room's personas through. One ctx, one home for the persona wiring.
  const personaCtx: PersonaContext = {
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
    audit,
    emitUserEvent: publishUserEvent,
    // The room plane (§3.6): persona content writes raise `persona.updated`, which this seam's own reach
    // subscriber turns into a `roomEntityChanged` per room the persona is live in.
    emit: eventBus.emit,
    // The DELETE residual (§3.6): `remove` snapshots the persona's rooms through this BEFORE the delete NULLs
    // its seat/anchor pointers, then fans the captured set — the post-write `emit` path above would see ∅.
    captureRoomReachForDelete: deleteReachCapture.persona,
    requireChatAuthorOrHost: async (principal, chatId, targetUserId) => {
      await requireAuthorOrHost({ db, can }, principal, chatId, targetUserId);
    },
    setChatActivePersona: async (chatId, targetUserId, personaId) => {
      await setParticipantActivePersona(db, deps.emitChatEvent, { chatId, targetUserId, personaId });
    },
    // Owner invariant "never NO current persona while you own one": after remove deletes deletedId,
    // re-point the global seed pointers if either named it, runs through the settings section-patch verb.
    repointSeedsAfterPersonaDelete: async (ownerId, deletedId) => {
      const seeds = (await settings.loadUserSettings(ownerId)).seeds;
      const currentHit = seeds.currentPersonaId === deletedId;
      const defaultHit = seeds.defaultPersonaId === deletedId;
      if (!(currentHit || defaultHit)) {
        return;
      }
      const remaining = await db
        .select({ id: personasTable.id })
        .from(personasTable)
        .where(eq(personasTable.ownerId, ownerId))
        .orderBy(desc(personasTable.createdAt));
      const firstRemaining: PersonaId | null = remaining[0]?.id ?? null;
      // Prefer the surviving default; else the newest remaining persona; else null.
      const survivingDefault = defaultHit ? firstRemaining : seeds.defaultPersonaId;
      const nextCurrent = currentHit ? (survivingDefault ?? firstRemaining) : seeds.currentPersonaId;
      // @orb-waive one-principal-mint-population(Principal): synthetic principal for persona-seed settings update; ends when a shared factory replaces it
      const principal: Principal = {
        userId: ownerId,
        role: "user",
        handle: castId<Handle>(ownerId),
        externalId: null,
        via: "fallback",
      };
      await settings.updateUserSettingsSection({
        principal,
        input: {
          section: "seeds",
          patch: {
            ...(currentHit ? { currentPersonaId: nextCurrent } : {}),
            ...(defaultHit ? { defaultPersonaId: survivingDefault } : {}),
          },
        },
      });
    },
  };
  const persona = createPersonaService(personaCtx);
  const resolvePersonasForParticipants = createResolvePersonasForParticipants(personaCtx);
  const presetCtx: PresetContext = {
    db,
    now,
    newPresetId: minter(ID_PREFIX.preset),
    audit,
    emitUserEvent: publishUserEvent,
    resolveChatCapability: deps.resolveChatCapability,
    // The CONTEXT panel's backward-bindings read (#279). Assembled here rather than passed in because every
    // input is already on this seam's own deps (`db` + settings) plus the SHARED room filter — and none of
    // the three belongs to `domain/preset`.
    resolvePresetUsage: createResolvePresetUsage({
      db,
      loadUserSettings: deps.settings.loadUserSettings,
      resolveVisibleRooms: createResolveVisibleRooms(db),
    }),
  };
  // Shared: the service + the portability `preset` descriptor (both write the domain's own `presets` table).
  const preset = createPresetService(presetCtx);
  const stats = createStatsService(db, now);
  // `resolveActiveDocumentIds` is databank's ONE scope-union home, injected into search — the
  // documents lens never re-derives which documents a scope may see.
  const search = createSearchService({
    db,
    roleClientsFor,
    resolveEmbeddingConnection: deps.resolveEmbeddingConnection,
    now,
    resolveActiveDocumentIds: (scope) => resolveActiveDocumentIds(db, scope),
  });
  const discovery = createDiscoveryService({
    db,
    now,
    newDuplicateCharacterPairId: minter(ID_PREFIX.duplicateCharacterPair),
    newThemeClusterId: minter(ID_PREFIX.themeCluster),
    newKeywordCooccurrenceId: minter(ID_PREFIX.keywordCooccurrence),
    newCharacterKeywordProfileId: minter(ID_PREFIX.characterKeywordProfile),
    newDuplicateChatPairId: minter(ID_PREFIX.duplicateChatPair),
    roleClientsFor,
    attachCardTagByName: deps.attachCardTagByName,
    resolveUserPresetParams: deps.resolveUserPresetParams,
    // PROSE-1 — the compare / ask / distill system prompts off the CARD OWNER's `UserSettings.prose` (the
    // same caller scoping imagery's template resolvers use: a library analysis is one human's request about
    // their own cards, not a room-level side generation). No override ⇒ the shipped prompts.
    resolveUserProse: async (userId) => (await deps.settings.loadUserSettings(userId)).prose,
    writeHubScores: embeddings.writeHubScores,
    // discovery receives only the narrowed economics results — raw message_variants columns never cross the fence.
    characterEconomics: stats.characterEconomics,
    characterModelEconomics: stats.characterModelEconomics,
    // The cross-domain `similar` seam (characterDossier) — search's `similarCharacters`, narrowed to the
    // discovery-local DossierNeighbor shape here (search's CharacterCardHit never enters the discovery contract).
    similar: async (userId, characterId, topN) =>
      (await search.similarCharacters({ ownerId: userId, characterId, topN })).map((h) => ({
        characterId: h.characterId,
        name: h.name,
        score: h.score,
        relevance: h.relevance,
        avatarHash: h.avatarHash,
        genre: h.genre,
        tone: h.tone,
        elevatorPitch: h.elevatorPitch,
      })),
    // The memory tier-grid seam (tier-k) — chat/memory's fanOut math (ONE home) bound over the LIVE
    // AppSettings.memoryDefaults, the same source the digest build resolves per call.
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range(deps.getEffectiveConfig().memoryDefaults, tier, blockIdx),
  });
  const notifications = createNotificationsService({
    db,
    now,
    // THE #1799 CROSS-FEATURE JOIN, made here and only here. The inbox needs to know which of a page's
    // decisions are still open; the answer lives in chat's `chat_invites.status` /
    // `chats.pending_host_user_id`. notifications declares the op TYPE it consumes
    // (`domain/notifications/contract/ops.ts`) and chat exports the runtime factory — neither imports the
    // other, and `tsc` proves the two spellings agree on this line. A standalone `(db)` factory rather than
    // a `ChatService` verb, so this block does not have to wait for the chat service (composed later).
    resolveStandingAsks: createResolveStandingAsks(db),
  });
  const workloads = createWorkloadService({
    db,
    getContributions: deps.getContributions,
    now,
    newWorkloadId: minter(ID_PREFIX.workload),
    newScheduleId: minter(ID_PREFIX.workloadSchedule),
    requireOwner,
    isAdmin,
  });

  // The memory receipt for an owner a sweep covers but builds no space for. Only completable when memory is OFF
  // for them: they have no memory vectors, so the scope is vacuously in the target space. An ENABLED owner gets
  // none; its memory sweep records its own.
  const vacuousMemoryReceipt = async (ownerId: UserId): Promise<MemoryEmbedSpace | null> => {
    if (await deps.isMemoryEnabled(ownerId)) {
      return null;
    }
    const generation = await embeddings.resolveGeneration(ownerId, "embed");
    return generation === null ? null : { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
  };

  // An owner's memory sweep: a memory-backfill run, or for a memory-off owner (refused at admission, and it
  // would derive nothing) the vacuous receipt recorded directly.
  const enqueueOwnerMemory = async (ownerId: UserId): Promise<unknown> => {
    const vacuous = await vacuousMemoryReceipt(ownerId);
    if (vacuous === null) {
      return await workloads.start({ input: { kind: "memory-backfill", params: {} }, caller: null, mode: "singular", ownerId });
    }
    return await embeddings.purgeMemoryVectors({
      ownerId,
      generation: { id: vacuous.generationId, task: "embed", via: "embed", epoch: vacuous.generationEpoch, space: vacuous.model },
    });
  };

  // THE EMBED-SPACE SWEEPS: `index` for card/image vectors, `databank-reindex` for document chunks and the memory
  // sweep for chat segments/digests, so every scope lands in the new target and search reads it.
  //   • `null` — an embed binding change: three GLOBAL BULK sweeps (`ownerId: null` spans every owner), the index
  //     pass FORCED, because a non-forced one no-ops on rows whose text hash still matches the old space.
  //   • a `UserId` — a seed bound that owner's encoder outside the binding verb: that owner's SINGULAR sweeps. None
  //     with the autoindex off: then nothing embeds in the background, no target is pinned, and search reads the
  //     live space with no migration to wait on.
  // `caller: null` is the trusted-system mode-gate bypass. Each enqueue runs in its own root span, and a duplicate
  // run (a kind already active → DomainConflictError) or any enqueue failure is logged there, never thrown at the
  // write that triggered it.
  const embedSweeps = (scope: UserId | null): readonly EmbedSweep[] => {
    if (scope !== null && !deps.corpusAutoindex) {
      return [];
    }
    const at = String(now());
    const mode = scope === null ? "bulk" : "singular";
    const sweep = (workloadKind: string, start: () => Promise<unknown>): EmbedSweep => ({
      requestId: `embed-reindex:${workloadKind}:${scope ?? "all"}:${at}`,
      attrs: { workloadKind },
      start,
    });
    return [
      sweep("index", () =>
        workloads.start({
          input: { kind: "index", params: scope === null ? { source: "all", force: true } : { source: "all" } },
          caller: null,
          mode,
          ownerId: scope,
        }),
      ),
      sweep("databank-reindex", () =>
        workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, caller: null, mode, ownerId: scope }),
      ),
      sweep("memory-backfill", () =>
        scope === null ? workloads.start({ input: { kind: "memory-backfill", params: {} }, caller: null, mode, ownerId: null }) : enqueueOwnerMemory(scope),
      ),
    ];
  };

  const enqueueEmbedReindex = async (scope: UserId | null): Promise<void> => {
    await Promise.all(embedSweeps(scope).map((s) => superviseSettled(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start)));
  };
  const detachEmbedReindex = (scope: UserId | null): void => {
    for (const s of embedSweeps(scope)) {
      superviseDetached(s.requestId, EMBED_REINDEX_SPAN, s.attrs, s.start);
    }
  };

  return {
    embeddings,
    indexer,
    persona,
    resolvePersonasForParticipants,
    presetCtx,
    preset,
    stats,
    search,
    discovery,
    notifications,
    workloads,
    enqueueEmbedReindex,
    detachEmbedReindex,
    vacuousMemoryReceipt,
    listCorpusOwners: () => distinctCorpusOwners(db),
  };
}
