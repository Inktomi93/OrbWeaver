// Build the derived-data and persona graph; runtime policies live behind their domain front doors.
// Workload admission is late-bound because chat contributes runners after this graph is constructed.

import type { DurableChatBusEvent, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { EveryOwnerRun } from "@orb/contracts/workloads";
import type { DatabaseHandle } from "@orb/db/wiring";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { PubSub } from "@orb/kit/pubsub";
import { can, isAdmin, isOwner, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import { createAssetEmbeddingReads } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import { createEmbeddableCardText, createLoadCharacterEmbeddingOwner } from "#domain/character";
import type { ChatBoundBackfillOps } from "#domain/chat";
import {
  consolidationHash,
  createCapturePersonaSeatsForDelete,
  createLiveTier0Range,
  createResolveStandingAsks,
  createResolveViewerVisibility,
  loadPresentHostUserId,
  requireAuthorOrHost,
  setParticipantActivePersona,
} from "#domain/chat";
import { resolveActiveDocumentIds, resolveActiveDocumentScope } from "#domain/databank";
import type { DiscoveryContext, DiscoveryService } from "#domain/discovery";
import { createDiscoveryService, createDossierNeighbors, distinctCorpusOwners } from "#domain/discovery";
import type { EmbeddingsContext, EmbeddingsIndexer, EmbeddingsService, ResolveEmbeddingConnection, VacuousMemoryReceipt } from "#domain/embeddings";
import {
  createEmbeddingReindexTriggers,
  createEmbeddingsIndexer,
  createEmbeddingsIndexerSubscription,
  createEmbeddingsService,
  createVacuousMemoryReceipt,
  precomputedSeedEmbedding,
} from "#domain/embeddings";
import type { NotificationsService } from "#domain/notifications";
import { createNotificationsService } from "#domain/notifications";
import type { JoinerPersonaStatementOp, PersonaContext, PersonaService, ResolvePersonasForParticipants } from "#domain/persona";
import {
  createJoinerPersonaStatement,
  createPersonaService,
  createRepointSeedsAfterPersonaDelete,
  createResolvePersonasForParticipants,
} from "#domain/persona";
import type { PresetContext, PresetService } from "#domain/preset";
import { createPresetService, createResolvePresetUsage } from "#domain/preset";
import { listGmPresetChatIds } from "#domain/rpg";
import type { FieldIndexCache, SearchService } from "#domain/search";
import { createDigestSources, createSearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import { createResolveUserProse } from "#domain/settings";
import type { StatsService } from "#domain/stats";
import { createStatsService } from "#domain/stats";
import type { TagService } from "#domain/tag";
import type { WorkloadContributions, WorkloadProgressBus, WorkloadService } from "#domain/workloads";
import { createWorkloadService } from "#domain/workloads";
import type { AuditEntry, DetachedSupervision, Logger } from "#foundation/observability";
import type { LiveBuses } from "#transport/trpc";
import { minter } from "./minter.ts";
import { createDeleteReachCapture, createRoomEntityFan } from "./room-reach.ts";
import { createVisibleRoomsReader } from "./visible-rooms.ts";

/** What the search/discovery cluster seam needs from the composition root. */
export interface SearchDiscoveryComposeDeps {
  readonly logger: Logger;
  readonly fieldIndex: Pick<FieldIndexCache, "fields" | "suggest">;
  readonly emitWorkloadEvent: WorkloadProgressBus["emitWorkloadEvent"];
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];

  readonly supervise?: DetachedSupervision["superviseDetached"] | undefined;
  readonly scheduleTimeout: EmbeddingsContext["scheduleTimeout"];
  readonly idSource: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** The per-FUNDER role-client binder (§8.5b): embeddings/search/discovery resolve the entity OWNER's rows
   *  (vector tasks are owner-scoped, §7.5) and the workload's acting user for the summarize passes. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly resolveEmbeddingConnection: ResolveEmbeddingConnection;
  readonly withStableEmbeddingBinding: EmbeddingsContext["withStableEmbeddingBinding"];
  readonly eventBus: PubSub<DomainEvent>;
  readonly attachCardTagByName: TagService["attachCardTagByName"];
  /** The card owner's Utility-role preset params (D299) — distill + analyze. */
  readonly resolveUtilityPresetParams: DiscoveryContext["resolveUtilityPresetParams"];
  readonly character: Pick<CharacterService, "listEmbeddableCharacterIds" | "loadCardText">;
  readonly assets: Pick<AssetsService, "listImageAssetIds" | "loadAssetBytes" | "assetCasRefById">;
  readonly settings: Pick<SettingsService, "loadUserSettings" | "updateUserSettingsSection">;
  /** LIVE effective-config getter (the memory tier-grid seam reads memoryDefaults per call). */
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  /** chat's bus durable-first emit — persona's active-persona write publishes onto it. */
  readonly emitChatEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** chat's DURABLE-APPEND-FREE fan (design §3.4) — the entity→room bridge's only emit surface. Separate dep
   *  from `emitChatEvent` because they are different lanes, not two spellings of one: this one writes no
   *  `chat_events` row and carries no seq. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
  /** preset's ONE cross-feature op: the caller's chat-role capability, for `preset.resolveEffective`'s
   *  projection of the generation funnel. `connection` composes BEFORE this seam at the keystone, so it is a
   *  plain dep, not a forward-ref. */
  readonly resolveChatCapability: PresetContext["resolveChatCapability"];
  /** The LATE-BOUND workload contribution registry (assembled after chat, at the keystone) — the workloads
   *  verbs deref it per call as their per-kind params validator. */
  readonly getContributions: () => WorkloadContributions;
  /** chat's memory-enabled read (LATE-BOUND: chat composes after this seam), for the memory-off receipt. */
  readonly isMemoryEnabled: (ownerId: UserId) => Promise<boolean>;
  readonly emptyMemoryScope: ChatBoundBackfillOps["emptyMemoryScope"];
}

/** The cluster compose product. `enqueueEmbedReindex` is returned so the keystone can bind it onto its
 *  late-bound embed-space-change holder (the trigger). */
export interface SearchDiscoveryComposeResult {
  readonly refreshAutoindex: () => void;
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS participants op — injected into the chat compose (the FOREIGN-inputs
   *  resolver's ONE room-plane persona read). Built from the SAME `PersonaContext` as the service. */
  readonly resolvePersonasForParticipants: ResolvePersonasForParticipants;
  /** D259 — the sign-up joiner's persona statement chat's signup batch runs. Built from the same `PersonaContext`. */
  readonly joinerPersonaStatement: JoinerPersonaStatementOp;
  readonly presetCtx: PresetContext;
  readonly preset: PresetService;
  readonly stats: StatsService;
  readonly search: SearchService;
  readonly discovery: DiscoveryService;
  readonly notifications: NotificationsService;
  readonly workloads: WorkloadService;
  /** Enqueue the embed-space sweeps: `null` for every owner, a `UserId` for that owner (a seed). Settles once
   *  every enqueue has; never rejects, because a failed enqueue is logged in its own span. */
  readonly enqueueEmbedReindex: (scope: UserId | null) => Promise<void>;
  /** {@link SearchDiscoveryComposeResult.enqueueEmbedReindex} for a trigger that must not wait on it: the same
   *  sweeps, started detached. */
  readonly detachEmbedReindex: (scope: UserId | null) => void;
  /** Boot's catch-up: the same sweeps for every owner whose stored generation is no longer the one their
   *  binding resolves to, started detached. No user action raised the trigger, so autoindex does not gate it. */
  readonly detachStaleSpaceReindex: () => void;
  /** An off or empty owner's current target receipt, including the empty present-host write fence. */
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<VacuousMemoryReceipt | null>;
  /** The bulk-pass announce audience — every owner with corpus rows, bound over this seam's `db`. Threaded
   *  into BOTH discovery's five analytics contributions and embeddings' `index` sweep as their
   *  `listCorpusOwners` op, so the box-wide arm's `corpusRecomputed` fan reaches every owner it touched
   *  (event-bus coverage survey §2.5/F6). Bound HERE, not at the caller, so the domain's own query stays
   *  behind the seam that owns discovery. */
  readonly listCorpusOwners: (run: EveryOwnerRun) => Promise<UserId[]>;
}

export function buildSearchDiscovery(deps: SearchDiscoveryComposeDeps): SearchDiscoveryComposeResult {
  const { db, now, audit, roleClientsFor, eventBus, character, assets, settings } = deps;
  const loadCharacterOwner = createLoadCharacterEmbeddingOwner(db);
  const loadCardText = createEmbeddableCardText((characterId) => character.loadCardText(characterId));
  const assetReads = createAssetEmbeddingReads(assets);
  const tier0RangeOf = createLiveTier0Range(deps.getEffectiveConfig);
  const embeddings = createEmbeddingsService({
    logger: deps.logger,
    scheduleTimeout: deps.scheduleTimeout,
    precomputedEmbedding: precomputedSeedEmbedding,
    ...assetReads,
    db,
    roleClientsFor,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
    resolveEmbeddingConnection: deps.resolveEmbeddingConnection,
    withStableEmbeddingBinding: deps.withStableEmbeddingBinding,
    now,
    newCharacterEmbeddingId: minter(ID_PREFIX.characterEmbedding, deps.idSource),
    newImageEmbeddingId: minter(ID_PREFIX.imageEmbedding, deps.idSource),
    newChatDigestId: minter(ID_PREFIX.chatDigest, deps.idSource),
    newChatSegmentId: minter(ID_PREFIX.chatSegment, deps.idSource),
    newDocumentChunkId: minter(ID_PREFIX.documentChunk, deps.idSource),
    listCharacterIds: character.listEmbeddableCharacterIds,
    loadCardText,
    listImageAssetIds: assets.listImageAssetIds,
    loadCharacterOwner,
    loadChatHostUserId: (chatId) => loadPresentHostUserId(db, chatId),
    // Every target move, from any caller (a write, a sweep, a sync after a re-point, boot), emptied that owner's
    // index: their forced sweeps refill it. Derefs the sweep starter below at call time, never during compose.
    onTargetGenerationMoved: (ownerId) => {
      reindex.detachRepointReindex(ownerId);
    },
    // A promotion ends the owner's search pause and moves the space every vector read uses. The member that refreshes
    // those reads is `corpusRecomputed`, and the last scope to finish may be one whose sweep announces nothing.
    onTargetPromoted: (ownerId) => {
      deps.emitUserEvent(ownerId, { type: "corpusRecomputed" });
    },
  });

  const indexer = createEmbeddingsIndexer({
    logger: deps.logger,
    indexAsset: embeddings.indexAsset,
    store: embeddings.store,
    loadCardText,
    loadCharacterOwner,
    roleClientsFor,
  });
  eventBus.subscribe(createEmbeddingsIndexerSubscription({ getEffectiveConfig: deps.getEffectiveConfig, indexer }));

  // THE ENTITY→ROOM BRIDGE (design §3.5): every content-affecting entity event → a live-only
  // `roomEntityChanged` on each room whose member-visible projection reads that entity. Always-on (not gated
  // on corpusAutoindex) — open-room freshness is orthogonal to the search knob, the shipped character fan's
  // own ruling. This subscriber REPLACES the `character.updated → durable chatUpdated` fan
  // (`emit-character-updated.ts`, deleted in the same commit): the member-card dialog now repaints, the
  // per-edit refetch narrows from the whole-room `chatUpdated` set to three reads, and the per-seated-room
  // `chat_events` INSERT is gone. A SECOND subscriber beside the indexer's, deliberately: the two consumers
  // have different filters (the indexer skips flag-only edits and is knob-gated) and the bus error-isolates
  // per subscriber, so a failing reach query can never cost an embedding.
  const fanEntityUpdateToRooms = createRoomEntityFan(db, deps.emitChatEventLive, deps.logger);
  eventBus.subscribe(fanEntityUpdateToRooms);

  // The DELETE half of the bridge (design §3.6 residual): a persona/book delete NULLs/cascades its seating
  // junctions, so the fan-on-event subscriber above resolves ∅ post-write. The delete verbs snapshot their
  // reach BEFORE the delete through this capture and fan the returned thunk after — same live-only emit surface.
  const deleteReachCapture = createDeleteReachCapture(db, deps.emitChatEventLive, deps.logger);

  // Named (not inlined into the service call) because TWO things are built from it: the Principal-scoped
  // `PersonaService` and the PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) the chat
  // FOREIGN-inputs resolver reads a room's personas through. One ctx, one home for the persona wiring.
  const personaCtx: PersonaContext = {
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona, deps.idSource),
    audit,
    emitUserEvent: deps.emitUserEvent,
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
    repointSeedsAfterPersonaDelete: createRepointSeedsAfterPersonaDelete({
      db,
      loadUserSettings: (ownerId) => settings.loadUserSettings(ownerId),
      writeSeeds: async (principal, patch) => {
        await settings.updateUserSettingsSection({ principal, input: { section: "seeds", patch } });
      },
    }),
    captureSeatsForDelete: createCapturePersonaSeatsForDelete({
      db,
      setActivePersona: (chatId, targetUserId, personaId) => setParticipantActivePersona(db, deps.emitChatEvent, { chatId, targetUserId, personaId }),
    }),
  };
  const persona = createPersonaService(personaCtx);
  const resolvePersonasForParticipants = createResolvePersonasForParticipants(personaCtx);
  const joinerPersonaStatement = createJoinerPersonaStatement(personaCtx);
  const presetCtx: PresetContext = {
    logger: deps.logger,
    db,
    now,
    newPresetId: minter(ID_PREFIX.preset, deps.idSource),
    audit,
    emitUserEvent: deps.emitUserEvent,
    resolveChatCapability: deps.resolveChatCapability,
    // The CONTEXT panel's backward-bindings read (#279): preset's rule over settings', rpg's and chat's facts.
    resolvePresetUsage: createResolvePresetUsage({
      loadUserSettings: deps.settings.loadUserSettings,
      listGmPresetChatIds: (presetId) => listGmPresetChatIds(db, presetId),
      resolveVisibleRooms: createVisibleRoomsReader(db),
    }),
  };
  // Shared: the service + the portability `preset` descriptor (both write the domain's own `presets` table).
  const preset = createPresetService(presetCtx);
  const stats = createStatsService(db, now, deps.idSource);
  // `resolveActiveDocumentIds` is databank's ONE scope-union home, injected into search — the
  // documents lens never re-derives which documents a scope may see.
  const search = createSearchService({
    logger: deps.logger,
    fieldIndex: deps.fieldIndex,
    resolveViewerVisibility: createResolveViewerVisibility({ db }),
    digestConsolidationHash: consolidationHash,
    tier0RangeOf,
    db,
    roleClientsFor,
    resolveEmbeddingConnection: deps.resolveEmbeddingConnection,
    now,
    resolveActiveDocumentIds: (scope) => resolveActiveDocumentIds(db, scope),
    resolveActiveDocumentScope: (scope) => resolveActiveDocumentScope(db, scope),
  });
  const discovery = createDiscoveryService({
    resolveDigestSources: createDigestSources({
      db,
      digestConsolidationHash: consolidationHash,
      tier0RangeOf,
    }),
    db,
    now,
    newDuplicateCharacterPairId: minter(ID_PREFIX.duplicateCharacterPair, deps.idSource),
    newThemeClusterId: minter(ID_PREFIX.themeCluster, deps.idSource),
    newKeywordCooccurrenceId: minter(ID_PREFIX.keywordCooccurrence, deps.idSource),
    newCharacterKeywordProfileId: minter(ID_PREFIX.characterKeywordProfile, deps.idSource),
    newDuplicateChatPairId: minter(ID_PREFIX.duplicateChatPair, deps.idSource),
    roleClientsFor,
    attachCardTagByName: deps.attachCardTagByName,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
    // PROSE-1 — the compare / ask / distill system prompts off the CARD OWNER's `UserSettings.prose` (the
    // same caller scoping imagery's template resolvers use: a library analysis is one human's request about
    // their own cards, not a room-level side generation). No override ⇒ the shipped prompts.
    resolveUserProse: createResolveUserProse((userId) => settings.loadUserSettings(userId)),
    writeHubScores: embeddings.writeHubScores,
    // discovery receives only the narrowed economics results — raw message_variants columns never cross the fence.
    characterEconomics: stats.characterEconomics,
    characterModelEconomics: stats.characterModelEconomics,
    // Discovery narrows injected search results to its content-only dossier surface.
    similar: createDossierNeighbors({ similarCharacters: (params) => search.similarCharacters(params) }),
    // The memory tier-grid seam (tier-k) — chat/memory's fanOut math (ONE home) bound over the LIVE
    // AppSettings.memoryDefaults, the same source the digest build resolves per call.
    tier0RangeOf,
  });
  const notifications = createNotificationsService({
    idSource: deps.idSource,
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
    emitEvent: deps.emitWorkloadEvent,
    db,
    getContributions: deps.getContributions,
    now,
    newWorkloadId: minter(ID_PREFIX.workload, deps.idSource),
    newScheduleId: minter(ID_PREFIX.workloadSchedule, deps.idSource),
    requireOwner,
    isOwner,
    isAdmin,
    emitUserEvent: deps.emitUserEvent,
  });

  // The memory receipt for an owner a sweep covers but builds no space for.
  const vacuousMemoryReceipt = createVacuousMemoryReceipt({ isMemoryEnabled: deps.isMemoryEnabled, emptyMemoryScope: deps.emptyMemoryScope, embeddings });

  const reindex = createEmbeddingReindexTriggers({
    logger: deps.logger,
    supervise: deps.supervise,
    now,
    getEffectiveConfig: deps.getEffectiveConfig,
    startWorkload: (params) => workloads.start(params),
    vacuousMemoryReceipt,
    purgeMemoryVectors: (params) => embeddings.purgeMemoryVectors(params),
    staleGenerationOwners: () => embeddings.staleGenerationOwners(),
  });
  return {
    refreshAutoindex: reindex.refreshAutoindex,
    embeddings,
    indexer,
    persona,
    resolvePersonasForParticipants,
    joinerPersonaStatement,
    presetCtx,
    preset,
    stats,
    search,
    discovery,
    notifications,
    workloads,
    enqueueEmbedReindex: reindex.enqueueEmbedReindex,
    detachEmbedReindex: reindex.detachEmbedReindex,
    detachStaleSpaceReindex: reindex.detachStaleSpaceReindex,
    vacuousMemoryReceipt,
    listCorpusOwners: (run) => distinctCorpusOwners(db, run),
  };
}
