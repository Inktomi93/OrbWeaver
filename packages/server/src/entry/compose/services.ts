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
import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { InvocationChat, PluginHandlerRef } from "@orb/contracts/plugin";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { SessionView } from "@orb/contracts/session";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import { listSeededBackgrounds } from "@orb/contracts/theme";
import type { BatchStmt, Db } from "@orb/db";
import {
  assets as assetsTable,
  characterSprites,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  messageVariants,
  personas as personasTable,
  users,
} from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { AssetId, CharacterId, ChatId, Handle, PersonaId, SessionId, TypeIdOf, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { alias } from "drizzle-orm/sqlite-core";
import { can, canAgent, createAdminService, isAdmin, requireAdmin, requireOwner } from "#domain/admin";
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
import { logAudit } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText, EXTRACTOR_VERSION } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { createPluginHost } from "#infra/plugin-host";
import type { BackendRegistryDeps, VllmEngineHandle } from "#infra/providers";
import {
  createAgentToolServer,
  createBackendRegistry,
  createProviderDiagnostics,
  createProviderExecutor,
  DEFAULT_EMBED_MODEL,
  DEFAULT_IMAGE_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
  probeComfyuiObjectInfo,
} from "#infra/providers";
import { createCas, createCuratedPoseReader, createVariantCache } from "#infra/storage";
import {
  createBulkImportChats,
  createChatBus,
  requireAuthorOrHost,
  requireHost,
  requireParticipant,
  resolveTier0Range,
  setParticipantActivePersona,
} from "../../domain/chat";
import type { Services } from "../../transport/trpc/context";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry";
import { createHostPrincipalResolver } from "../auth";
import type { DefaultPersonaSeeder } from "../boot";
import { createDefaultPersonaSeeder } from "../boot";
import { readSeedAvatar, readSeedGalleryPiece } from "../boot/seed-assets";
import { resolvePoseLibraryRoot } from "../http";
import type { ImportWorldInfoPort } from "../import";
import { createAgentAuthorResolver } from "./agent-author";
import { createAgentCardViewResolver, createAgentSpeakerResolver } from "./agent-speaker";
import { createAutomationOps } from "./automation-watcher";
import { buildChatService } from "./chat";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import { createCharacterUpdatedChatFan } from "./emit-character-updated";
import type { DomainEventBus } from "./event-bus";
import { createDomainEventBus } from "./event-bus";
import { createMaterializeBackground } from "./materialize-background";
import { buildPortabilityRegistry } from "./portability";
import { bindRoleClientsForUser } from "./role-clients";
import { buildWorkloadRunnerEnv } from "./runner-env";

/** The infra `WarningCode` members that are imagery's concern (mapped onto `ImageryWarning` at the generateImage
 *  op): the whole edit strip + the granular ComfyUI lever drops (comfyui-control §4.6/§4.12, C6). The resolve-chat
 *  knob codes (sampling/effort/etc.) are not imagery's and drop. A guard (not a bare `Set.has`) so `w.code`
 *  narrows to `ImageryWarning["code"]` — the mapped result then satisfies the domain result type. */
const IMAGERY_WARNING_CODES = new Set<string>(["image_edit_dropped", "image_inpaint_dropped", "image_identity_dropped", "image_pose_dropped"]);
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
  /** The rpg flight recorder (R-OBS), or `null` when tracing is off — entry wires its read port into
   *  `/api/_debug/rpg/traces`, and the drive kit reads its `recent` directly. */
  readonly rpgTrace: RpgTraceRecorder | null;
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
  // E4: the sprite-sheet op bundle is late-bound after imagery/character/workloads exist (far below); the
  // expression leaf composes early (character + chat consume it), so its ctx derefs this holder at request/run
  // time. `null` ⇒ generation unavailable ⇒ generateSpriteSheet throws ExpressionsNotConfiguredError.
  let spriteSheetOps: SpriteSheetOps | null = null;
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
  const registry = createBackendRegistry({
    ...(deps.providerSeams ?? {}),
    now,
    vllmDisabled: deps.vllmDisabled,
    vllmConcurrency: {
      embed: resolved.vllmConcurrency.embed,
      summarize: resolved.vllmConcurrency.summarize,
    },
    imageToPng: (bytes) => imageAdapter.transform(bytes, { format: "png" }),
    // MA-8: the owner-configured ComfyUI endpoint (the sealed backend derives its safeFetch host from it).
    comfyuiBaseUrl: env.COMFYUI_BASE_URL,
    // C7 (comfyui-control §4.11): the owner-scoped BYO-workflow reader the sealed runner loads a `byo:<name>`
    // selection through (the ownerId rides `req.owner` — the arm has no principal). The domain's own query,
    // never a second path; `graphJson` stays opaque until the arm substitutes it.
    comfyuiLoadByoWorkflow: (ownerId, name) => fetchByoWorkflowForDrive(db, ownerId, name),
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
    // N1 (comfyui-control §4.11.2c): the owner-scoped per-user BYO-workflow capability read connection folds
    // onto a `byo:<name>` comfyui descriptor (so a BYO edit workflow resolves edit-capable). The domain's own
    // query — the twin of the runner-side `fetchByoWorkflowForDrive`, never a second path.
    resolveByoWorkflowCapability: (ownerId, name) => fetchByoWorkflowCapability(db, ownerId, name),
    fetchOrCatalog: diagnostics.fetchOrCatalog,
    // MA-8: the live ComfyUI reachability + catalog probe over the owner-configured endpoint (env-threaded).
    probeComfyui: () => probeComfyuiObjectInfo({ baseUrl: env.COMFYUI_BASE_URL }),
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
    imageProbe: imageAdapter.probe,
    emit: eventBus.emit,
    now,
    newAssetId: minter(ID_PREFIX.asset),
    newGalleryItemId: minter(ID_PREFIX.galleryItem),
    newPoseLibraryId: minter(ID_PREFIX.poseLibrary),
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

      // Sprite arm (01 §6): the D21 membership exception extends from the avatar to the character's
      // expression-sprite set — the in-room public face the stage renders on every member's client. The hash
      // is a `character_sprites` binding for a roster character in a chat where `callerId` is a present member.
      const spriteRosterChar = alias(chatParticipants, "sprite_roster_char");
      const spriteCallerSeat = alias(chatParticipants, "sprite_caller_seat");
      const spriteRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(characterSprites, eq(characterSprites.assetId, assetsTable.id))
        .innerJoin(
          spriteRosterChar,
          and(eq(spriteRosterChar.characterId, characterSprites.characterId), eq(spriteRosterChar.kind, "character"), isNull(spriteRosterChar.leftSeq)),
        )
        .innerJoin(
          spriteCallerSeat,
          and(eq(spriteCallerSeat.chatId, spriteRosterChar.chatId), eq(spriteCallerSeat.userId, callerId), isNull(spriteCallerSeat.leftSeq)),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (spriteRows[0] !== undefined) {
        return spriteRows[0].ownerId;
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
    publishChatEvent({ seq, event });
  };

  // The expression-sprite CRUD leaf (E2) + the E3 classify hook. The two character gates are direct
  // owner-scoped `characters` reads (the assetsCtx `assertCharacterOwned` precedent): the WRITE gate is pure
  // ownership; the VISIBLE gate is owner OR a present member of a chat rostering the character (the 01 §6
  // blob-route membership exception — members see a roster character's public sprite set exactly like its
  // avatar). Built before `character` so that verb's `reapAssets` can fold in the freed sprite assetIds through
  // `expressions.reapIfOrphan`. The E3 classify ops (02): `classifyTurn` is the plain-prompt shaper over the
  // resolved summarizer (the smart-arbitrate side-LLM idiom, owner-bound); `readTurn` is chat's pure
  // post-regex prose read (db-only — no cycle); `emitExpressionEvent` forwards the `{type:"expression"}` member
  // onto the one chat bus (expressions never imports chat); `readSettings` resolves the chat host's
  // `autoClassify` gate + billing owner. The `expressions.onTurnCompleted` hook is injected into chat below.
  const expressions = createExpressionsService({
    db,
    now,
    classifyTurn: async ({ text, labels }) => {
      const { systemPrompt, userPrompt } = compileClassifyPrompt(text, labels);
      const result = await roleClients.summarize([{ systemPrompt, userPrompt }], { temperature: CLASSIFY_TEMPERATURE, maxTokens: CLASSIFY_MAX_TOKENS });
      // v1 is plain-prompt only (structured output stays inert until tool-use U0 populates output.structured).
      return { raw: result.items[0]?.text ?? "", structured: false };
    },
    readTurn: (chatId, messageId, variantId) => loadTurnForClassify(db, chatId, messageId, variantId),
    // The WiBusEvent precedent: expressions builds the full member, compose forwards it onto the one bus.
    emitExpressionEvent: (event) => emitChatEvent(event),
    readSettings: async (chatId) => {
      const hostRows = await db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
        .limit(1);
      const ownerId = hostRows.at(0)?.userId ?? null;
      if (ownerId === null) {
        return null;
      }
      const us = await settings.loadUserSettings(ownerId);
      return { autoClassify: us.expressions.autoClassify, ownerId };
    },
    // E4: derefs the late-bound bundle at request/run time (built below, after imagery/character/workloads).
    getSpriteSheetOps: () => spriteSheetOps,
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, castId<UserId>(ownerId))))
        .limit(1);
      return rows.length > 0;
    },
    assertCharacterVisible: async (callerId, characterId) => {
      const owned = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, castId<UserId>(callerId))))
        .limit(1);
      if (owned.length > 0) {
        return true;
      }
      const rosterChar = alias(chatParticipants, "sprite_roster_char");
      const callerSeat = alias(chatParticipants, "sprite_caller_seat");
      const rows = await db
        .select({ chatId: rosterChar.chatId })
        .from(rosterChar)
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, castId<UserId>(callerId)), isNull(callerSeat.leftSeq)))
        .where(and(eq(rosterChar.characterId, characterId), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
        .limit(1);
      return rows.length > 0;
    },
  });

  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),
    newProposalId: minter(ID_PREFIX.cardEvolutionProposal),
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
    // Frees a deleted character's expression-sprite bindings, returning the assetIds remove folds into the
    // reap set (expressions-design/01 §8 — the cascade wipes the rows but doesn't surface their asset ids).
    reapCharacterSprites: (characterId) => expressions.reapIfOrphan(characterId),
    attachCardTag: tag.attachCardTagByName,
    detachCardTag: tag.detachCardTagByName,
    // PD-141: world-info owns the character_books junction — the duplicate carry is its persistence factory,
    // wired here directly (world-info's full service composes after chat, below).
    copyCharacterBooks: createCopyCharacterBooks({ db, now }),
  });

  // `hub` (the card-hub + gif leaf) composes AFTER the import ports below (importWorldInfo + the character/
  // assets/tag import slices) — its H4 `importCardBytes` op reuses the SAME `runProfileImport` single-card
  // driver the HTTP card-upload route uses. See the `createHubService(...)` block after `importWorldInfo`.

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
        // The chat-crew (chat-crew-design/04 §4) + rpg (rpg-design/05 §5) domain-event mirrors touch no
        // embeddable canon — the indexer ignores them; they exist on the closed union to arm automation's
        // reserved triggers.
        case "crew.keeperRan":
        case "crew.editProposalCreated":
        case "crew.cardProposalCreated":
        case "crew.directorPassCompleted":
        case "rpg.clockCompleted":
        case "rpg.sessionConcluded":
        case "rpg.encounterEnded":
        case "rpg.reputationMilestone":
        case "rpg.checkResolved":
          return Promise.resolve();
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

  const toolUse = createToolUseService({ can, clock: now });

  // The agent speaker-source registry — a mapped Record over AGENT_SOURCE_KINDS built HERE (where the source
  // services live) so a new source kind fails tsc until it registers a resolver. Shared by BOTH the chat
  // speaker dispatch (voices a seated agent) and the export author dispatch (PD-17 provenance); one owner-walk
  // shape, one registry.
  const agentSpeakerSources = {} as any;
  // PD-17: export resolves an agent-authored row's leak-safe provenance through this op. Distinct op from
  // chat's resolveAgentSpeaker (export never sees the soul) — it drops the systemPrompt at the compose root.
  const resolveAgentAuthor = createAgentAuthorResolver(db, agentSpeakerSources);

  const exportService = createExportService({ db, cas, imageTransform: imageAdapter.transform, resolveAgentAuthor });

  // The synthetic host principal for the extraction shaper's card reads (the chat.ts hostPrincipal precedent —
  // role-irrelevant getCard reads under the room host's ownership).
  const imageryCardPrincipal = (userId: UserId): Principal => ({ userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "fallback" });

  // C6d: the curated-pose byte reader (the ComfyUI arm's ControlNet control map). Root DERIVES from the served
  // client-static root (never a parallel guess) — boot-fatal if the shipped set resolves to nothing.
  const readCuratedPose = createCuratedPoseReader(resolvePoseLibraryRoot({ distDir: env.CLIENT_DIST_DIR, override: env.POSE_LIBRARY_DIR }));

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
      // `ImageryWarning{code,detail}` — imagery never imports `#infra` types. The image concerns are the whole
      // edit strip (`image_edit_dropped`) + the GRANULAR ComfyUI lever drops (comfyui-control §4.6/§4.12, C6 —
      // inpaint/identity/pose); the resolve-chat knob codes (sampling/effort/etc.) are not imagery's and drop.
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
        if ((await loadPresentRole(db, rest.chatId, caller.userId)) === null) {
          throw new DomainNotFoundError("chat", rest.chatId);
        }
        return base(rest);
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
    // C6d: read a CURATED pose skeleton's bytes off the shipped static set (path-confined; GLOBAL content, not
    // CAS — the C6b ruling) for the ComfyUI arm's ControlNet. Root DERIVES from the served client-static root.
    readCuratedPose,
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

  // E4: late-bind the sprite-sheet op bundle now that imagery/character/workloads/assets all exist (the
  // expression leaf composed early derefs this at request/run time — expressions-design/03 §3.1). Every op is
  // owner-scoped via a compose-synthesized host principal (`imageryCardPrincipal`, the same the imagery card
  // reads use). The enqueue rides `workloads.start` in BULK mode (the deployment-wide single-active lock, §7 —
  // `caller: null` is trusted, the verb already proved per-character ownership); the resolved matte/labels/owner
  // travel in the params row. The matte-model op is the shared local-light RMBG op the backend registry built.
  spriteSheetOps = {
    enqueue: async ({ characterId, labels, matte, ownerId, stylePrompt }): Promise<{ workloadId: WorkloadId }> => {
      const started = await workloads.start({
        input: {
          kind: "expressions-sprite-sheet",
          params: { characterId, labels: [...labels], matte, ownerId, ...(stylePrompt !== undefined ? { stylePrompt } : {}) },
        },
        // Singular per-owner (E4): a user generating a sheet for their own character — a trusted system
        // enqueue (caller null) that scopes the row to the real owner (not a box-wide bulk sweep).
        caller: null,
        mode: "singular",
        ownerId,
      });
      return { workloadId: started.id };
    },
    // `character.get` throws CharacterNotFoundError on a vanished/foreign character (the pass fails cleanly);
    // description is nullable on the card (a card with no prose) → empty string for the prompt compiler.
    getCard: async (ownerId, characterId): Promise<SpriteSheetCard> => {
      const card = await character.get({ principal: imageryCardPrincipal(ownerId), characterId });
      return { name: card.name, description: card.description ?? "" };
    },
    generatePicture: async ({
      ownerId,
      prompt,
      negative,
      size,
    }): Promise<{ images: readonly { assetId: AssetId }[]; model: string; costUsd: number | null }> => {
      const pic = await imagery.generatePicture({ caller: imageryCardPrincipal(ownerId), mode: "free", prompt, negative, n: 1, size });
      return { images: pic.images.map((image) => ({ assetId: image.assetId })), model: pic.model, costUsd: pic.costUsd };
    },
    image: { sliceGrid: imageAdapter.sliceGrid, matteFlood: imageAdapter.matteFlood },
    // The local-light RMBG matte, always wired (local-light is unconditionally registered); a deploy that
    // wants the flood arm passes matte:"flood" explicitly, and a crashing model op fails the job (§4.3).
    matteModel: (bytes, opts): Promise<Uint8Array> => registry.matteModel(bytes, opts),
    assets: {
      store: async (ownerId, bytes): Promise<AssetId> => {
        const stored = await assets.store({ principal: imageryCardPrincipal(ownerId), bytes, kind: "sprite", mime: "image/png", enforceMagic: true });
        return stored.assetId;
      },
      readBytes: async (ownerId, assetId): Promise<Uint8Array> => {
        const owned = await assets.readOwnedAssetBytes(imageryCardPrincipal(ownerId), assetId);
        return owned.bytes;
      },
    },
  };

  // The compose-root agent speaker dispatch (D60; agent-principal-design/04 §5): the read + dispatch over the
  // shared `agentSpeakerSources` registry (above), extracted to `createAgentSpeakerResolver`. Chat never sees
  // this map — it holds only the source-blind `resolveAgentSpeaker(agentUserId)` op.
  const resolveAgentSpeaker = createAgentSpeakerResolver(db, agentSpeakerSources);
  // The D22 roster-chip "who is this agent?" projection (doc 06 §5) — the SAME source-blind registry, name +
  // sourceKind + owner handle only. Chat holds only `resolveAgentCardView(agentUserId)`.
  const resolveAgentCardView = createAgentCardViewResolver(db, agentSpeakerSources);

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

  // Chat is built last — it injects every service built above, the widest DI bundle in the system. It reads
  // the SAME toolUse registry built above (with buddy's tools already registered; rpg will join it later).
  // chat ↔ rpg compose cycle: chat exposes `rpgChatOps` to rpg (below); rpg exposes its 5 turn ops to chat. Break
  // it with a forward reference — chat receives a stable delegate bundle reading `rpgForChat`, filled right after
  // the rpg service + its standalone gather op are built below (turns run after compose ⇒ always set by then).
  let rpgForChat: ChatRpgOps | null = null;
  // chat ↔ crew compose cycle: chat needs the director GATHER op; the crew service needs chat's ops (editMessage,
  // injections) so it is built AFTER chat. Break it the same way — a forward-ref delegate reading `crewForChat`,
  // filled right after the crew service is built below (turns run after compose ⇒ always set by then).
  let crewForChat: Pick<CrewService, "gatherTurnContext"> | null = null;
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
    provisionAgentPrincipal: (params) => sessions.provisionAgentPrincipal(params),
    resolveAgentSpeaker,
    resolveAgentCardView,
    canAgent,
    runChatTurn: executor.runChatTurn,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
    gatherDatabank: databank.gatherRetrieval,
    // The E3 post-turn classify hook (expressions-design/02 §0) — the ONE injected op chat calls after a
    // variant commits; expressions stays fully composed above (its E3 ops resolve db/summarizer/bus/settings).
    expressions: { onTurnCompleted: (chatId, messageId, variantId) => expressions.onTurnCompleted(chatId, messageId, variantId) },
    // The 5 injected rpg turn ops (rpg-design/05 §0) — a forward-ref delegate reading `rpgForChat` (filled after
    // the rpg service is built below; the compose cycle). Every op no-ops until then (compose has no turns).
    rpg: {
      resolvePresetOverride: (chatId) => rpgForChat?.resolvePresetOverride(chatId) ?? Promise.resolve(null),
      gatherTurnContext: (chatId, pendingUserText, respondsToLatestUserTurn) =>
        rpgForChat?.gatherTurnContext(chatId, pendingUserText, respondsToLatestUserTurn) ?? Promise.resolve(null),
      markDicePreRollEligible: (turnId) => rpgForChat?.markDicePreRollEligible(turnId),
      onUserCommit: (chatId, messageId) => rpgForChat?.onUserCommit(chatId, messageId) ?? Promise.resolve(),
      onTurnCompleted: (chatId, messageId, variantId, turnId) => rpgForChat?.onTurnCompleted(chatId, messageId, variantId, turnId) ?? Promise.resolve(),
      onTurnAborted: (chatId, turnId, reason) => rpgForChat?.onTurnAborted(chatId, turnId, reason) ?? Promise.resolve(),
      // F5 seal read: the GM seat holder kind for a game rooted at this chat (null until rpg is wired ⇒ the seal
      // is a no-op — no games exist without rpg; the byte-identical null-op precedent).
      resolveGmSeatHolderKind: (chatId) => rpgForChat?.resolveGmSeatHolderKind(chatId) ?? Promise.resolve(null),
    },
    // The chat-crew director GATHER op (chat-crew-design/04 §1) — a forward-ref delegate reading `crewForChat`
    // (filled after the crew service is built below; the compose cycle). No-ops until then (compose has no turns).
    crew: { gatherTurnContext: (chatId) => crewForChat?.gatherTurnContext({ chatId }) ?? Promise.resolve(null) },
  });
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;

  // The saved-roster library leaf (D61; RP1). Owner-scoped CRUD + `applyToChat`, which PROJECTS a saved cast
  // onto chat's EXISTING chokepoints via the injected ops (never a second insert path; roster-preset never
  // imports chat). `assertCharacterOwned` is the owner-scoped card read (the assets/hub/expressions posture);
  // `loadPresentCharacterIds` narrows chat's member-gated `listParticipants` to the present character ids.


  const rosterPreset = createRosterPresetService({
    db,
    now,
    newRosterPresetId: minter(ID_PREFIX.rosterPreset),
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
    chat: {
      loadPresentCharacterIds: async ({ principal, chatId }) =>
        (await chat.listParticipants({ principal, chatId })).flatMap((p) => (p.kind === "character" && p.characterId !== null ? [p.characterId] : [])),
      addCharacterToChat: (params) => chat.addCharacterToChat(params),
      setSeatKnobs: (params) => chat.setSeatKnobs(params),
      setGroupConfig: (params) => chat.setGroupConfig(params),
    },
  });

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
    applyVariableOps: chatCompose.applyVariableOps,
    // The `trigger_turn` arm's autonomous turn (03 §1.6 / §4) → chat's `requestTurn`. `initiator:"automation"`
    // is HARDCODED here (automation cannot forge a different origin); the funder = the rule author (chat resolves
    // the funding host from the room + runs the engine's consent + budget belts). The guided steer rides as a
    // "response"-action GuidedSteer (the arm already macro-rendered it). Returns the narrow spend/count summary:
    // the $ ceiling reads the summed committed-reply `costUsd` (null when no reply metered a cost).
    requestTurn: async (req) => {
      const outcome = await chatCompose.requestTurn({
        chatId: req.chatId,
        initiator: "automation",
        funderUserId: req.authorUserId,
        automationDepth: req.automationDepth,
        ...(req.speakerCharacterId !== undefined ? { speakerCharacterId: req.speakerCharacterId } : {}),
        ...(req.guided !== undefined ? { guided: { action: "response", input: req.guided } } : {}),
      });
      const metered = outcome.messages.filter((m) => m.costUsd !== null);
      const costUsd = metered.length > 0 ? metered.reduce((sum, m) => sum + (m.costUsd ?? 0), 0) : null;
      return { costUsd, messageCount: outcome.messages.length };
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
        ...(req.params !== undefined ? { params: req.params } : {}),
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
      return { costUsd: picture.costUsd, imageCount: picture.images.length };
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
      return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
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
  const pluginMessageDefaultLimit = 20;
  const pluginMessageMaxLimit = 50;
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
      // The reduced plugin view (01 §2): id/role/authorDisplayName/characterId/seq/content only, oldest→newest,
      // content capped — no economics/promptSnapshot (the read floor is "what a member sees in the transcript").
      listMessages: async (chatId, opts) => {
        const limit = Math.min(opts?.limit ?? pluginMessageDefaultLimit, pluginMessageMaxLimit);
        const rows = await db
          .select({
            id: messagesTable.id,
            role: messagesTable.role,
            characterId: messagesTable.characterId,
            authorName: charactersTable.name,
            seq: messagesTable.seq,
            content: messageVariants.content,
          })
          .from(messagesTable)
          .innerJoin(messageVariants, eq(messageVariants.id, messagesTable.selectedVariantId))
          .leftJoin(charactersTable, eq(charactersTable.id, messagesTable.characterId))
          .where(eq(messagesTable.chatId, chatId))
          .orderBy(desc(messagesTable.seq))
          .limit(limit);
        return rows
          .map((r) => ({
            id: r.id,
            role: r.role,
            authorDisplayName: r.authorName ?? r.role,
            characterId: r.characterId,
            seq: r.seq,
            content: r.content.length > pluginMessageContentCap ? r.content.slice(0, pluginMessageContentCap) : r.content,
          }))
          .reverse();
      },
      getVariables: automationOps.chat.readVariables,
      applyVariableOps: automationOps.chat.applyVariableOps,
      // turn.trigger (01 §2) → chat's principal-free `requestTurn`. `initiator:"plugin"` is HARDCODED (a plugin
      // cannot forge a different origin); the funder is the INSTALLER (the bridge closed it over the installer —
      // never guest/infra-supplied). chat resolves the funding host from the room + gates the funder's membership
      // (leak-free NOT_FOUND) + runs the D17 by-proxy consent + per-member budget belts. PLUGIN-SPEND: the turn's
      // metered `costUsd` is projected as the SUM of the committed replies' per-message cost (the automation
      // requestTurn op precedent, :1505-1506) and returned to the bridge, which debits the plugin's per-day USD
      // budget (`plugin_budgets`) + bumps its action count — on TOP of the installer's own connection funding, the
      // engine's per-member turn budget, and the admin-only install gate. The cost never crosses to the guest.
      requestTurn: async ({ funderUserId, chatId, automationDepth, speakerCharacterId, guided }) => {
        const outcome = await chatCompose.requestTurn({
          chatId,
          initiator: "plugin",
          funderUserId,
          automationDepth,
          ...(speakerCharacterId !== undefined ? { speakerCharacterId: castId<CharacterId>(speakerCharacterId) } : {}),
          ...(guided !== undefined ? { guided: { action: "response", input: guided } } : {}),
        });
        const metered = outcome.messages.filter((m) => m.costUsd !== null);
        const costUsd = metered.length > 0 ? metered.reduce((sum, m) => sum + (m.costUsd ?? 0), 0) : null;
        return { costUsd };
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
    // n≤4), and the installer's Principal is resolved for connection + spend ATTRIBUTION. PLUGIN-SPEND: the
    // front door's metered `costUsd` is returned to the bridge, which debits the plugin's per-day USD budget
    // (`plugin_budgets`) + bumps its action count — on TOP of the installer's own credential funding, the n≤4
    // clamp, the membrane's ≤32 concurrent-host-call cap, and the admin-only install gate. The guest sees ONLY
    // the `{assetId}` (the bridge strips the cost before it crosses the realm boundary).
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
        return { assetId: first.assetId, costUsd: picture.costUsd };
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

  // The chat crew (chat-crew-design CW2): config surface + the keeper reader/applier + runNow + the scheduler
  // decision verb. Built HERE (after worldInfo + resolveOwnerPrincipal + workloads) since the keeper applier
  // injects those. `emitBus` is the transport-owned live instance; `emitDomainEvent` arms D46 automation;
  // `hasActiveGame` is the rpg-exclusion predicate (05 §h): crew never imports rpg, so the read rides an inline
  // `rpg_games` lookup HERE (the resolveChatHostPrincipal / resolvePartyActorKind injected-boundary precedent) —
  // TRUE while the chat holds any non-concluded game (setup/ready/active), so the crew members refuse to run
  // alongside the rpg director. The worldInfo ops bind the host principal (resolveOwnerPrincipal) since
  // world-info authorizes by ownership.
    const principal = await resolveOwnerPrincipal(req.ownerId);
    // The agent role is a per-user connection choice (D67 amendment); a crew keeper turn is a tool-less,



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
    expressions,
    imagery,
    notifications,
    persona,
    plugin,
    preset,
    rosterPreset,
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
