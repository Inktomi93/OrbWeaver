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

import { randomUUID } from "node:crypto";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import { databankSettingsSchema } from "@orb/contracts/databank";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { InvocationChat, PluginHandlerRef } from "@orb/contracts/plugin";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { SessionView } from "@orb/contracts/session";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import { listSeededBackgrounds } from "@orb/contracts/theme";
import type { BatchStmt, Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
} from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, Handle, PersonaId, SessionId, TypeIdOf, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AdminEngineStatus } from "#domain/admin";
import { can, createAdminService, isAdmin, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsContext, AssetsService } from "#domain/assets";
import { createAssetsService } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import {
  createArmExecutors,
  createAutomationService,
  createEnabledRuleIndex,
  createPluginSubscriberRegistry,
  createPromptTransformIndex,
  loadPresentHumanMemberIds,
} from "#domain/automation";
import type { DefaultCharacterSeeder } from "#domain/character";
import { createCharacterService, createDefaultCharacterSeeder } from "#domain/character";
import { createExtractQuiet, createResolveViewerVisibility, loadPresentRole } from "#domain/chat";
import { createConnectionService } from "#domain/connection";
import { createCredentialsService } from "#domain/credentials";
import type { DatabankContext, DatabankIngest } from "#domain/databank";
import { createDatabankIngest, createDatabankService, resolveActiveDocumentIds } from "#domain/databank";
import { createDiscoveryService } from "#domain/discovery";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import { createEmbeddingsIndexer, createEmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import type { ImageryWarning } from "#domain/imagery";
import { createImageryService, imageryToolDefinitions } from "#domain/imagery";
import { createNotificationsService } from "#domain/notifications";
import { createBulkImportPersonas, createPersonaService } from "#domain/persona";
import type { PluginHostOps, PluginHostPort } from "#domain/plugin";
import { buildPluginPromptTransform, buildPluginStorage, capFactContent, createPluginService } from "#domain/plugin";
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
import type { WorkloadRunnerEnv } from "#domain/workloads";
import { createWorkloadService } from "#domain/workloads";
import {
  createBulkImportLorebook,
  createCopyCharacterBooks,
  createImportStandaloneLorebook,
  createLinkCarriedBooks,
  createWorldInfoService,
} from "#domain/world-info";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { isWireCaptureEnabled, logAudit, recordWireCapture } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText, EXTRACTOR_VERSION } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { fetchImageBytes, fetchOpenAiModels, fetchWebDocument } from "#infra/network";
import { createPluginHost } from "#infra/plugin-host";
import type { BackendRegistryDeps, EngineDeploymentFacts, RoleClientsWithSignal, VllmEngineHandle } from "#infra/providers";
import {
  createBackendRegistry,
  createProviderDiagnostics,
  createProviderExecutor,
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
  fetchEngineMaxModelLen,
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
import { publishAutomationEvent, publishChatEvent, publishNotification, publishUserEvent } from "../../transport/trpc";
import type { Services } from "../../transport/trpc/context";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry";
import { createHostPrincipalResolver } from "../auth";
import type { DefaultPersonaSeeder } from "../boot";
import { createDefaultPersonaSeeder } from "../boot";
import { readSeedAvatar, readSeedGalleryPiece } from "../boot/seed-assets";

import type { ImportWorldInfoPort } from "../import";
import { createAutomationOps } from "./automation-watcher";
import { buildChatService } from "./chat";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import { createCharacterUpdatedChatFan } from "./emit-character-updated";
import type { DomainEventBus } from "./event-bus";
import { createDomainEventBus } from "./event-bus";
import { createMaterializeBackground } from "./materialize-background";
import { loadPluginMessages } from "./plugin-chat-reads";
import { buildPortabilityRegistry } from "./portability";
import { bindRoleClientsForUser } from "./role-clients";
import { buildWorkloadRunnerEnv } from "./runner-env";

/** The infra `WarningCode` members that are imagery's concern (mapped onto `ImageryWarning` at the generateImage
 *  op): the whole edit strip (`image_edit_dropped`). The resolve-chat knob codes (sampling/effort/etc.) are not
 *  imagery's and drop. A guard (not a bare `Set.has`) so `w.code` narrows to `ImageryWarning["code"]` — the
 *  mapped result then satisfies the domain result type. */
const IMAGERY_WARNING_CODES = new Set<string>(["image_edit_dropped"]);
function isImageryWarningCode(code: string): code is ImageryWarning["code"] {
  return IMAGERY_WARNING_CODES.has(code);
}

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
  /** Force the rpg flight recorder on (R-OBS), independent of `env.RPG_TRACE` — the drive kit / a trace int test
   *  passes `true` so it never depends on the ambient env. Absent ⇒ `env.RPG_TRACE === "on"` decides. */
  readonly rpgTrace?: boolean;
  /** TASK-24: force the provider wire-capture sink on, independent of `env.WIRE_CAPTURE` — an int test passes
   *  `true`. Absent ⇒ `isWireCaptureEnabled()` (env) decides. When neither is on, NO sink is wired into the
   *  backends (zero cost, zero retained bytes). */
  readonly wireCapture?: boolean;
}

/** What the composition root hands back: the transport `Services` bundle + the boot handles the lifecycle
 *  supervises/probes/wires. */
export interface ServicesResult {
  readonly services: Services;
  /** The automation service (D46) — surfaced top-level so A5's watcher/dispatch subsystem subscribes to the
   *  buses through it (`createAutomationWatcherEnv` reads this handle). Also on the transport `Services` bundle
   *  (the `automation` router — the §A8 rule/budget/fire lifecycle surface). */
  readonly automation: AutomationService;
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
  readonly roleClients: RoleClientsWithSignal;
  /** The per-owner `RoleClients` binder, pre-bound to the connection service + the executor. The workloads
   *  worker's `bindRoleClients` is wired from this; entry never touches the raw executor. */
  readonly bindRoleClients: (ownerId: UserId) => Promise<RoleClientsWithSignal>;
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
  // PD-139(a): a settings write that changes the embed/imageEmbed model must enqueue a bulk purge+reindex.
  // `workloads` is built far below, so this holder is late-bound after it exists; the settings op derefs it
  // at request time (a settings write), never during boot. Until then it is an inert no-op.
  let enqueueEmbedReindex: () => void = () => undefined;
  // materializeBackground (side-eye F-P0-2): built after `assets` + `effectiveConfig` exist (below), but
  // settings/character/chat compose BEFORE `assets`, so they deref this late-bound holder at request time (the
  // `spriteSheetOps` pattern). Invoked only when a user pastes an external background URL — long after wiring.
  let materializeBackgroundOp: MaterializeBackgroundOp = () => {
    throw new Error("compose: materializeBackground invoked before assets wiring");
  };
  const materializeBackground: MaterializeBackgroundOp = (principal, url) => materializeBackgroundOp(principal, url);
  const settingsDeps: SettingsServiceDeps = {
    db,
    now,
    audit,
    requireAdmin,
    requireOwner,
    newThemeId: minter(ID_PREFIX.theme),
    emitUserEvent: publishUserEvent,
    onEmbedModelChanged: () => enqueueEmbedReindex(),
    materializeBackground,
    newBackgroundEntryId: () => randomUUID(),
  };
  const settings = createSettingsService(settingsDeps);
  const settingsCtx: SettingsContext = createSettingsContext(settingsDeps);

  // Warm the resolved-config cache from the stored override so the sync getEffectiveConfig() returns the
  // floor⊕override config (incl. vllmConcurrency) before the registry reads it.
  const effectiveConfig = createEffectiveConfigWiring(settings);
  await effectiveConfig.reload();
  const resolved = effectiveConfig.getEffectiveConfig();

  // Built before the backend registry so the OpenRouter image runners get the real GIF→first-frame-PNG
  // wire-normalize transform (MA-6) — the sharp adapter, wrapped inside providers so it never leaks in.
  const imageAdapter = createImageAdapter();
  // TASK-24: wire the provider wire-capture sink ONLY when capture is enabled (env or the force flag). When
  // off, no sink is injected → the send boundaries never record → zero cost, zero retained bytes, prod-safe.
  const wireCaptureOn = deps.wireCapture === true || isWireCaptureEnabled();
  const registry = createBackendRegistry({
    ...(deps.providerSeams ?? {}),
    now,
    // The sink stamps `at` from the injected clock (no-raw-clock) and forwards to the process ring.
    ...(wireCaptureOn ? { captureWire: (entry): void => recordWireCapture({ ...entry, at: now() }) } : {}),
    vllmDisabled: deps.vllmDisabled,
    vllmConcurrency: {
      embed: resolved.vllmConcurrency.embed,
      summarize: resolved.vllmConcurrency.summarize,
    },
    // LIVE getter (not the boot snapshot) so an admin retune + engine restart applies the new launch flags.
    engineLaunch: () => effectiveConfig.getEffectiveConfig().engineLaunch,
    imageToPng: (bytes) => imageAdapter.transform(bytes, { format: "png" }),
    ...(deps.repoRoot !== undefined ? { repoRoot: deps.repoRoot } : {}),
  });
  const executor = createProviderExecutor({ backends: registry.backends });
  const diagnostics = createProviderDiagnostics({ backends: registry.backends });
  const secretBox = createSecretBox(deps.secretBoxKey);
  const cas = createCas(deps.casDir);
  const variants = createVariantCache(deps.variantDir);
  const extractText = createExtractText();
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
    // The gen engine self-reports its launched window at /v1/models; when vLLM is disabled there is no
    // engine to ask, so short-circuit to null and let the resolver use the env-owned window.
    fetchVllmGenWindow: (req): Promise<number | null> => (vllmAvailable ? fetchEngineMaxModelLen(req.engine, req.signal) : Promise.resolve(null)),
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

  const bindRoleClients = (ownerId: UserId): Promise<RoleClientsWithSignal> => bindRoleClientsForUser({ connection, executor }, ownerId);
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
    imageProbe: imageAdapter.probe,
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
  // Now that `assets` exists, bind the real materializeBackground op (the holder above forwards to it). Full
  // public-internet SSRF firewall (ANY_HOST, no ownerConfiguredEndpoint) — this is a user-pasted URL; the
  // image magic-belt + the effective per-image byte cap bound the download (side-eye F-P0-2).
  materializeBackgroundOp = createMaterializeBackground({
    storeBackground: (principal, bytes, mime) =>
      assets.store({ principal, bytes, kind: "background", mime, enforceMagic: true, maxBytes: effectiveConfig.getEffectiveConfig().maxImageBytes }),
    maxBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
  });

  // The one chat bus, built early (persona composes before buildChatService — chat needs persona.get for turn
  // assembly, a genuine cycle) and threaded into persona's write, expressions' classify emit, and
  // buildChatService. Homed above the expression-sprite leaf so its E3 classify hook can emit onto it.
  const chatBus = createChatBus({ db, now, newEventId: minter(ID_PREFIX.chatEvent) });
  const emitChatEvent = async (event: ChatBusEvent): Promise<void> => {
    const seq = await chatBus.emit(event);
    // `null` ⇒ the durable append was dropped + reported (bus.ts FLAG[emit-is-total], e.g. the chat was
    // deleted mid-turn). Durable-first means an un-logged event is never fanned — it has no replay cursor.
    if (seq !== null) {
      publishChatEvent({ seq, event });
    }
  };

  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),

    audit,
    emit: eventBus.emit,
    emitUserEvent: publishUserEvent,
    // F-P0-2: a `kind:"external"` carried card background is materialized into an owned CAS asset at update.
    materializeBackground,
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
  });
  const workloads = createWorkloadService({
    db,
    now,
    newWorkloadId: minter(ID_PREFIX.workload),
    newScheduleId: minter(ID_PREFIX.workloadSchedule),
    requireOwner,
    isAdmin,
  });

  // PD-139(a): bind the embed-model-change → bulk purge+reindex enqueue now that `workloads` exists. A
  // box-level trigger: purge+reindex ALL sources (force) as a GLOBAL BULK sweep. `caller: null` is a trusted
  // system trigger (bypasses the mode gate); `ownerId` is unused in bulk mode (the sweep spans every owner).
  // The `index` runner covers character/image/memory chunks; DOCUMENT chunks live in `document_chunks` and are
  // re-embedded by a separate bulk `databank-reindex` (chunk-embed) sweep — without it a model change strands
  // every document chunk in the OLD embed space (DBK-B(b)). Both are enqueued together; each is independent.
  // Fire-and-forget: a duplicate run (a kind is already active → DomainConflictError) or any enqueue failure is
  // swallowed here — it must never fail the settings write that triggered it (mirrors the `emitUserEvent`
  // treatment in updateUserSettingsSection).
  enqueueEmbedReindex = (): void => {
    void workloads
      .start({ input: { kind: "index", params: { source: "all", force: true } }, caller: null, mode: "bulk", ownerId: null })
      .catch(() => undefined);
    void workloads
      .start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, caller: null, mode: "bulk", ownerId: null })
      .catch(() => undefined);
  };

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
      // Merge the live lifecycle record with each engine's env-only DEPLOYMENT facts (port + store path)
      // into the AdminEngineStatus read-model the panel renders read-only. Both maps are keyed by engine.
      allEngineStatuses: (): Record<string, AdminEngineStatus> => {
        if (registry.vllmEngine === null) {
          return {};
        }
        const statuses = registry.vllmEngine.status();
        // Widen to a string index so a status key with no matching deployment fact resolves to `undefined`
        // (honest guard) rather than being asserted present by the branded engine key.
        const facts: Record<string, EngineDeploymentFacts | undefined> = registry.vllmEngine.deployment();
        return Object.fromEntries(
          Object.entries(statuses).map(([engine, record]) => {
            const deployment = facts[engine];
            return [engine, { ...record, port: deployment?.port ?? 0, storePath: deployment?.storePath ?? "" }];
          }),
        );
      },
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

  // The ONE tool-use registry (process-lifetime; tool-use-design/01 §3) — built here, before its registrants
  // and consumers (chat below reads the same instance). Buddy is the first registrant: its curated tools
  // register ONCE (owner read from the exec context per turn, never a compose-time closure), and its `ask`
  // resolves them per turn through the SAME registry, projecting via toAgentToolServer (T5).
  const toolUse = createToolUseService({ can, clock: now });

  const exportService = createExportService({ db, cas, imageTransform: imageAdapter.transform });

  // The synthetic host principal for the extraction shaper's card reads (the chat.ts hostPrincipal precedent —
  // role-irrelevant getCard reads under the room host's ownership).
  const imageryCardPrincipal = (userId: UserId): Principal => ({ userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "fallback" });

  const imagery = createImageryService({
    db,
    now,
    newGenerationId: minter(ID_PREFIX.imageryGeneration),
    resolveGenerateImage: async (caller) => {
      const conn = await connection.resolveRole({ role: "generateImage", principal: caller });
      return { connection: conn, capability: conn.capability };
    },
    generateImage: async (req) => {
      const result = await executor.generateImage(req);
      // Map the infra runner's edit-strip belt warnings (`ResolvedWarning{code,message}`) onto the domain's
      // `ImageryWarning{code,detail}` — imagery never imports `#infra` types. The image concern is the whole
      // edit strip (`image_edit_dropped`); the resolve-chat knob codes (sampling/effort/etc.) are not imagery's
      // and drop.
      return {
        images: result.images,
        model: result.model,
        usage: result.usage,
        warnings: result.warnings.flatMap((w) => (isImageryWarningCode(w.code) ? [{ code: w.code, detail: w.message }] : [])),
      };
    },
    // The provider URL is attacker-influenceable; safeFetch's total deadline bounds the body read (no
    // unbounded slow-loris). `fetchImageBytes` accepts an optional caller/workload signal (3rd arg) — none
    // flows through the imagery `fetchImage(url)` port today (it can't ride the zod wire params); threading
    // a per-turn signal is a follow-up in the imagery/chat contracts.
    fetchImage: (url) => fetchImageBytes(url, effectiveConfig.getEffectiveConfig().maxImageBytes),
    storeAsset: (caller, bytes, kind, mime) => assets.store({ principal: caller, bytes, kind, mime, enforceMagic: true }),
    // The chat-owned quiet extraction shaper (imagery I1, doc 02 §2): chat windows recent canon + resolves
    // {{char}}/{{user}}, then runs the summarize side-LLM. getCard adapts the ownerId shape via a synthetic
    // host principal (the chat.ts hostPrincipal precedent — cards read under the room host's ownership).
    // MEMBERSHIP GATE (cross-tenant-sweep-enforced): the shaper reads the chat's canon history, and
    // `imagery.extractPrompt` is a CHAT-scoped op with no asset-owner join to gate on (unlike editImage/
    // readProvenance) — so a non-member caller is refused with a leak-free NOT_FOUND BEFORE any history read.
    extractQuiet: (() => {
      const base = createExtractQuiet({
        db,
        summarize: roleClients.summarize,
        getCard: ({ ownerId, characterId }) => character.getCard({ principal: imageryCardPrincipal(ownerId), characterId }),
      });
      return async ({ caller, ...rest }) => {
        // MEMBERSHIP *AND* THE FLOOR — one op, one answer. The old gate was `loadPresentRole !== null`
        // (membership only), which admitted a `from-join`-clamped member and then let the extractor read the
        // room's last rows unfloored: `imagery.extractPrompt` hands the model's distillation of those rows
        // straight back on the wire, so a clamped caller could read a summary of canon their own
        // `listMessages` withholds. `null` ⇒ the same leak-free NOT_FOUND as before.
        const visibility = await resolveViewerVisibility(rest.chatId, caller.userId);
        if (visibility === null) {
          throw new DomainNotFoundError("chat", rest.chatId);
        }
        return base({ ...rest, historyFloorSeq: visibility.historyFloorSeq });
      };
    })(),
    // The ONE vision caption op (D45/D47-6): the multimodal template + the avatar bytes over the summarize
    // lane (IC-B: runSummarize forwards images as multimodal content parts).
    captionImage: async ({ instruction, bytes }): Promise<{ text: string; costUsd: number | null }> => {
      const res = await roleClients.summarize([{ systemPrompt: instruction, userPrompt: "Describe the attached image.", images: [bytes] }]);
      const item = res.items[0];
      return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
    },
    // EC-B owner-gated byte read (the caller owns the asset it references).
    readAsset: (caller, assetId) => assets.readOwnedAssetBytes(caller, assetId),

    // character.get under the CALLER's ownership (imagery passes a real Principal) — the full CharacterDetail
    // (avatarAssetId for B3/caption + the row's contentHash for the I3 identity hash). Throws
    // CharacterNotFoundError on missing/foreign; imagery does not re-gate.
    getCard: (caller, characterId) => character.get({ principal: caller, characterId }),
    recordStats: async (delta): Promise<void> => {
      const batch: BatchStmt[] = [];
      applyStatsDelta(batch, db, delta);
      if (batch.length > 0) {
        await db.batch(batchMany(batch));
      }
    },
  });

  // The D48 `generate_image` tool (imagery-design/04 §1) — registered into the SAME one registry buddy joined
  // above (additive; rpg registers its own tools later). The handler closes over `imagery.generatePicture` and
  // reads the acting principal + chat from the per-turn exec context. The automation arm (A6) is a separate
  // consumer of the same op + schema.
  for (const def of imageryToolDefinitions({ generatePicture: imagery.generatePicture })) {
    toolUse.register(def);
  }

  // databank (DB4-6): the source-document producer + its derived `document_chunks` (written ONLY via
  // embeddings.store — the single write path). Built BEFORE chat so `gatherDatabank` (the {{databank}}
  // slot, DB6) can inject into the chat build; its host/member guards are the compose-root
  // requireHost/requireParticipant (the same predicates chat's own seam wraps). The chunk→embed ingest
  // subsystem is a SEPARATE product the runner-env reaches through `env.databank.*`. `extractText` is the
  // full `infra/extraction` dispatcher (DB3 — txt/md/html/pdf loaders behind the one injected op).
  // `getDatabankSettings` returns the schema defaults v1 (ST's bank-wide values); the per-user override
  // lands with the Phase-6 panel. `searchDocuments` is the ONE retrieval lens (DB5) the gather op ranks
  // through — databank never runs its own cosine.
  const databankCtx: DatabankContext = {
    db,
    now,
    newDocumentId: minter(ID_PREFIX.document),
    audit,
    assetsStore: assets.store,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await assets.loadAssetBytes(assetId)) ?? undefined,
    embeddingsStore: embeddings.store,
    pruneDocumentChunks: embeddings.pruneDocumentChunks,
    countChunks: embeddings.countDocumentChunks,
    extractText,
    extractorVersion: EXTRACTOR_VERSION,
    // The DB7 scrapeWeb port: infra/network's `fetchWebDocument` (the ANY_HOST arbitrary-URL class — no host
    // pin, but https + private-range denial run per hop; throws on refusal/non-2xx/cap, the verb maps it).
    fetchUrl: fetchWebDocument,
    getActiveEmbedSpace: () => ({ model: roleClients.embedModel, dim: env.VLLM_EMBED_DIM }),
    getDatabankSettings: () => Promise.resolve(databankSettingsSchema.parse({ chunk: {}, retrieval: {} })),
    searchDocuments: search.documents,
    enqueueIngest: async ({ documentId, ownerId }) => {
      const started = await workloads.start({ input: { kind: "databank-ingest", params: { documentId } }, caller: null, mode: "singular", ownerId });
      return { workloadId: started.id };
    },
    enqueueReindex: async ({ ownerId, scope, mode }) => {
      const started = await workloads.start({ input: { kind: "databank-reindex", params: { scope, mode } }, caller: null, mode: "singular", ownerId });
      return { workloadId: started.id };
    },
    ensureChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    ensureChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
  };
  const databank = createDatabankService(databankCtx);
  const databankIngest: DatabankIngest = createDatabankIngest(databankCtx);

  // The host's REAL principal by userId — shared by chat compose and rpg's lite capability resolve (a game turn
  // runs as the host, D19).
  const resolveHostPrincipal = createHostPrincipalResolver(sessions);
  const chatCompose = buildChatService({
    toolUse,
    db,
    now,
    emitChatEvent,
    holder: deps.holder ?? "replica-default",
    sessionSecret: deps.sessionSecret,
    resolveHostPrincipal,
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
    materializeBackground,
    embeddings,
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    runChatTurn: executor.runChatTurn,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
    gatherDatabank: databank.gatherRetrieval,
  });
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;
  // THE cross-domain viewer-visibility op (the read-visibility D-entry): membership AND the D16 canon floor as
  // ONE answer for one human over one chat. Built ONCE here and injected into every non-chat consumer that
  // decides "may this human see this chat's CONTENT" — the automation plugin fan-out's delivery gate and the
  // plugin membrane's canon read. Those consumers used to answer that question with a membership select of
  // their own, which is how a `from-join`-clamped member's plugin could receive pre-join canon. There is
  // exactly ONE clamp home (chat's `resolveHistoryFloorSeq`, reached only through this op) — a sibling domain
  // re-deriving the floor is the defect this wiring exists to make impossible.
  const resolveViewerVisibility = createResolveViewerVisibility({ db });

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
    // PD-144: re-link a portable card's carried attached-book references (owned-source gated); the
    // persistence-factory twin of the duplicate carry, db + clock only.
    linkCarriedBooks: createLinkCarriedBooks({ db, now }),
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

  // Automation (D46) — built AFTER its action-op collaborators (chat/world-info/imagery/notifications +
  // resolveOwnerPrincipal) so the A6 arm executors + widened `AutomationOps` wire against real services. The
  // seams: db + injected clock/prng + id minters + `can()`; the chat READ+WRITE ops; the enabled-rule
  // pre-check index (primed below); the author-Principal resolver (the entry seam mints it — the domain never
  // constructs a Principal); the A6 arm dispatcher (`runArm`); and the automation-bus sink — `publishAutomation
  // Event` (A8b), which fans a rule's `surface_quick_reply` chips (+ the host-only fire/error/disable events)
  // to the chat's `automation.stream` subscribers (the transport-owned per-chat live bus, `ASSUMES(single-
  // replica)`; the visibility gate is the subscription's `resolveStreamAuthority` — publishing to a channel is
  // safe because only a membership-gated subscriber is ever attached to it). Every action op resolves the
  // author's Principal where its sibling owner-gates (world-info book owner, imagery caller) — one-directional
  // flow, wired ONLY here.
  const automationNotify = publishAutomationEvent;
  const automationOps = createAutomationOps({
    db,
    resolveViewerVisibility,
    applyVariableOps: chatCompose.applyVariableOps,
    // The `trigger_turn` arm's autonomous turn (03 §1.6 / §4) → chat's `requestTurn`. `initiator:"automation"`
    // is HARDCODED here (automation cannot forge a different origin); the funder = the rule author (chat resolves
    // the funding host from the room + runs the engine's consent + per-member turn RATE belt — the loop-safety
    // guard). The guided steer rides as a "response"-action GuidedSteer (the arm already macro-rendered it).
    // Returns the narrow count summary (cost VISIBILITY rides the stats domain off the committed replies).
    requestTurn: async (req) => {
      const outcome = await chatCompose.requestTurn({
        chatId: req.chatId,
        initiator: "automation",
        funderUserId: req.authorUserId,
        automationDepth: req.automationDepth,
        ...(req.speakerCharacterId !== undefined ? { speakerCharacterId: req.speakerCharacterId } : {}),
        ...(req.guided !== undefined ? { guided: { action: "response", input: req.guided } } : {}),
      });
      return { messageCount: outcome.messages.length };
    },
    upsertEntries: async ({ authorUserId, bookId, entries }) =>
      worldInfo.upsertEntries({ principal: await resolveOwnerPrincipal(authorUserId), bookId, entries }),
    emitNotification: async (event) => {
      const view = await notifications.record({ event });
      publishNotification(view);
    },
    generatePicture: async (req) => {
      const caller = await resolveOwnerPrincipal(req.authorUserId);
      const picture = await imagery.generatePicture({
        caller,
        chatId: req.chatId,
        mode: req.mode,
        n: req.n,
        useAvatarReference: req.useAvatarReference,
        reuse: req.reuse,
        ...(req.prompt !== undefined ? { prompt: req.prompt } : {}),
        ...(req.negative !== undefined ? { negative: req.negative } : {}),
        ...(req.size !== undefined ? { size: req.size } : {}),
        ...(req.subjectCharacterId !== undefined ? { subjectCharacterId: req.subjectCharacterId } : {}),
      });
      // 03 §1.7 "one /imagine path": the DEFAULT (`quiet:false`) surfaces the image IN-CHAT — otherwise a
      // `generate_image` rule's output is only ever reachable via the gallery. Post through chat's EXISTING
      // server-side image-post seam (`postNarratorMessage` — the illustration-post path, D51 asset refs +
      // `message_assets` GC rows), never a second posting path. `quiet:true` stays store-only (gallery only).
      if (!req.quiet && picture.images.length > 0) {
        // N1 (F1 cascade belt): stamp the posted image's slot with `initiator:"automation"` + the firing rule's
        // cascade depth so its `messageCommitted` fact rides at depth ≥ 1. Without this the posted image
        // defaults to `human`/0 and a non-opted `messageCommitted → generate_image` rule RE-FIRES on its own
        // post (the F1 self-loop). Depth ≥ 1 makes `runGates` suppress a non-opted re-fire (the F5 mechanism);
        // an opted-in rule still fires but is bounded by `AUTOMATION_DEPTH_HARD_CAP`.
        await chatCompose.rpgChatOps.postNarratorMessage(
          req.chatId,
          req.prompt ?? "",
          picture.images.map((img) => img.assetId),
          { initiator: "automation", automationDepth: req.automationDepth },
        );
      }
      return { imageCount: picture.images.length };
    },
    // BG-F — the /autobg candidate set: the SEEDED catalog (the shared `@orb/contracts/theme` home — same
    // catalog the client picker reads, one home) PLUS the author's OWNED library uploads. The model picks by
    // name over both.
    listBackgroundChoices: async (authorUserId) => {
      const config = (await settings.getUserSettings({ principal: await resolveOwnerPrincipal(authorUserId) })).config;
      const seeded = listSeededBackgrounds().map((s) => ({
        name: s.label,
        background: { kind: "seeded" as const, seededId: s.id, externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
      }));
      const owned = config.appearance.backgroundLibrary.map((entry) => ({
        name: entry.name,
        background: {
          kind: "asset" as const,
          seededId: "",
          externalUrl: "",
          assetId: entry.assetId,
          assetHash: entry.assetHash,
          mime: entry.mime,
          provenanceUrl: entry.provenanceUrl ?? "",
        },
      }));
      return [...seeded, ...owned];
    },
    // BG-F — the author-scoped chat-background write (chat's host-gated verb under the author's Principal; the
    // author's dispatch-time host authority was re-verified at the automation gate, and the asset is the
    // author's own so BG-C's ownership check passes).
    setChatBackground: async ({ authorUserId, chatId, background }) => {
      await chat.setChatBackground({ principal: await resolveOwnerPrincipal(authorUserId), chatId, background });
    },
    // BG-F — the quiet summarize-role pick: one summarize generation under the author's connection, returning
    // raw text (no chat post). Low temperature + a tight token budget — the model replies with one name.
    summarizeQuiet: async ({ authorUserId, prompt }) => {
      const autobgTemperature = 0.2;
      const autobgMaxTokens = 32;
      const autobgSystem =
        "You choose the single best-matching background for a scene. Reply with ONLY the exact background name from the provided list, nothing else.";
      const rc = await bindRoleClients(authorUserId);
      const res = await rc.summarize([{ systemPrompt: autobgSystem, userPrompt: prompt }], { temperature: autobgTemperature, maxTokens: autobgMaxTokens });
      const item = res.items[0];
      return { text: (item?.text ?? "").trim() };
    },
  });
  const automationEnabled = createEnabledRuleIndex(db);
  // The plugin `events.on` fan-out registry (plugin-design/04 §P4) — ONE per-process instance, injected into the
  // automation context (the watcher fan-out reads it) AND handed to the membrane host's `subscribeEvent` seam
  // below, which closes over it so a guest `events.on` registers here. Empty until a plugin subscribes; the
  // fan-out enforces depth/visibility/declared-match before any delivery.
  const pluginSubscribers = createPluginSubscriberRegistry();
  // The A7 prompt-transform index — `transform_draft` rules register into chat's compose-wired
  // `promptTransformRegistry` (the D50 seam, 04 §6) as they enable/disable/reorder, applied synchronously by
  // the turn pipeline (never watcher-dispatched). register/unregister are the chat registry's; the render deps
  // (readChoicePicks + clock/prng) evaluate each transform's predicate + template per turn.
  const automationTransforms = createPromptTransformIndex({
    db,
    ops: automationOps,
    prng: Math.random,
    now,
    register: chatCompose.promptTransforms.register,
    unregister: chatCompose.promptTransforms.unregister,
  });
  const automation = createAutomationService({
    db,
    now,
    prng: Math.random,
    newRuleId: minter(ID_PREFIX.automationRule),
    newFireId: minter(ID_PREFIX.automationFire),
    can,
    ops: automationOps,
    runArm: createArmExecutors({ db, ops: automationOps, prng: Math.random, notify: automationNotify }),
    enabled: automationEnabled,
    pluginSubscribers,
    transforms: automationTransforms,
    resolveAuthor: resolveOwnerPrincipal,
    notify: automationNotify,
  });
  // Prime the watcher's in-process enabled index + the A7 transform registry from canon (01 §3 / 04 §6) —
  // before the watcher starts consuming and before the first turn assembles.
  await automationEnabled.reload();
  await automationTransforms.reload();

  // ── domain/plugin (D46 Tier-2 sandbox) — the transport slice. The runtime is the sealed infra sandbox
  // (`createPluginHost`, injected UP — plugin-no-ambient); the membrane host-fn op bundle REUSES automation's
  // write ops verbatim (one home — a plugin write rides the SAME seam an automation action does) + the
  // installing-user global-KV bridge + the tool-use RUNTIME registrar (PL-A). THIS slice's realm exposes only
  // the determinism floor (pinned by realm.test), so the host-fn CALL surface is FORWARD-WIRED real for P4b's
  // realm marshalling; the lifecycle (install→enable→getLog→disable→uninstall) round-trips over the REAL
  // runtime, and a plugin tool would namespace + land in the ONE tool-use registry through `registerTool`.
  const pluginMessageContentCap = 16_384;
  // The plugin prompt-transform ORDER BAND (04 §6 — automation 0–999, plugins 1000+; host policy wraps guest).
  // Each collected transform takes the next slot by ACTIVATION order (a per-deploy monotonic seq — stable enough
  // for v1's single-replica compose; two plugins never share a slot).
  const pluginTransformOrderBase = 1000;
  let pluginTransformSeq = 0;
  const pluginHost: PluginHostPort = createPluginHost({ nowEpochMs: now, nextRandom: Math.random, mintId: () => randomUUID() });
  const pluginHostOps: PluginHostOps = {
    // INVARIANT (injected-op-caller-gate, INFO-5): every chat op below takes a BARE chatId and does NOT re-check
    // caller authority — it TRUSTS that admission already happened. The membrane is the ONLY caller and the gate:
    // the domain's invocation-chat-context admitted the chat (`can(installer,"read"/"host",chat)`) and folded the
    // host-authority ceiling into `InvocationChat.canWrite` BEFORE the runtime ran, and the opaque-handle token
    // pins each call to that one admitted chat. These ops are admission-TRUSTING by construction. A future
    // NON-membrane caller that reaches them without that admission = an instant cross-tenant hole — re-gate at
    // the new caller (loadPresentRole→NOT_FOUND before any read), never loosen the admission the membrane owns.
    chat: {
      // The reduced plugin view (01 §2), FLOOR-CLAMPED in SQL — `plugin-chat-reads.ts` (extracted so the
      // predicate deciding which canon bytes reach an untrusted guest realm has a reachable test seam).
      listMessages: (chatId, opts) => loadPluginMessages(db, chatId, opts),
      // The bridge asks this BEFORE `listMessages` and hands the resolved floor down (a non-member ⇒ `[]`).
      // The admissions upstream of the membrane (`resolveChatAuthority`, the tool registrar's PL-C gate, the
      // `events.on` per-delivery role read) resolve MEMBERSHIP only — this is the half they cannot answer.
      resolveViewerVisibility,
      getVariables: automationOps.chat.readVariables,
      applyVariableOps: automationOps.chat.applyVariableOps,
      // turn.trigger (01 §2) → chat's principal-free `requestTurn`. `initiator:"plugin"` is HARDCODED (a plugin
      // cannot forge a different origin); the funder is the INSTALLER (the bridge closed it over the installer —
      // never guest/infra-supplied). chat resolves the funding host from the room + gates the funder's membership
      // (leak-free NOT_FOUND) + runs the D17 by-proxy consent + the per-member turn RATE budget + the cascade-depth
      // guard (loop safety). Returns void; cost VISIBILITY rides the stats domain off the committed replies.
      requestTurn: async ({ funderUserId, chatId, automationDepth, speakerCharacterId, guided }) => {
        await chatCompose.requestTurn({
          chatId,
          initiator: "plugin",
          funderUserId,
          automationDepth,
          ...(speakerCharacterId !== undefined ? { speakerCharacterId: castId<CharacterId>(speakerCharacterId) } : {}),
          ...(guided !== undefined ? { guided: { action: "response", input: guided } } : {}),
        });
      },
    },
    worldInfo: automationOps.worldInfo,
    // storage.kv (01 §2) — the plugin-PRIVATE KV. `buildPluginStorage` wraps `persistence/plugin-kv` with the
    // host-side 256-key cap (the value/key byte caps are DDL); the bridge closes pluginId+installer over it, so a
    // cross-plugin/cross-owner read is structurally impossible.
    storage: buildPluginStorage(db, now),
    // The durable inbox seam. `emit` is the raw event path the crash policy fires for the ids-only
    // `plugin-disabled` member (03 §4) — durable-first record then publish, the automation `emitNotification`
    // precedent. `post` is the `notify` capability: a participant notice through the SAME `automation-notice` inbox
    // path a `post_notification` arm uses. The recipient set is resolved HERE (host = the installer; all_members =
    // the present human roster via automation's own reader — participants ONLY, so a plugin can never notify a
    // non-participant), the message is host-capped (200 chars, 03 §1.5), and the notice stamps
    // `source:{kind:"plugin",pluginId}` (no synthetic rule id).
    notifications: {
      emit: async (event) => {
        publishNotification(await notifications.record({ event }));
      },
      post: async ({ pluginId, installerUserId, chatId, recipient, message }) => {
        const recipients = recipient === "host" ? [installerUserId] : await loadPresentHumanMemberIds(db, chatId);
        const capped = message.slice(0, AUTOMATION_NOTICE_MESSAGE_MAX);
        const source = { kind: "plugin", pluginId } as const;
        await Promise.all(
          recipients.map(async (recipientUserId) => {
            const event = { type: "automation-notice", recipientUserId, chatId, source, message: capped } as const;
            publishNotification(await notifications.record({ event }));
          }),
        );
      },
    },
    // chat.quick_reply (01 §2) — transient chips onto the chat's automation bus, the SAME frame-free emit seam
    // automation's `surface_quick_reply` arm rides (`automationNotify` = publishAutomationEvent, composed UP).
    // Host-authority is gated UPSTREAM in the membrane (`InvocationChat.canWrite`); the event stamps
    // `source:{kind:"plugin",pluginId}`.
    quickReply: {
      surface: ({ pluginId, chatId, choices }) => {
        const projected = choices.map((c) => ({ label: c.label, sendText: c.sendText }));
        automationNotify({ type: "quickReplySurfaced", chatId, source: { kind: "plugin", pluginId }, choices: projected });
        return Promise.resolve();
      },
    },
    // The membrane's imagery returns the primary image's `{assetId}` (01 §2) — NOT automation's cost-summary
    // op. Bound to the same `{assetId}`-bearing front door rpg/expressions consume; the guest action args are
    // re-validated through `generateImageActionArgsSchema` (defaults applied, garbage refused, fan-out clamped
    // n≤4), and the installer's Principal is resolved for connection ATTRIBUTION. Loop safety: the n≤4 clamp +
    // the membrane's ≤32 concurrent-host-call cap + the admin-only install gate. The guest sees ONLY the
    // `{assetId}`; cost VISIBILITY rides the stats domain off the imagery write itself.
    imagery: {
      generatePicture: async ({ authorUserId, chatId, args }) => {
        const p = generateImageActionArgsSchema.parse(args);
        const caller = await resolveOwnerPrincipal(authorUserId);
        const picture = await imagery.generatePicture({
          caller,
          chatId,
          mode: p.mode,
          n: p.n,
          useAvatarReference: p.useAvatarReference,
          reuse: p.reuse,
          ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
          ...(p.negative !== undefined ? { negative: p.negative } : {}),
          ...(p.size !== undefined ? { size: p.size } : {}),
          ...(p.subjectCharacterId !== undefined ? { subjectCharacterId: p.subjectCharacterId } : {}),
        });
        const first = picture.images[0];
        if (first === undefined) {
          throw new Error("plugin imagery: generation produced no image");
        }
        return { assetId: first.assetId };
      },
    },
    // The installing user's global KV — `fetchOwned` under the installer (automation's own owner-scoped verbs,
    // resolved to the installer's Principal), so a cross-user read is structurally impossible.
    variables: {
      get: async (ownerId, key) => automation.getGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
      set: async (ownerId, key, value) => {
        await automation.setGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key, value });
      },
      delete: async (ownerId, key) => automation.deleteGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
    },
    registrar: {
      // PL-A: a plugin tool namespaces `plugin_<slug'>_<name>` (slug' = the DERIVED manifest slug, `-`→`_`)
      // and lands in the ONE tool-use registry as its INSTALLING principal (PL-C, inside registerPluginTool).
      registerTool: (reg, invoke, scope) =>
        toolUse.registerPluginTool({
          name: `plugin_${scope.slug.replaceAll("-", "_")}_${reg.name}`,
          description: reg.description,
          parameters: reg.parameters,
          installer: scope.installer,
          invoke: (argsJson, chatScope) => invoke(reg.handler, argsJson, chatScope),
        }),
      // D50 — one PromptTransform per collected registration in the PLUGIN order band (1000+, ABOVE automation's
      // 0–999; assigned by activation order). §6 SCOPE GATE: a plugin transform attaches ONLY to a chat where the
      // INSTALLER is HOST — the registry is process-global + chat-blind, so the `apply` self-guards on installer-
      // host authority (the plugin analog of an automation rule's chatId self-guard) and passes the draft through
      // UNCHANGED otherwise (fail-closed — never rewrite a draft in a chat the installer does not host, nor leak
      // one cross-tenant into the guest). The re-entry marshals ONE `{draft, env}` object (the single-arg host→
      // guest seam); a throw/timeout is contained by the registry's 250 ms bound + skip (D53); `unregister` drops
      // it from the registry on deactivate BEFORE the instance is disposed.
      registerTransform: (reg, invoke, scope) => {
        const id = `plugin:${scope.slug}:${reg.name}:${pluginTransformSeq}`;
        const transform = buildPluginPromptTransform(reg, {
          id,
          order: pluginTransformOrderBase + pluginTransformSeq,
          isInstallerHost: async (chatId) => (await loadPresentRole(db, chatId, scope.installer.userId)) === "host",
          invoke: (handler, argsJson) => invoke(handler, argsJson, null),
        });
        pluginTransformSeq += 1;
        chatCompose.promptTransforms.register(transform);
        return { unregister: () => chatCompose.promptTransforms.unregister(id) };
      },
      // The plugin `events.on` fan-out: ONE PluginTriggerSubscriber per instance (declaredEvents = the union of
      // collected types; the deliver closure routes each fact to the matching handler[s] by fact.type). The
      // automation fan-out already enforces cascade-depth / visibility / declared-match BEFORE calling `deliver`
      // (substrate/plugin-subscribers) — this closure must NOT bypass them; it only marshals + routes. FIELD-CAP
      // (load-bearing DoS defense): truncate the typed fact's message content to the plugin content cap BEFORE
      // marshalling (the sandbox's 1 MiB whole-payload inbound cap is the coarse backstop). Fire-and-forget
      // (`deliver` is void; the fan-out is self-safe) — each invoke rides the per-invocation budget + the
      // ctx.alive/dispose-drain discipline internally + drives the crash counter; a late rejection is swallowed.
      subscribeEvent: (subscriptions, invoke, scope) => {
        const refsByType = new Map<string, PluginHandlerRef[]>();
        for (const sub of subscriptions) {
          const refs = refsByType.get(sub.type) ?? [];
          refs.push(sub.handler);
          refsByType.set(sub.type, refs);
        }
        const unregister = pluginSubscribers.register({
          installer: scope.installer.userId,
          declaredEvents: new Set(subscriptions.map((s) => s.type)),
          matchAutomationEvents: scope.matchAutomationEvents,
          deliver: (fact, automationDepth) => {
            const refs = refsByType.get(fact.type);
            if (refs === undefined) {
              return;
            }
            const argsJson = JSON.stringify(capFactContent(fact, pluginMessageContentCap));
            // The event handler runs IN the fact's chat scope (the §7 handler reads `host.chat.current()` /
            // `getVariables`): `canWrite` = the installer is HOST (host-gated writes like turn.trigger), and
            // `automationDepth` = the fact's resolved cascade depth so a `chat.requestTurn` from the handler
            // stamps `depth + 1` (the loop-prevention belt). A chat-less domain fact ⇒ no scope (`null`). The
            // per-delivery host read + guest invokes are fire-and-forget off the fan-out (self-safe).
            void (async (): Promise<void> => {
              let eventChat: InvocationChat | null = null;
              if (fact.chatId !== null) {
                const factChatId = castId<ChatId>(fact.chatId);
                const role = await loadPresentRole(db, factChatId, scope.installer.userId);
                eventChat = { chatId: factChatId, canWrite: role === "host", automationDepth };
              }
              // All refs for this fact share ONE chat scope, so a per-fact parallel fan-in is race-free here (the
              // cross-fact serialization onto the shared sandbox is the FIFO-per-instance concern noted at close).
              await Promise.all(refs.map((handler) => invoke(handler, argsJson, eventChat).catch(() => undefined)));
            })();
          },
        });
        return { unregister };
      },
    },
  };
  const plugin = createPluginService({
    db,
    now,
    newPluginId: minter(ID_PREFIX.plugin),
    can,
    assets: {
      store: (caller, bytes, mime) => assets.store({ principal: caller, bytes, kind: "plugin", mime }),
      // The owner-scoped `plugins` row was already loaded (getById) before activation reads its bundle, so the
      // un-principal CAS read is gated upstream; `_caller` documents the seam's owner without a second check.
      readBytes: async (_caller, assetId) => {
        const bytes = await assets.loadAssetBytes(assetId);
        if (bytes === null) {
          throw new DomainNotFoundError("asset", assetId);
        }
        const ref = await assets.assetCasRefById(assetId);
        return { bytes, mime: ref?.mime ?? "application/zip" };
      },
      reapOrphans: async (assetIds) => {
        await assets.reapIfOrphan(assetIds);
      },
    },
    host: pluginHost,
    ops: pluginHostOps,
    // The snippet gate (03 §1): the caller's leak-free read/host authority for a chat. `loadPresentRole` returns
    // the caller's present participant role ("host"/"member") or null — a foreign/unknown chat is `{false,false}`
    // (no existence oracle; the runSnippet verb refuses NOT_FOUND). host role ⇒ the write half of the profile.
    resolveChatAuthority: async (caller, chatId) => {
      const role = await loadPresentRole(db, chatId, caller.userId);
      return { canRead: role !== null, canWrite: role === "host" };
    },
  });

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
    linkCarriedBooks: importWorldInfo.linkCarriedBooks,
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
    databankIngest,
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
      linkCarriedBooks: importWorldInfo.linkCarriedBooks,
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
    automation,
    character,
    chat,
    connection,
    credentials,
    databank,
    discovery,
    imagery,
    notifications,
    persona,
    plugin,
    preset,
    search,
    sessions,
    settings,
    stats,
    tag,
    workloads,
    worldInfo,
  };

  return {
    services,
    automation,
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
