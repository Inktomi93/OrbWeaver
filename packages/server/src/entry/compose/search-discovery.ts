// Composition seam for the derived-data cluster + the two broad-consumer singletons built in the same region:
// embeddings (+ its event-driven indexer and the corpusAutoindex bus subscription), the character.updated→chat
// fan, persona, preset (+ its portability ctx), stats, search, discovery, notifications, workloads, and the
// PD-139(a) embed-model-change → bulk purge+reindex enqueue. Owns no business logic — it wires each service's
// injected ops onto the already-built infra handles + sibling front doors.
//
// FORWARD-REFS this seam PRODUCES for earlier blocks: `persona` (the character seeder's createPersona +
// character block's persona reads deref it at request time) and `preset` (character's greeting-template resolver).
// The keystone threads those back as request-time getters. `workloads` is produced here and consumed by the
// keystone's `enqueueEmbedReindex` holder, databank, and portability — the keystone assigns the returned
// `enqueueEmbedReindex` onto its late-bound holder so the settings write's embed-model trigger fires it.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { AppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { personas as personasTable } from "@orb/db";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import { can, isAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import { resolveActiveDocumentIds } from "#domain/databank";
import type { DiscoveryContext, DiscoveryService } from "#domain/discovery";
import { createDiscoveryService } from "#domain/discovery";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import { createEmbeddingsIndexer, createEmbeddingsService } from "#domain/embeddings";
import type { NotificationsService } from "#domain/notifications";
import { createNotificationsService } from "#domain/notifications";
import type { PersonaContext, PersonaService, ResolvePersonasForRoster } from "#domain/persona";
import { createPersonaService, createResolvePersonasForRoster } from "#domain/persona";
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
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { withRequestSpan } from "#foundation/observability";
import type { RoleClientsWithSignal } from "#infra/providers";
import { requireAuthorOrHost, resolveTier0Range, setParticipantActivePersona } from "../../domain/chat";
import { publishUserEvent } from "../../transport/trpc";
import { createCharacterUpdatedChatFan } from "./emit-character-updated";
import type { DomainEventBus } from "./event-bus";
import { minter } from "./minter";

/** The embed-model-change reindex enqueue's own trace root. One name so the debug surface and any future
 *  filter agree; the two enqueues share it and are told apart by the `workloadKind` attribute. */
const EMBED_REINDEX_SPAN = "embeddings.modelChangeReindex";

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
  readonly roleClients: RoleClientsWithSignal;
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
  readonly emitChatEvent: (event: ChatBusEvent) => Promise<void>;
  /** ON ⇒ subscribe the indexer to the bus (embed-on-write); OFF ⇒ built-but-not-subscribed. */
  readonly corpusAutoindex: boolean;
  /** preset's ONE cross-feature op: the caller's chat-role capability, for `preset.resolveEffective`'s
   *  projection of the generation funnel. `connection` composes BEFORE this seam at the keystone, so it is a
   *  plain dep, not a forward-ref. */
  readonly resolveChatCapability: PresetContext["resolveChatCapability"];
  /** The LATE-BOUND workload contribution registry (assembled after chat, at the keystone) — the workloads
   *  verbs deref it per call as their per-kind params validator. */
  readonly getContributions: () => WorkloadContributions;
}

/** The cluster compose product. `enqueueEmbedReindex` is returned so the keystone can bind it onto its
 *  late-bound `onEmbedModelChanged` holder (the PD-139(a) trigger). */
export interface SearchDiscoveryComposeResult {
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS roster op — injected into the chat compose (the FOREIGN-inputs
   *  resolver's ONE room-plane persona read). Built from the SAME `PersonaContext` as the service. */
  readonly resolvePersonasForRoster: ResolvePersonasForRoster;
  readonly presetCtx: PresetContext;
  readonly preset: PresetService;
  readonly stats: StatsService;
  readonly search: SearchService;
  readonly discovery: DiscoveryService;
  readonly notifications: NotificationsService;
  readonly workloads: WorkloadService;
  readonly enqueueEmbedReindex: () => void;
}

export function buildSearchDiscovery(deps: SearchDiscoveryComposeDeps): SearchDiscoveryComposeResult {
  const { db, now, audit, roleClients, eventBus, character, assets, settings } = deps;

  const embeddings = createEmbeddingsService({
    db,
    roleClients,
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
    embedDim: env.VLLM_EMBED_DIM,
    imageEmbedDim: env.VLLM_EMBED_DIM,
  });

  const indexer = createEmbeddingsIndexer({
    store: embeddings.store,
    loadCardText: async (characterId): Promise<string | undefined> => (await character.loadCardText(characterId)) ?? undefined,
    // The embeddability gate reads the stored mime by id (reuses the un-principal `assetCasRefById` row lookup).
    loadAssetMime: async (assetId): Promise<string | null> => (await assets.assetCasRefById(assetId))?.mime ?? null,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    roleClients,
    embedDim: env.VLLM_EMBED_DIM,
    imageEmbedDim: env.VLLM_EMBED_DIM,
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
        default:
          return assertNeverEvent(event);
      }
    });
  }

  // Multi-human bridge: character.updated → chatUpdated on every chat where the character is currently
  // seated. Always-on (not gated on corpusAutoindex) — open-room freshness is orthogonal to the search knob.
  const fanCharacterUpdateToChats = createCharacterUpdatedChatFan(db, deps.emitChatEvent);
  eventBus.subscribe((event: DomainEvent): Promise<void> => {
    if (event.type === "character.updated") {
      return fanCharacterUpdateToChats(event.characterId);
    }
    return Promise.resolve();
  });

  // Named (not inlined into the service call) because TWO things are built from it: the Principal-scoped
  // `PersonaService` and the PRINCIPAL-LESS roster op (`domain/persona/contract/ops.ts`) the chat
  // FOREIGN-inputs resolver reads a room's personas through. One ctx, one home for the persona wiring.
  const personaCtx: PersonaContext = {
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
    audit,
    emitUserEvent: publishUserEvent,
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
  const resolvePersonasForRoster = createResolvePersonasForRoster(personaCtx);
  const presetCtx: PresetContext = {
    db,
    now,
    newPresetId: minter(ID_PREFIX.preset),
    audit,
    emitUserEvent: publishUserEvent,
    resolveChatCapability: deps.resolveChatCapability,
  };
  // Shared: the service + the portability `preset` descriptor (both write the domain's own `presets` table).
  const preset = createPresetService(presetCtx);
  const stats = createStatsService(db, now);
  // `resolveActiveDocumentIds` is databank's ONE scope-union home (05 §3.2) injected into search — the
  // documents lens never re-derives which documents a scope may see.
  const search = createSearchService({ db, roleClients, now, resolveActiveDocumentIds: (scope) => resolveActiveDocumentIds(db, scope) });
  const discovery = createDiscoveryService({
    db,
    now,
    newDuplicateCharacterPairId: minter(ID_PREFIX.duplicateCharacterPair),
    newThemeClusterId: minter(ID_PREFIX.themeCluster),
    newKeywordCooccurrenceId: minter(ID_PREFIX.keywordCooccurrence),
    newCharacterKeywordProfileId: minter(ID_PREFIX.characterKeywordProfile),
    newDuplicateChatPairId: minter(ID_PREFIX.duplicateChatPair),
    summarize: roleClients.summarize,
    summarizerModel: roleClients.summarizerModel,
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
        avatarHash: h.avatarHash,
        genre: h.genre,
        tone: h.tone,
        elevatorPitch: h.elevatorPitch,
      })),
    // The memory tier-grid seam (PD-39 tier-k) — chat/memory's fanOut math (ONE home) bound over the LIVE
    // AppSettings.memoryDefaults, the same source the digest build resolves per call.
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range(deps.getEffectiveConfig().memoryDefaults, tier, blockIdx),
  });
  const notifications = createNotificationsService({
    db,
    now,
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

  // PD-139(a): the embed-model-change → bulk purge+reindex enqueue. A box-level trigger: purge+reindex ALL
  // sources (force) as a GLOBAL BULK sweep. `caller: null` is a trusted system trigger (bypasses the mode gate);
  // `ownerId` is unused in bulk mode (the sweep spans every owner). The `index` runner covers character/image/
  // memory chunks; DOCUMENT chunks live in `document_chunks` and are re-embedded by a separate bulk
  // `databank-reindex` (chunk-embed) sweep — without it a model change strands every document chunk in the OLD
  // embed space (DBK-B(b)). Both are enqueued together; each is independent. Fire-and-forget: a duplicate run (a
  // kind is already active → DomainConflictError) or any enqueue failure is swallowed here — it must never fail
  // the settings write that triggered it (mirrors the `emitUserEvent` treatment in updateUserSettingsSection).
  // Each enqueue opens its OWN DETACHED root span: it outlives the settings write that triggered it, so a
  // parented span would be dropped as a late orphan and a failed enqueue (the reindex that never ran) would
  // be invisible on /api/_debug/traces. The absorbing `.catch` stays OUTSIDE the root, so the span still
  // records the error while the settings write is never faulted.
  const enqueueEmbedReindex = (): void => {
    const at = now();
    void withRequestSpan(`embed-reindex:index:${at}`, EMBED_REINDEX_SPAN, { workloadKind: "index" }, () =>
      workloads.start({ input: { kind: "index", params: { source: "all", force: true } }, caller: null, mode: "bulk", ownerId: null }),
    ).catch(() => undefined);
    void withRequestSpan(`embed-reindex:databank:${at}`, EMBED_REINDEX_SPAN, { workloadKind: "databank-reindex" }, () =>
      workloads.start({
        input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
        caller: null,
        mode: "bulk",
        ownerId: null,
      }),
    ).catch(() => undefined);
  };

  return {
    embeddings,
    indexer,
    persona,
    resolvePersonasForRoster,
    presetCtx,
    preset,
    stats,
    search,
    discovery,
    notifications,
    workloads,
    enqueueEmbedReindex,
  };
}
