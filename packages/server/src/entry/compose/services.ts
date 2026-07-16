// The composition root's service graph. `createServices` constructs every domain service with its DI
// bundle and wires every cross-feature injected op. Builds the infra handles (SecretBox/CAS/variant
// cache/image adapter/provider backend-registry), the in-process event bus, the boot-global owner
// RoleClients bundle, then every transport-facing service. Returns the `Services` bundle transport reads,
// plus the boot handles the lifecycle supervises/probes/wires.
//
// Determinism: `now` is an injected param (compose never calls Date.now()); id minters are built from
// mintTypeId/newId. Compose order: guards → sessions → settings → credentials → connection → roleClients
// → the leaf/heavy services. settings is built (and its effective-config cache warmed) before the infra
// backend-registry so the registry sources the admin-resolved vllmConcurrency from AppSettings.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { SessionView } from "@orb/contracts/session";
import type { BatchStmt, Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
  users,
} from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { AssetId, Handle, PersonaId, SessionId, TypeIdOf, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { can, createAdminService, isAdmin, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsContext, AssetsService } from "#domain/assets";
import { createAssetsService } from "#domain/assets";
import type { BuddyAgentResult, BuddyToolServer } from "#domain/buddy";
import { createBuddyService } from "#domain/buddy";
import type { DefaultCharacterSeeder } from "#domain/character";
import { createCharacterService, createDefaultCharacterSeeder } from "#domain/character";
import { createConnectionService } from "#domain/connection";
import { createCredentialsService } from "#domain/credentials";
import { createDiscoveryService } from "#domain/discovery";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import { createEmbeddingsIndexer, createEmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import { createHubService } from "#domain/hub";
import { createImageryService } from "#domain/imagery";
import { createNotificationsService } from "#domain/notifications";
import { createBulkImportPersonas, createPersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createPresetService } from "#domain/preset";
import { createSearchService } from "#domain/search";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import type { SettingsContext, SettingsServiceDeps } from "#domain/settings";
import { createSettingsContext, createSettingsService } from "#domain/settings";
import { applyStatsDelta, createStatsService, reconcileStats } from "#domain/stats";
import type { TagContext } from "#domain/tag";
import { createTagService } from "#domain/tag";
import { createToolUseService } from "#domain/tool-use";
import type { StartWorkloadInput, WorkloadRunnerEnv } from "#domain/workloads";
import { createWorkloadService } from "#domain/workloads";
import { createBulkImportLorebook, createCopyCharacterBooks, createImportStandaloneLorebook, createWorldInfoService } from "#domain/world-info";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { logAudit } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createImageAdapter } from "#infra/image";
import { fetchImageBytes, fetchOpenAiModels, fetchTenorGifImage, GIF_IMPORT_MAX_BYTES, searchTenorGifs } from "#infra/network";
import type { AgentToolSpec, BackendRegistryDeps, VllmEngineHandle } from "#infra/providers";
import {
  createAgentToolServer,
  createBackendRegistry,
  createProviderDiagnostics,
  createProviderExecutor,
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
} from "#infra/providers";
import { createCas, createVariantCache } from "#infra/storage";
import {
  createBulkImportChats,
  createChatBus,
  requireAuthorOrHost,
  requireHost,
  requireParticipant,
  resolveTier0Range,
  setParticipantActivePersona,
} from "../../domain/chat";
import { publishChatEvent, publishUserEvent } from "../../transport/trpc";
import type { Services } from "../../transport/trpc/context";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry";
import { createHostPrincipalResolver } from "../auth";
import type { DefaultPersonaSeeder } from "../boot";
import { createDefaultPersonaSeeder } from "../boot";
import { readSeedAvatar, readSeedGalleryPiece } from "../boot/seed-assets";
import type { ImportWorldInfoPort } from "../import";
import { buildChatService } from "./chat";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import { createCharacterUpdatedChatFan } from "./emit-character-updated";
import type { DomainEventBus } from "./event-bus";
import { createDomainEventBus } from "./event-bus";
import { buildPortabilityRegistry } from "./portability";
import { bindRoleClientsForUser } from "./role-clients";
import { buildWorkloadRunnerEnv } from "./runner-env";

/**
 * What boot supplies to stand up the whole service graph. `vllmDisabled` is the effective fact
 * (`env.VLLM_DISABLED || !gpuPresent`); compose derives its complement `vllmAvailable` for the connection
 * resolver's derive-role fallback. The vLLM `concurrency` is NOT a boot dep — it is sourced from settings'
 * resolved effective-config inside `createServices`.
 */
export interface ServicesDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly ownerId: UserId;
  readonly secretBoxKey: Buffer | null;
  readonly casDir: string;
  readonly variantDir: string;
  /** The staging root the upload route stages a zip under; absent ⇒ the OS temp dir (the same default the
   *  route resolves). */
  readonly importStagingDir?: string;
  /** The ST profile-directory snapshot `import-st`'s `importAll` reads; absent ⇒ repo-root `.st-data`. */
  readonly stProfileDir?: string;
  readonly sessionSecret: string | null;
  readonly vllmDisabled: boolean;
  readonly repoRoot?: string;
  readonly providerSeams?: Partial<BackendRegistryDeps>;
  /** This replica's stable lock-holder tag — must match the boot reclaim's match key. */
  readonly holder?: string;
}

/** What the composition root hands back: the transport `Services` bundle + the boot handles the lifecycle
 *  supervises/probes/wires. */
export interface ServicesResult {
  readonly services: Services;
  readonly presence: PresenceRegistry;
  readonly sessions: SessionsService;
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly assets: AssetsService;
  readonly exportService: ExportService;
  readonly portability: PortabilityRegistry;
  readonly importWorldInfo: ImportWorldInfoPort;
  readonly eventBus: DomainEventBus;
  readonly runnerEnv: WorkloadRunnerEnv;
  readonly roleClients: RoleClients;
  /** The per-owner `RoleClients` binder, pre-bound to the connection service + the executor. The workloads
   *  worker's `bindRoleClients` is wired from this; entry never touches the raw executor. */
  readonly bindRoleClients: (ownerId: UserId) => Promise<RoleClients>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly effectiveConfig: EffectiveConfigWiring;
  readonly secretBox: SecretBox;
  readonly vllmEngine: VllmEngineHandle | null;
  /** The default-card seeder — the one instance both boot and the app first-request hook share, so the
   *  in-process memo + persisted latch hold across both call sites. */
  readonly characterSeeder: DefaultCharacterSeeder;
  /** Mirrors `characterSeeder`, for the default "You" persona. */
  readonly personaSeeder: DefaultPersonaSeeder;
}

function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

/** Exhaustiveness guard for the closed `DomainEvent` union — a new event member without a bus route is a
 *  tsc error here, not a silent drop. */
function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

/** Construct the full service graph + the boot handles. Async: the boot-global `RoleClients` bundle
 *  resolves each derive-role's connection once before the consumers that require it are built. */
export async function createServices(deps: ServicesDeps): Promise<ServicesResult> {
  const { db, now } = deps;
  const presence = createPresenceRegistry(now);

  const audit = (entry: AuditEntry, at: number): Promise<void> => logAudit(db, entry, at);
  const newUserId = (): UserId => newId<UserId>();
  const eventBus = createDomainEventBus();

  const sessions = createSessionsService({ db, now, sessionSecret: deps.sessionSecret });
  const settingsDeps: SettingsServiceDeps = {
    db,
    now,
    audit,
    requireAdmin,
    requireOwner,
    newThemeId: minter(ID_PREFIX.theme),
    emitUserEvent: publishUserEvent,
  };
  const settings = createSettingsService(settingsDeps);
  const settingsCtx: SettingsContext = createSettingsContext(settingsDeps);

  // Warm the resolved-config cache from the stored override so the sync getEffectiveConfig() returns the
  // floor⊕override config (incl. vllmConcurrency) before the registry reads it.
  const effectiveConfig = createEffectiveConfigWiring(settings);
  await effectiveConfig.reload();
  const resolved = effectiveConfig.getEffectiveConfig();

  const registry = createBackendRegistry({
    ...(deps.providerSeams ?? {}),
    now,
    vllmDisabled: deps.vllmDisabled,
    vllmConcurrency: {
      embed: resolved.vllmConcurrency.embed,
      summarize: resolved.vllmConcurrency.summarize,
    },
    ...(deps.repoRoot !== undefined ? { repoRoot: deps.repoRoot } : {}),
  });
  const executor = createProviderExecutor({ backends: registry.backends });
  const diagnostics = createProviderDiagnostics({ backends: registry.backends });
  const secretBox = createSecretBox(deps.secretBoxKey);
  const cas = createCas(deps.casDir);
  const variants = createVariantCache(deps.variantDir);
  const imageAdapter = createImageAdapter();
  const passwordHasher = createPasswordHasher(deps.sessionSecret);

  const credentials = createCredentialsService({
    db,
    now,
    newCredentialId: minter(ID_PREFIX.userCredential),
    box: secretBox,
    requireOwner,
    probe: (credential): Promise<CredentialHealth> => diagnostics.probe({ credential }),
    inspect: (req): Promise<EndpointInspection> => diagnostics.inspect(req),
    fetchModels: fetchOpenAiModels,
    audit,
    emitUserEvent: publishUserEvent,
  });
  const vllmAvailable = !deps.vllmDisabled;
  const connection = createConnectionService({
    db,
    now,
    resolveCredential: (params): Promise<ResolvedCredential> => credentials.resolve(params),
    fetchOrCatalog: diagnostics.fetchOrCatalog,
    fetchAgentSdkModels: diagnostics.fetchAgentSdkModels,
    loadUserSettings: settings.loadUserSettings,
    verifyClaudeAuth: (req): Promise<VerifyAuthResult> => diagnostics.verifyAuth(req),
    accountCredits: (req): Promise<AccountCredits> => diagnostics.accountCredits(req),
    generationCost: (req): Promise<GenerationCost> => diagnostics.generationCost(req),
    vllmAvailable,
    // A display fact for the Connections picker; the resolver keeps deriving via its own empty-model
    // pass-through, so this is never stamped.
    localLightDefaults: {
      embed: DEFAULT_EMBED_MODEL,
      imageEmbed: DEFAULT_IMAGE_EMBED_MODEL,
      rerank: DEFAULT_RERANK_MODEL,
    },
    isOwner: (principal) => {
      try {
        requireOwner(principal);
        return true;
      } catch {
        return false;
      }
    },
  });

  const bindRoleClients = (ownerId: UserId): Promise<RoleClients> => bindRoleClientsForUser({ connection, executor }, ownerId);
  const roleClients = await bindRoleClients(deps.ownerId);

  // Built before character so character's by-name card-tag attach port wires to the real tag verb.
  const tagCtx: TagContext = {
    db,
    newTagId: minter(ID_PREFIX.tag),
    requireParticipant: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    // Tag is clockless (rows born-stamp via SQL default), so the audit timestamp is pre-bound here.
    audit: (entry): Promise<void> => audit(entry, now()),
    emitUserEvent: publishUserEvent,
  };
  const tag = createTagService(tagCtx);

  // Captured as a named const so the portability registry's gallery descriptor can reuse it.
  const assetsCtx: AssetsContext = {
    db,
    cas,
    variants,
    imageTransform: imageAdapter.transform,
    emit: eventBus.emit,
    now,
    newAssetId: minter(ID_PREFIX.asset),
    newGalleryItemId: minter(ID_PREFIX.galleryItem),
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
    // Roster-avatar reference-check, not a hash→any-owner oracle. Returns an owner only if `hash` is the
    // asset-hash of the `avatarAssetId` of either (a) a character currently rostered in a chat where
    // `callerId` is a present member, or (b) a persona that is a present human participant's
    // `activePersonaId` in a chat where `callerId` is also present (a co-participant's own persona avatar
    // in a shared group chat). Returns `assets.ownerId` (the CAS bytes live in the asset owner's partition).
    loadCoParticipantOwner: async (callerId, hash) => {
      const rosterChar = alias(chatParticipants, "roster_char");
      const callerSeat = alias(chatParticipants, "caller_seat");
      const characterRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
        .innerJoin(rosterChar, and(eq(rosterChar.characterId, charactersTable.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (characterRows[0] !== undefined) {
        return characterRows[0].ownerId;
      }

      const personaSeat = alias(chatParticipants, "persona_seat");
      const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
      const personaRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
        .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personasTable.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
        .innerJoin(
          personaCallerSeat,
          and(eq(personaCallerSeat.chatId, personaSeat.chatId), eq(personaCallerSeat.userId, callerId), isNull(personaCallerSeat.leftSeq)),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (personaRows[0] !== undefined) {
        return personaRows[0].ownerId;
      }

      // Attachment arm: the hash is an asset structurally referenced by a message_assets row for a message
      // in a chat where both the caller and the asset's owner are present participants.
      const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
      const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
      const attachmentRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
        .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
        .innerJoin(
          attachCallerSeat,
          and(eq(attachCallerSeat.chatId, messagesTable.chatId), eq(attachCallerSeat.userId, callerId), isNull(attachCallerSeat.leftSeq)),
        )
        .innerJoin(
          attachOwnerSeat,
          and(eq(attachOwnerSeat.chatId, messagesTable.chatId), eq(attachOwnerSeat.userId, assetsTable.ownerId), isNull(attachOwnerSeat.leftSeq)),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      return attachmentRows[0]?.ownerId;
    },
    // Chat-scoped resolver a present viewer uses to render inline attachments: a pair is returned only
    // when the asset has a message_assets row for a message in `chatId` AND both owner and caller are
    // present participants. Membership alone is not sufficient — the message_assets FK is the reference.
    loadChatAssetRefs: async (callerId, forChatId, assetIds) => {
      if (assetIds.length === 0) {
        return [];
      }
      const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
      const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
      const rows = await db
        .selectDistinct({ assetId: assetsTable.id, hash: assetsTable.hash })
        .from(assetsTable)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
        .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, messagesTable.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .innerJoin(ownerSeat, and(eq(ownerSeat.chatId, messagesTable.chatId), eq(ownerSeat.userId, assetsTable.ownerId), isNull(ownerSeat.leftSeq)))
        .where(and(eq(messagesTable.chatId, forChatId), inArray(assetsTable.id, [...assetIds])));
      return rows;
    },
  };
  const assets = createAssetsService(assetsCtx);
  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),
    audit,
    emit: eventBus.emit,
    emitUserEvent: publishUserEvent,
    // Best-effort: remove/bulk-remove wrap it in try/catch, so a reap failure never fails the delete —
    // the orphan self-heals on the next collectGarbage sweep.
    reapAssets: async (assetIds): Promise<void> => {
      await assets.reapIfOrphan(assetIds);
    },
    attachCardTag: tag.attachCardTagByName,
    detachCardTag: tag.detachCardTagByName,
    // PD-141: world-info owns the character_books junction — the duplicate carry is its persistence factory,
    // wired here directly (world-info's full service composes after chat, below).
    copyCharacterBooks: createCopyCharacterBooks({ db, now }),
  });

  const hub = createHubService({
    searchGifs: searchTenorGifs,
    fetchGifImage: async (url) => {
      const { bytes, image } = await fetchTenorGifImage(url);
      return { bytes, mime: image.mime };
    },
    resolveGifKey: (principal) => credentials.resolveGifSearchKey({ principal }),
    storeGalleryAsset: async ({ principal, bytes, mime }) => {
      const stored = await assets.store({
        principal,
        bytes,
        kind: "gallery",
        mime,
        enforceMagic: true,
        maxBytes: GIF_IMPORT_MAX_BYTES,
      });
      return { assetId: stored.assetId };
    },
    addToGallery: (args) => assets.addToGallery(args),
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
  });

  // The live assets ctx extended with the two character-handle resolvers the gallery export/import verbs
  // need. Wired after `character` so the forward reference resolves.
  const galleryCtx: AssetsContext = {
    ...assetsCtx,
    resolveCharacterHandle: async (characterId): Promise<string | null> => {
      const rows = await db.select({ handle: charactersTable.handle }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(1);
      return rows[0]?.handle ?? null;
    },
    findCharacterByHandle: async ({ ownerId, handle }) => {
      const ref = await character.findByHandle({ ownerId, handle });
      return ref?.characterId ?? null;
    },
  };

  // The one idempotent instance boot + the app first-request hook share.
  const characterSeeder = createDefaultCharacterSeeder({
    characters: character,
    attachCardTag: ({ ownerId, characterId, tagName }): Promise<boolean> =>
      tag.attachCardTagByName({ ownerId, characterId, tagName, source: "card", status: "pending" }),
    // A missing bundled file / store hiccup returns null → the card seeds avatar-less (never blocks the seed).
    storeAvatar: async (principal, handle): Promise<AssetId | null> => {
      const art = await readSeedAvatar(handle);
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    seedGallery: async (principal, characterId, handle): Promise<void> => {
      const avatarArt = await readSeedAvatar(handle);
      if (avatarArt !== null) {
        const avatarAsset = await assets.store({
          principal,
          bytes: avatarArt.bytes,
          kind: "avatar",
          mime: avatarArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal,
          assetId: avatarAsset.assetId,
          subjectCharacterId: characterId,
        });
      }
      const galleryArt = await readSeedGalleryPiece(handle);
      if (galleryArt !== null) {
        const galleryAsset = await assets.store({
          principal,
          bytes: galleryArt.bytes,
          kind: "gallery",
          mime: galleryArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal,
          assetId: galleryAsset.assetId,
          subjectCharacterId: characterId,
        });
      }
    },
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultCharactersSeeded,
    markSeeded: async (principal, welcomeAssistantId): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultCharactersSeeded: true } },
      });
      if (welcomeAssistantId !== null) {
        const current = (await settings.getUserSettings({ principal })).config;
        if (current.seeds.welcomeAssistantCharacterId === null) {
          await settings.updateUserSettingsSection({
            principal,
            input: { section: "seeds", patch: { welcomeAssistantCharacterId: welcomeAssistantId } },
          });
        }
      }
    },
  });

  // Mirror of characterSeeder, for the default "You" persona.
  const personaSeeder = createDefaultPersonaSeeder({
    createPersona: async ({ principal, input }): Promise<{ id: PersonaId }> => {
      const detail = await persona.create({ principal, input });
      return { id: detail.id };
    },
    storeAvatar: async (principal): Promise<AssetId | null> => {
      const art = await readSeedAvatar("persona-you");
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded,
    markSeeded: async (principal, seededPersonaId): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultPersonaSeeded: true } },
      });
      if (seededPersonaId !== null) {
        const current = (await settings.getUserSettings({ principal })).config;
        const patch: { defaultPersonaId?: PersonaId; currentPersonaId?: PersonaId } = {};
        if (current.seeds.defaultPersonaId === null) {
          patch.defaultPersonaId = seededPersonaId;
        }
        if (current.seeds.currentPersonaId === null) {
          patch.currentPersonaId = seededPersonaId;
        }
        if (Object.keys(patch).length > 0) {
          await settings.updateUserSettingsSection({
            principal,
            input: { section: "seeds", patch },
          });
        }
      }
    },
  });

  const embeddings = createEmbeddingsService({
    db,
    roleClients,
    now,
    newCharacterEmbeddingId: minter(ID_PREFIX.characterEmbedding),
    newImageEmbeddingId: minter(ID_PREFIX.imageEmbedding),
    newChatDigestId: minter(ID_PREFIX.chatDigest),
    newChatSegmentId: minter(ID_PREFIX.chatSegment),
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
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    roleClients,
    embedDim: env.VLLM_EMBED_DIM,
    imageEmbedDim: env.VLLM_EMBED_DIM,
  });
  // OFF ⇒ the indexer is built but not subscribed (a clean boot with no embed-on-write). Distinct from
  // memoryDefaults.mode (chat digests) — two separate knobs.
  if (resolved.corpusAutoindex) {
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

  // The one chat bus, built early (persona composes before buildChatService — chat needs persona.get for
  // turn assembly, a genuine cycle) and threaded into both persona's write and buildChatService.
  const chatBus = createChatBus({ db, now, newEventId: minter(ID_PREFIX.chatEvent) });
  const emitChatEvent = async (event: ChatBusEvent): Promise<void> => {
    const seq = await chatBus.emit(event);
    publishChatEvent({ seq, event });
  };

  // Multi-human bridge: character.updated → chatUpdated on every chat where the character is currently
  // seated. Always-on (not gated on corpusAutoindex) — open-room freshness is orthogonal to the search knob.
  const fanCharacterUpdateToChats = createCharacterUpdatedChatFan(db, emitChatEvent);
  eventBus.subscribe((event: DomainEvent): Promise<void> => {
    if (event.type === "character.updated") {
      return fanCharacterUpdateToChats(event.characterId);
    }
    return Promise.resolve();
  });

  const persona = createPersonaService({
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
    audit,
    emitUserEvent: publishUserEvent,
    requireChatAuthorOrHost: async (principal, chatId, targetUserId) => {
      await requireAuthorOrHost({ db, can }, principal, chatId, targetUserId);
    },
    setChatActivePersona: async (chatId, targetUserId, personaId) => {
      await setParticipantActivePersona(db, emitChatEvent, { chatId, targetUserId, personaId });
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
  });
  const presetCtx: PresetContext = {
    db,
    now,
    newPresetId: minter(ID_PREFIX.preset),
    audit,
    emitUserEvent: publishUserEvent,
  };
  // Shared: the service + the portability `preset` descriptor (both write the domain's own `presets` table).
  const preset = createPresetService(presetCtx);
  const stats = createStatsService(db);
  const search = createSearchService({ db, roleClients, now });
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
    attachCardTagByName: tag.attachCardTagByName,
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
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range(effectiveConfig.getEffectiveConfig().memoryDefaults, tier, blockIdx),
  });
  const notifications = createNotificationsService({
    db,
    now,
    // An agent principal has no inbox, so record refuses it. A missing row ⇒ false.
    isAgentRecipient: async (userId) => {
      const rows = await db.select({ kind: users.kind }).from(users).where(eq(users.id, userId)).limit(1);
      return rows[0]?.kind === "agent";
    },
  });
  const workloads = createWorkloadService({
    db,
    now,
    newWorkloadId: minter(ID_PREFIX.workload),
    newScheduleId: minter(ID_PREFIX.workloadSchedule),
    requireOwner,
    isAdmin,
  });

  const admin = createAdminService({
    db,
    now,
    newUserId,
    hashPassword: passwordHasher.hash,
    audit,
    sessions: {
      // SessionView deliberately omits userId; re-stamp it onto each row.
      listForUser: async (userId: UserId): Promise<readonly (SessionView & { userId: UserId })[]> => {
        const views = await sessions.listForUser(userId);
        return views.map((view): SessionView & { userId: UserId } => ({ ...view, userId }));
      },
      revoke: (sessionId: string): Promise<void> => sessions.revoke(castId<SessionId>(sessionId)),
      revokeAllForUser: (userId: UserId): Promise<number> => sessions.revokeAllForUser(userId),
    },
    vllm: {
      allEngineStatuses: (): ReturnType<VllmEngineHandle["status"]> => (registry.vllmEngine === null ? {} : registry.vllmEngine.status()),
      restartEngine: (name: string): Promise<string> =>
        registry.vllmEngine === null
          ? Promise.resolve("vllm supervisor not running")
          : registry.vllmEngine.restart(name as Parameters<VllmEngineHandle["restart"]>[0]),
    },
    embed: {
      embedCharacterCard: async (principal, characterId): Promise<boolean> => {
        const card = await character.getCard({ principal, characterId });
        if (card === null) {
          return false;
        }
        const text = await character.loadCardText(characterId);
        if (text === null || text.length === 0) {
          return false;
        }
        await embeddings.store({
          kind: "card",
          lens: "card-text",
          characterId,
          content: text,
          model: roleClients.embedModel,
          dim: env.VLLM_EMBED_DIM,
        });
        return true;
      },
    },
  });

  const buddy = createBuddyService({
    db,
    now,
    newTurnId: minter(ID_PREFIX.buddyTurn),
    newProposalId: minter("buddy_proposal"),
    resolveAgentConnection: ({ principal }): Promise<ResolvedConnection> => connection.resolveRole({ role: "agent", principal }),
    agentTurn: async (req): Promise<BuddyAgentResult> => {
      const orSkinTierModels = req.credential.source === "openrouter" ? await connection.getOrSkinTierModels() : undefined;
      const result = await executor.runAgentTurn({
        credential: req.credential,
        model: req.model,
        systemPrompt: req.systemPrompt,
        prompt: req.prompt,
        mcpServer: req.toolServer,
        ...(orSkinTierModels !== undefined ? { orSkinTierModels } : {}),
        ...(req.maxTurns !== undefined ? { maxTurns: req.maxTurns } : {}),
        ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(req.maxContextTokens !== undefined ? { maxContextTokens: req.maxContextTokens } : {}),
        ...(req.signal !== undefined ? { signal: req.signal } : {}),
      });
      return { text: result.reply };
    },
    // BuddyToolSpec mirrors AgentToolSpec by design; the cast bridges the readonly-array nominal gap only.
    buildToolServer: (tools): BuddyToolServer => createAgentToolServer({ tools: tools as readonly AgentToolSpec[] }),
    roleClients,
    agentEnv: {
      startWorkload: async ({ ownerId, kind }): Promise<{ readonly workloadId: WorkloadId }> => {
        const input: StartWorkloadInput = kind === "find-duplicates" ? { kind: "find-duplicates", params: {} } : { kind: "index", params: { source: "all" } };
        // A trusted internal trigger — caller:null bypasses the mode gate; singular on the agent's owning
        // user (never a global bulk bypass).
        const started = await workloads.start({ input, caller: null, mode: "singular", ownerId });
        return { workloadId: started.id };
      },
    },
  });

  const exportService = createExportService({ db, cas, imageTransform: imageAdapter.transform });

  const imagery = createImageryService({
    db,
    now,
    newGenerationId: minter(ID_PREFIX.imageryGeneration),
    resolveGenerateImage: async (caller) => {
      const conn = await connection.resolveRole({ role: "generateImage", principal: caller });
      return { connection: conn, capability: conn.capability };
    },
    generateImage: (req) => executor.generateImage(req),
    fetchImage: (url) => fetchImageBytes(url, effectiveConfig.getEffectiveConfig().maxImageBytes),
    storeAsset: (caller, bytes, kind, mime) => assets.store({ principal: caller, bytes, kind, mime, enforceMagic: true }),
    recordStats: async (delta): Promise<void> => {
      const batch: BatchStmt[] = [];
      applyStatsDelta(batch, db, delta);
      if (batch.length > 0) {
        await db.batch(batchMany(batch));
      }
    },
  });

  // Chat is built last — it injects every service built above, the widest DI bundle in the system.
  const toolUse = createToolUseService({ can, clock: now });

  const chatCompose = buildChatService({
    toolUse,
    db,
    now,
    emitChatEvent,
    holder: deps.holder ?? "replica-default",
    sessionSecret: deps.sessionSecret,
    resolveHostPrincipal: createHostPrincipalResolver(sessions),
    audit,
    can,
    roleClients,
    connection,
    credentials,
    character,
    persona,
    preset,
    settings,
    notifications,
    search,
    assets,
    embeddings,
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    provisionAgentPrincipal: (params) => sessions.provisionAgentPrincipal(params),
    runChatTurn: executor.runChatTurn,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
  });
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;

  // Built after chat — world-info's chat scope injects chat's membership guards + the chat bus emit.
  const worldInfo = createWorldInfoService({
    db,
    now,
    newBookId: minter(ID_PREFIX.worldBook),
    newEntryId: minter(ID_PREFIX.worldEntry),
    audit,
    requireChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    requireChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    emitWiEvent: emitChatBusEvent,
    emitUserEvent: publishUserEvent,
  });

  // Wired here so the live card-import path actually writes an imported card's embedded character_book.
  const importWorldInfo: ImportWorldInfoPort = {
    importLorebook: createBulkImportLorebook({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
  };

  const bulkImportChats = createBulkImportChats({
    db,
    now,
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newMessageAssetId: minter(ID_PREFIX.messageAsset),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    // The bundle's assets entity imports first, so a bundled inline attachment exists by the time chats
    // import; this filters an imported message's asset refs to the ones that landed.
    filterExistingAssetIds: async (ownerId, assetIds) => (await assets.resolveOwnedAssetRefs(ownerId, assetIds)).map((r) => r.assetId),
  });
  const bulkImportPersonas = createBulkImportPersonas({
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
  });
  const resolveOwnerPrincipal = createHostPrincipalResolver(sessions);
  // Shared by the zip-bundle portability descriptors AND the ST profile-directory importer (runnerEnv below).
  type ImportOwnerOp = (args: { readonly ownerId: UserId }) => Promise<void>;
  const enqueueImportBackfill: ImportOwnerOp = async ({ ownerId }) => {
    await workloads.start({
      input: { kind: "memory-backfill", params: {} },
      caller: null,
      mode: "singular",
      ownerId,
    });
  };
  const reconcileImportStats: ImportOwnerOp = async ({ ownerId }) => {
    await reconcileStats(db, { ownerId, now });
  };
  const portability = buildPortabilityRegistry({
    db,
    now,
    tagCtx,
    settingsCtx,
    presetCtx,
    worldInfoExportCtx: { db },
    importStandaloneLorebook: createImportStandaloneLorebook({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
    assetsCtx: galleryCtx,
    persona,
    exportService,
    character,
    listOwnedCharacterIds: character.listEmbeddableCharacterIds,
    storeAvatar: assets.store,
    attachCardTag: tag.attachCardTagByName,
    importLorebook: importWorldInfo.importLorebook,
    bulkImportChats,
    bulkImportPersonas,
    enqueueBackfill: enqueueImportBackfill,
    reconcileImportStats,
    resolveOwnerPrincipal,
  });

  // Built after chat + portability's import ports — the memory/group-character sweeps are chat-ctx-bound ops
  // off the chat compose product; `import.importAll` composes the profile-dir importer's cross-feature slice.
  const runnerEnv = buildWorkloadRunnerEnv({
    db,
    now,
    cas,
    discovery,
    connection,
    embeddings,
    assets,
    memoryBackfill: chatCompose.backfill.memory,
    groupCharacterBackfill: chatCompose.backfill.groupCharacters,
    // Lazy: this thunk derefs the registry at run time (it's already assembled just above, but the bundle op
    // reads it lazily by contract).
    getPortabilityRegistry: () => portability,
    ...(deps.importStagingDir !== undefined ? { importStagingDir: deps.importStagingDir } : {}),
    ...(deps.stProfileDir !== undefined ? { stProfileDir: deps.stProfileDir } : {}),
    profileImport: {
      character,
      storeAvatar: assets.store,
      attachCardTag: tag.attachCardTagByName,
      importLorebook: importWorldInfo.importLorebook,
      bulkImportChats,
      bulkImportPersonas,
      enqueueBackfill: enqueueImportBackfill,
      reconcileImportStats,
      resolveOwnerPrincipal,
    },
  });

  const services: Services = {
    admin,
    assets,
    buddy,
    character,
    chat,
    connection,
    credentials,
    discovery,
    hub,
    notifications,
    persona,
    preset,
    search,
    settings,
    stats,
    tag,
    workloads,
    worldInfo,
  };

  return {
    services,
    presence,
    sessions,
    embeddings,
    indexer,
    assets,
    exportService,
    portability,
    importWorldInfo,
    eventBus,
    runnerEnv,
    roleClients,
    bindRoleClients,
    audit,
    effectiveConfig,
    secretBox,
    vllmEngine: registry.vllmEngine,
    characterSeeder,
    personaSeeder,
  };
}
