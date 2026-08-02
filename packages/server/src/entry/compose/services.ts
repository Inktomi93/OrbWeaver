// The composition root's KEYSTONE. `createServices` builds the infra handles (SecretBox/CAS/variant cache/image
// adapter/provider backend-registry), the in-process event bus, and the boot-global owner RoleClients bundle,
// then delegates each domain cluster to its sibling `entry/compose/*` seam builder (each takes an explicit deps
// object — the buildChatService precedent). Returns the `Services` bundle transport reads + the boot handles the
// lifecycle supervises/probes/wires.
//
// Determinism: `now` is an injected param (compose never calls Date.now()); id minters are built from
// mintTypeId/newId. Compose order: guards → sessions → settings → credentials → connection → roleClients →
// assets-character → search-discovery → admin → imagery → databank → chat → world-info → automation/plugin →
// portability/runner. settings' effective-config cache is warmed before the backend-registry (it sources the
// admin-resolved vllmConcurrency).
//
// THREE late-bind / forward-ref threads this keystone owns (each breaks a genuine construction cycle; the
// pattern is documented at each holder below): `materializeBackgroundOp` (rebound once assets is live),
// `enqueueEmbedReindex` (bound once workloads exists), `resolveViewerVisibility` (getter threaded into imagery
// before chat composes; the real const into automation after).

import { randomUUID } from "node:crypto";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ChatId, PresetId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, newId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { can, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import type { DefaultCharacterSeeder } from "#domain/character";
import type { ChatContext } from "#domain/chat";
import { createResolveViewerVisibility } from "#domain/chat";
import type { LocalEngineReachability } from "#domain/connection";
import { createConnectionService } from "#domain/connection";
import { createCredentialsService } from "#domain/credentials";
import type { DatabankIngest } from "#domain/databank";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { PresetNotFoundError } from "#domain/preset";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import type { SettingsContext, SettingsServiceDeps } from "#domain/settings";
import { createSettingsContext, createSettingsService } from "#domain/settings";
import type { TagContext } from "#domain/tag";
import { createTagService } from "#domain/tag";
import type { ToolUseService } from "#domain/tool-use";
import type { WorkloadContributions } from "#domain/workloads";
import { createImportStandaloneLorebook } from "#domain/world-info";
import type { EnginesPosture } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { isWireCaptureEnabled, logAudit, recordWireCapture } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { fetchOpenAiModels } from "#infra/network";
import type { BackendRegistryDeps, EngineStatusRecord, RoleClientsWithSignal, VllmEngineHandle } from "#infra/providers";
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
import { createChatBus, requireParticipant } from "../../domain/chat";
import { publishChatEvent, publishUserEvent } from "../../transport/trpc";
import type { Services } from "../../transport/trpc/context";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry";
import type { SocketRegistry } from "../../transport/trpc/stream/socket-registry";
import { createSocketRegistry } from "../../transport/trpc/stream/socket-registry";
import { createHostPrincipalResolver } from "../auth";
import type { DefaultPersonaSeeder } from "../boot";
import type { ImportWorldInfoPort } from "../import";
import { buildAdmin } from "./admin";
import { buildAssetsCharacter } from "./assets-character";
import { buildAutomationPlugin } from "./automation-plugin";
import type { ChatComposeResult } from "./chat";
import { buildChatService } from "./chat";
import { buildDatabank } from "./databank";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import type { DomainEventBus } from "./event-bus";
import { createDomainEventBus } from "./event-bus";
import { buildImagery } from "./imagery";
import { minter } from "./minter";
import { buildPortabilityRunner } from "./portability-runner";
import { bindRoleClientsForUser } from "./role-clients";
import type { RpgComposeResult } from "./rpg";
import { buildRpg } from "./rpg";
import { buildSearchDiscovery } from "./search-discovery";
import { buildSideGenParams } from "./side-gen-params";
import { buildWorkloadContributions } from "./workload-contributions";
import { buildWorldInfo } from "./world-info";

/** Reconstruct the effective engine POSTURE from the two boot facts compose receives (lossless: lifecycle
 *  passes `vllmManages = postureManages(posture)`, i.e. adopt-or-start ⟺ true; `vllmDisabled` ⟺ off). Fed to
 *  the connection send-availability gate (#54), which refuses a DOWN local engine only under `adopt-only`. */
function derivePosture(vllmDisabled: boolean, vllmManages: boolean): EnginesPosture {
  if (vllmDisabled) {
    return "off";
  }
  return vllmManages ? "adopt-or-start" : "adopt-only";
}

/** Map the sealed infra gen-engine lifecycle status → the connection domain's reachability vocab (the raw
 *  `EngineStatusRecord` status tuple never crosses the providers boundary). Exhaustive over the infra tuple:
 *  a new lifecycle status is a tsc error here until it is classified. `undefined` (no tick yet) → unknown. */
function toReachability(record: EngineStatusRecord | undefined): LocalEngineReachability {
  if (record === undefined) {
    return "unknown";
  }
  switch (record.status) {
    case "adopted":
    case "owned":
      return "up";
    case "sleeping":
    case "sleeping-held":
      return "asleep";
    case "starting":
    case "stack-pending":
      return "warming";
    case "down":
    case "hung":
    case "foreign":
    case "failed":
      return "down";
  }
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
  /** The fleet MANAGER posture (adopt-or-start) — the supervisor triggers spawns + owns auto-sleep; adopt-only
   *  adopts but never spawns. Absent ⇒ manager default. Derived from ENGINES_POSTURE at boot (lifecycle.ts). */
  readonly vllmManages?: boolean;
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
  /** The multiplexed-socket cells (SSE-1) — one per tab; composed here so its reap clock is the injected one. */
  readonly sockets: SocketRegistry;
  readonly sessions: SessionsService;
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly assets: AssetsService;
  readonly exportService: ExportService;
  readonly portability: PortabilityRegistry;
  readonly importWorldInfo: ImportWorldInfoPort;
  readonly eventBus: DomainEventBus;
  /** The kind-keyed workload contribution registry (the retired runner-env's replacement) — the worker
   *  driver dispatches through it. */
  readonly workloadContributions: WorkloadContributions;
  /** The databank ingest subsystem — surfaced so the seed script can run ONE document's ingest inline
   *  (the same op the `databank-ingest` contribution drives off the queue). */
  readonly databankIngest: DatabankIngest;
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
  /** The rpg `ChatRpgOps` runtime (the turn hooks chat fires) — surfaced top-level so the composed-real int
   *  test drives a turn's flush (`onTurnCompleted`) through the REAL compose graph (the [compose-stub-goes-stale]
   *  antidote). Not on the transport `Services` bundle (chat's turn lifecycle is its only production caller). */
  readonly rpgChatOps: RpgComposeResult["chatOps"];
  /** The ONE tool-use registry (rpg's 7 state tools registered into it) — surfaced so the composed-real int
   *  test drives a CHEAP tool turn through the REAL registered handlers (`resolveTools` + `executeToolCalls`),
   *  proving the compose tool-registration is live. Not on the transport `Services` bundle. */
  readonly toolUse: ToolUseService;
  /** The REAL chat-side rpg-facing ops (getMembership/postNarratorMessage/setRpgPointer/resolveRpgRoster) —
   *  the deps `buildRpg` closes over. Surfaced so the composed-real extraction test builds its own `buildRpg`
   *  over the SAME real chat wiring with only the executor/connection faked (never a live model). */
  readonly chatRpgOps: ChatComposeResult["rpgChatOps"];
}

/** Construct the full service graph + the boot handles. Async: the boot-global `RoleClients` bundle
 *  resolves each derive-role's connection once before the consumers that require it are built. */
export async function createServices(deps: ServicesDeps): Promise<ServicesResult> {
  const { db, now } = deps;
  const presence = createPresenceRegistry(now);
  const sockets = createSocketRegistry(now);

  const audit = (entry: AuditEntry, at: number): Promise<void> => logAudit(db, entry, at);
  const newUserId = (): UserId => newId<UserId>();
  const eventBus = createDomainEventBus();

  const sessions = createSessionsService({ db, now, sessionSecret: deps.sessionSecret });
  // PD-139(a): a settings write that changes the embed/imageEmbed model must enqueue a bulk purge+reindex.
  // `workloads` is built far below (the search-discovery seam), so this holder is late-bound after it exists;
  // the settings op derefs it at request time (a settings write), never during boot. Until then it is an inert
  // no-op.
  let enqueueEmbedReindex: () => void = () => undefined;
  // materializeBackground (side-eye F-P0-2): built after `assets` + `effectiveConfig` exist (the assets-character
  // seam), but settings/character/chat compose BEFORE `assets`, so they deref this late-bound holder at request
  // time (the `spriteSheetOps` pattern). Invoked only when a user pastes an external background URL.
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
  // The workload contribution registry is assembled LAST (it spans every owning domain, chat included) but
  // the workloads SERVICE is built mid-graph and needs it as its params validator — so the service holds this
  // late-bound thunk, derefed per verb call, exactly like portability's `getPortabilityRegistry`.
  let workloadContributions: WorkloadContributions | null = null;
  const getWorkloadContributions = (): WorkloadContributions => {
    if (workloadContributions === null) {
      throw new Error("compose: workload contributions derefed before the registry was assembled");
    }
    return workloadContributions;
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
    ...(deps.vllmManages !== undefined ? { vllmManages: deps.vllmManages } : {}),
    vllmConcurrency: {
      embed: resolved.vllmConcurrency.embed,
      summarize: resolved.vllmConcurrency.summarize,
    },
    // LIVE getter (not the boot snapshot) so an admin retune + engine restart applies the new launch flags.
    engineLaunch: () => effectiveConfig.getEffectiveConfig().engineLaunch,
    // LIVE getters (per batch / per request) so an admin retune applies WITHOUT a restart (Q6 / item 7).
    agentSdkSummarizeConcurrency: () => effectiveConfig.getEffectiveConfig().agentSdkConcurrency.summarize,
    genPresencePenalty: () => effectiveConfig.getEffectiveConfig().engineLaunch.genPresencePenalty,
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
    // The send-availability gate (#54) reads the effective posture + the gen engine's live reachability to
    // refuse a DOWN local engine ONLY under adopt-only (passive; never self-recovers). `vllmManages` absent ⇒
    // the manager default (adopt-or-start). The reachability is a cheap local supervisor read (no network);
    // null handle (vLLM disabled) ⇒ unknown, and the posture-`off` arm short-circuits before it is consulted.
    enginesPosture: derivePosture(deps.vllmDisabled, deps.vllmManages ?? true),
    localGenEngineReachability: (): LocalEngineReachability => toReachability(registry.vllmEngine?.status()["gen"]),
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

  // The one chat bus, built early (persona composes before buildChatService — chat needs persona.get for turn
  // assembly, a genuine cycle) and threaded into persona's write, expressions' classify emit, and
  // buildChatService.
  const chatBus = createChatBus({ db, now, newEventId: minter(ID_PREFIX.chatEvent) });
  const emitChatEvent = async (event: ChatBusEvent): Promise<void> => {
    const logged = await chatBus.emit(event);
    // `null` ⇒ the durable append was dropped + reported (bus.ts FLAG[emit-is-total], e.g. the chat was
    // deleted mid-turn). Durable-first means an un-logged event is never fanned — it has no replay cursor.
    // The fan carries `logged.event`, not the caller's — the bus stamped the §3.6 member projection onto it,
    // and the live path must deliver byte-for-byte what the durable replay will.
    if (logged !== null) {
      publishChatEvent(logged);
    }
  };

  // The side-gen sampling ladder's MIDDLE rung (WHICH preset's params a side-gen call reads) — ONE home so
  // every side-gen consumer resolves the caller/chat preset params the same way. `preset` composes below (the
  // search-discovery seam), so its `get` is a request-time forward-ref (the `getPreset` precedent — derefed only
  // when a side-gen call fires, never at boot). `resolveChatHostUserId` is the chat's PRESENT host (role='host',
  // leftSeq NULL) — the room authority whose preset a chat-scoped side-gen reads.
  const resolveChatHostUserId = async (chatId: ChatId): Promise<UserId | null> => {
    const rows = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
      .limit(1);
    return rows.at(0)?.userId ?? null;
  };
  const { resolveUserPresetParams, resolveChatPresetParams } = buildSideGenParams({
    preset: { get: (args) => preset.get(args) },
    settings,
    resolveChatHostUserId,
  });

  // ── assets + character + the two seeders (the assets-character seam). Threads the late-bound
  // materializeBackground holder + the request-time preset/persona forward-ref getters (both compose below).
  const assetsCharacter = buildAssetsCharacter({
    db,
    now,
    cas,
    variants,
    imageAdapter,
    emit: eventBus.emit,
    audit,
    tag,
    roleClients,
    materializeBackground,
    maxImageBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    imageVariantQuality: () => effectiveConfig.getEffectiveConfig().imageVariantQuality,
    settings,
    getPreset: () => preset,
    getPersona: () => persona,
    resolveUserPresetParams,
  });
  const { assets, character, galleryCtx, characterSeeder, personaSeeder } = assetsCharacter;
  // Now that `assets` exists, rebind the real materializeBackground op (the holder above forwards to it).
  materializeBackgroundOp = assetsCharacter.materializeBackgroundOp;

  // ── the derived-data cluster + persona/preset/stats/search/discovery/notifications/workloads (the
  // search-discovery seam). Produces `persona` + `preset` (forward-referenced above) and `workloads` +
  // `enqueueEmbedReindex` (bound onto the keystone's late-bound holder below).
  const searchDiscovery = buildSearchDiscovery({
    db,
    now,
    audit,
    roleClients,
    eventBus,
    attachCardTagByName: tag.attachCardTagByName,
    resolveUserPresetParams,
    character,
    assets,
    settings,
    getEffectiveConfig: () => effectiveConfig.getEffectiveConfig(),
    emitChatEvent,
    corpusAutoindex: resolved.corpusAutoindex,
    // preset's ONE cross-feature op (`resolveEffective` projects the funnel against the caller's own chat
    // model) — the SAME verb the client's params panel already reads, so the two can't disagree.
    resolveChatCapability: (args) => connection.resolveChatCapability(args),
    getContributions: getWorkloadContributions,
  });
  const { embeddings, indexer, persona, presetCtx, preset, stats, search, discovery, notifications, workloads } = searchDiscovery;
  // PD-139(a): bind the embed-model-change → bulk purge+reindex enqueue now that `workloads` exists.
  enqueueEmbedReindex = searchDiscovery.enqueueEmbedReindex;

  // ── admin + the ONE tool-use registry + the export service (the admin seam).
  const { admin, toolUse, exportService } = buildAdmin({
    db,
    now,
    newUserId,
    hashPassword: passwordHasher.hash,
    audit,
    sessions,
    vllmEngine: registry.vllmEngine,
    character,
    embeddings,
    embedModel: roleClients.embedModel,
    cas,
    imageTransform: imageAdapter.transform,
  });

  // ── imagery (the imagery seam). `resolveViewerVisibility` is a late-bound forward-ref (chat composes below);
  // the getter derefs the const once it exists.
  const imagery = buildImagery({
    db,
    now,
    connection,
    executor,
    assets,
    character,
    roleClients,
    maxImageBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    resolveViewerVisibility: (chatId, userId) => resolveViewerVisibility(chatId, userId),
    resolveUserPresetParams,
    resolveChatPresetParams,
    // ⑫ — the FOREIGN-inputs seam for the per-mode imagery prompt-template/caption overrides.
    loadUserSettings: settings.loadUserSettings,
    toolUse,
  });

  // ── databank (the databank seam) — built BEFORE chat so `gatherDatabank` (DB6) can inject into the chat build.
  const { databank, databankIngest } = buildDatabank({
    db,
    now,
    audit,
    assetsStore: assets.store,
    loadAssetBytes: assets.loadAssetBytes,
    embeddings,
    extractText,
    embedModel: roleClients.embedModel,
    search,
    workloads,
    loadUserSettings: settings.loadUserSettings,
  });

  // The host's REAL principal by userId — shared by chat compose and rpg's lite capability resolve (a game turn
  // runs as the host, D19).
  const resolveHostPrincipal = createHostPrincipalResolver(sessions);
  // FORWARD-REF (rpg-design/05 §4.10): chat's turn hooks call rpg's `ChatRpgOps`, but rpg builds AFTER chat
  // (chat's `rpgChatOps` is rpg's dep). The delegate below forwards to a late-bound holder bound SYNCHRONOUSLY
  // once rpg composes, a few lines down (the crew-delegate precedent) — no request can run before then, so the
  // holder is always live at call time (a null read would be a compose-order bug, hence the throw).
  let rpgOpsHolder: NonNullable<ChatContext["rpg"]> | null = null;
  const rpgOps = (): NonNullable<ChatContext["rpg"]> => {
    if (rpgOpsHolder === null) {
      throw new Error("rpg ops accessed before the rpg seam composed (compose-order bug)");
    }
    return rpgOpsHolder;
  };
  const rpgOpsDelegate: NonNullable<ChatContext["rpg"]> = {
    startGame: (chatId, params) => rpgOps().startGame(chatId, params),
    resolvePresetOverride: (chatId) => rpgOps().resolvePresetOverride(chatId),
    resolveUserMacros: (chatId) => rpgOps().resolveUserMacros(chatId),
    gatherTurnContext: (args) => rpgOps().gatherTurnContext(args),
    markDicePreRollEligible: (turnId) => rpgOps().markDicePreRollEligible(turnId),
    onUserCommit: (chatId, messageId) => rpgOps().onUserCommit(chatId, messageId),
    // biome-ignore lint/complexity/useMaxParams: mirrors the injected `ChatRpgOps.onTurnCompleted` contract signature (positional delegate).
    onTurnCompleted: (chatId, messageId, variantId, turnId, turn) => rpgOps().onTurnCompleted(chatId, messageId, variantId, turnId, turn),
    onTurnAborted: (chatId, turnId, reason) => rpgOps().onTurnAborted(chatId, turnId, reason),
    resolveGmSeatHolderKind: (chatId) => rpgOps().resolveGmSeatHolderKind(chatId),
    resolveReasoningHostOnly: (chatId) => rpgOps().resolveReasoningHostOnly(chatId),
    forkGame: (args) => rpgOps().forkGame(args),
  };
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
    rpg: rpgOpsDelegate,
  });
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;

  // The preset-ownership gate (fork-clones-the-game §3.2) — `forkGame` asks whether a source game's `gmPresetId`
  // is SAFE for the forker to carry (readable BY them). Off the preset front door `get` (the ONLY legal preset
  // import): it returns the preset for an owned row OR the shared system default, and throws `PresetNotFoundError`
  // for a preset the user can't read — the exact "foreign preset" the strip drops. Any OTHER error is a genuine
  // fault and RETHROWS (never swallowed into a false "not owned").
  const resolvePresetOwned = async (presetId: PresetId, userId: UserId): Promise<boolean> => {
    try {
      await preset.get({ userId, id: presetId });
      return true;
    } catch (err) {
      if (err instanceof PresetNotFoundError) {
        return false;
      }
      throw err;
    }
  };

  // ── rpg (the rpg seam) — the LITE vertical. Built AFTER chat (its `rpgChatOps` are rpg's cross-feature deps);
  // its `ChatRpgOps` are bound back onto the forward-ref holder above so chat's turn hooks reach the live rpg
  // service. Registers rpg's 7 state tools into the ONE tool registry (the imagery precedent).
  const rpgCompose = buildRpg({
    db,
    now,
    rpgChatOps: chatCompose.rpgChatOps,
    connection,
    executor,
    resolveHostPrincipal,
    resolvePresetOwned,
    // R4 promotion's durable half — the two front doors the injected `promoteToRoster` op mints through (a
    // character card + a chat roster seat, both under the room host). rpg reads neither table itself.
    character,
    chat: chatCompose.service,
    toolUse,
  });
  rpgOpsHolder = rpgCompose.chatOps;
  const rpg = rpgCompose.service;
  // THE cross-domain viewer-visibility op (the read-visibility D-entry): membership AND the D16 canon floor as
  // ONE answer for one human over one chat. Built ONCE here and injected into every non-chat consumer that
  // decides "may this human see this chat's CONTENT" — imagery's extractQuiet (via the late-bound getter above),
  // the automation plugin fan-out's delivery gate, and the plugin membrane's canon read. There is exactly ONE
  // clamp home (chat's `resolveHistoryFloorSeq`, reached only through this op).
  const resolveViewerVisibility = createResolveViewerVisibility({ db });

  // ── world-info + the import ports + the bulk importers + the OWNER-principal resolver (the world-info seam).
  const worldInfoCompose = buildWorldInfo({
    db,
    now,
    audit,
    sessions,
    emitChatBusEvent,
    assets,
  });
  const { worldInfo, importWorldInfo, bulkImportChats, bulkImportPersonas, resolveOwnerPrincipal } = worldInfoCompose;

  // ── automation + plugin (the automation-plugin seam) — built LAST of the domain services (both close over
  // chat/world-info/imagery/notifications + resolveOwnerPrincipal; plugin reuses automation's op objects).
  const { automation, plugin } = await buildAutomationPlugin({
    db,
    now,
    chatCompose,
    resolveViewerVisibility,
    worldInfo,
    notifications,
    imagery,
    settings,
    assets,
    toolUse,
    resolveOwnerPrincipal,
    bindRoleClients,
    resolveUserPresetParams,
  });

  // ── portability + the workloads runner-env (the portability-runner seam) — built LAST.
  const { portability, importWorkloads } = buildPortabilityRunner({
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
    galleryCtx,
    persona,
    exportService,
    character,
    assets,
    attachCardTag: tag.attachCardTagByName,
    importWorldInfo,
    bulkImportChats,
    bulkImportPersonas,
    resolveOwnerPrincipal,
    workloads,
    ...(deps.importStagingDir !== undefined ? { importStagingDir: deps.importStagingDir } : {}),
    ...(deps.stProfileDir !== undefined ? { stProfileDir: deps.stProfileDir } : {}),
  });

  // Assemble the contribution registry + close the late-bound holder the workloads verbs deref.
  workloadContributions = buildWorkloadContributions({
    db,
    now,
    cas,
    embeddings,
    discovery,
    connection,
    assets,
    databankIngest,
    importWorkloads,
    purgeDocumentVectors: async (): Promise<void> => {
      // The purge's row counts are advisory — the sweep's own counts are the workload result.
      await embeddings.purgeDocumentVectors();
    },
    backfillMemory: (args) => chatCompose.backfill.memory(args),
    backfillGroupCharacters: (args) => chatCompose.backfill.groupCharacters(args),
    purgeMemoryVectors: async (): Promise<void> => {
      // The purge's row counts are advisory — the sweep's own counts are the workload result.
      await embeddings.purgeMemoryVectors();
    },
    loadUserSettings: settings.loadUserSettings,
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
    rpg,
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
    sockets,
    sessions,
    embeddings,
    indexer,
    assets,
    exportService,
    portability,
    importWorldInfo,
    eventBus,
    workloadContributions,
    databankIngest,

    roleClients,
    bindRoleClients,
    audit,
    effectiveConfig,
    secretBox,
    vllmEngine: registry.vllmEngine,
    characterSeeder,
    personaSeeder,
    rpgChatOps: rpgCompose.chatOps,
    toolUse,
    chatRpgOps: chatCompose.rpgChatOps,
  };
}
