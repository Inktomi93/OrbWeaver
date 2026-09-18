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
// LANDING A NEW DOMAIN IS ONE CHANGE ACROSS SIX SITES — the first two are the only ones `tsc` forces:
// the `Services` type + its build here, the domain's own `entry/compose/<name>.ts` seam, the tRPC router
// registration, the domain's `DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES` row if it carries a non-template root file
// (`tooling/src/verify/gates/feature-structure.ts`), its `BASELINE_RIDER_PRODUCERS` entry removed the moment the
// real producer lands (`tooling/src/verify/gates/db-structure.ts` — the row is self-staling), and a PROBED-or-
// EXEMPT classification for every new procedure in `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`
// (its completeness guard enumerates the live router, so the sweep grows with it).
//
// TWO STANDING HAZARDS AT THIS SEAM, both silent:
//   • A STUBBED op rots. A predicate wired here as `() => Promise.resolve(false)` "until domain X exists"
//     stays false after X lands — every verb-level test still passes (they inject their own fake), and only
//     a composed-real integration test through `createServices` proves the seam. Wiring a new domain
//     therefore SWEEPS this file for stub ops naming it. The same shape one level down: an injected-op
//     mapping that copies request fields one-by-one silently DROPS a field the op's request type gained,
//     and an optional field cannot red an explicit copy — widen the mapping in the same change.
//   • An injected op that reads TENANT-SCOPED data must either take the caller and gate inside, or be
//     WRAPPED here with the gate before any read (the `extractQuiet` precedent — a leak-free
//     `DomainNotFoundError` first). An op whose params cannot carry a caller can never check membership,
//     so every future caller silently inherits an unfenced read.
//
// THREE late-bind / forward-ref threads this keystone owns (each breaks a genuine construction cycle; the
// pattern is documented at each holder below): `materializeBackgroundOp` (rebound once assets is live),
// `enqueueEmbedReindex` (bound once workloads exists), `resolveViewerVisibility` (getter threaded into imagery
// before chat composes; the real const into automation after).

import { randomUUID } from "node:crypto";
import type { DurableChatBusEvent, LiveOnlyChatBusEvent, LiveOnlyChatEventType } from "@orb/contracts/chat";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import { readSeedDemoChat } from "@orb/default-content";
import type { AssetId, CharacterId, ChatId, PersonaId, PluginId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, newId } from "@orb/kit/ids";
import { packShowcaseBundle, readShowcaseManifest } from "@orb/showcase-plugins";
import { and, eq, isNull } from "drizzle-orm";
import { can, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import { createAutomationTeachingContributions } from "#domain/automation";
import type { DefaultCharacterSeeder } from "#domain/character";
import type { ChatContext, ChatUserMacroDefs, DemoChatSeeder, MemoryRecallRecorder } from "#domain/chat";
import { createDemoChatSeeder, createMemoryRecallRecorder, createResolveViewerVisibility, loadSeededChatDressing } from "#domain/chat";
import type { LocalEngineReachability } from "#domain/connection";
import { createConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import { createCredentialsService } from "#domain/credentials";
import type { DatabankIngest } from "#domain/databank";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createImportService } from "#domain/import";
import { PersonaNotFoundError } from "#domain/persona";
import { createPluginMacroRegistry } from "#domain/plugin";
import { createCopyPresetToUser, PresetNotFoundError } from "#domain/preset";
import type { RpgTraceRecorder } from "#domain/rpg";
import { createExportRpgGame, createRpgTraceRecorder } from "#domain/rpg";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import type { SettingsContext, SettingsServiceDeps } from "#domain/settings";
import { createSettingsContext, createSettingsService } from "#domain/settings";
import type { TagContext } from "#domain/tag";
import { createTagService } from "#domain/tag";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseTeachingContributions } from "#domain/tool-use";
import type { WorkloadContributions } from "#domain/workloads";
import { createAttachOwnedBooksByName, createImportStandaloneLorebook } from "#domain/world-info";
import type { EnginesPosture } from "#foundation/env";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { isWireCaptureEnabled, logAudit, recordWireCapture } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { fetchOpenAiModels, probeOpenAiEndpoint } from "#infra/network";
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
import { createChatBus, requireParticipant } from "../../domain/chat/index.ts";
import type { Services } from "../../transport/trpc/context.ts";
import { publishChatEvent, publishUserEvent, silenceRoomEntityFan } from "../../transport/trpc/index.ts";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry.ts";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry.ts";
import type { SocketRegistry } from "../../transport/trpc/stream/socket-registry.ts";
import { createSocketRegistry } from "../../transport/trpc/stream/socket-registry.ts";
import { createHostPrincipalResolver } from "../auth/index.ts";
import type { DefaultPersonaSeeder, DistributedPluginApplier, ExamplePluginSeeder } from "../boot/index.ts";
import { createDistributedPluginApplier, createExamplePluginSeeder } from "../boot/index.ts";
import type { ImportWorldInfoPort } from "../import/index.ts";
import { buildImportContext } from "../import/index.ts";
import { buildAdmin } from "./admin.ts";
import { buildAssetsCharacter } from "./assets-character.ts";
import { buildAutomationPlugin } from "./automation-plugin.ts";
import type { ChatComposeInput, ChatComposeResult } from "./chat.ts";
import { buildChatService } from "./chat.ts";
import { buildDatabank } from "./databank.ts";
import { createDemoChatGameDoor } from "./demo-chat-game.ts";
import type { EffectiveConfigWiring } from "./effective-config.ts";
import { createEffectiveConfigWiring } from "./effective-config.ts";
import type { DomainEventBus } from "./event-bus.ts";
import { createDomainEventBus } from "./event-bus.ts";
import { buildImagery } from "./imagery.ts";
import { minter } from "./minter.ts";
import { buildPortabilityRunner } from "./portability-runner.ts";
import { mapProviderCredentialResolver } from "./provider-credential.ts";
import { buildRefinery } from "./refinery.ts";
import { buildRegex } from "./regex.ts";
import { bindRoleClientsForUser, createUnboundRoleClients } from "./role-clients.ts";
import { buildRosterPreset } from "./roster-preset.ts";
import type { RpgComposeResult } from "./rpg.ts";
import { buildRpg } from "./rpg.ts";
import { buildSearchDiscovery } from "./search-discovery.ts";
import { createSessionEntryWriter } from "./session-entries.ts";
import { buildSideGenParams } from "./side-gen-params.ts";
import { buildWorkloadContributions } from "./workload-contributions.ts";
import { buildWorldInfo } from "./world-info.ts";

/** Which LIVE-ONLY chat-bus members bulk quiet mode may coalesce (design §5 / fork F-B). Read on every
 *  live-only fan, and TOTAL over the lane by `satisfies` — a third live-only member fails `tsc` here until
 *  someone decides which it is, instead of silently inheriting "not coalescable".
 *    • `roomEntityChanged` = CHURN. A bulk import touching N seated entities fans N×rooms of it, and each
 *      tick cancels+restarts every open member's in-flight refetch — the exact storm W8 was built for.
 *    • `chatDeleted` = a TERMINAL, one per room ever. There is no storm to contain, and silencing even its
 *      first tick would leave an open device pointed at a room that is gone until the bulk scope exits.
 *    • `memoryRecall` = a bounded PHASE PAIR (#313), at most one recalling→recalled per scoped speaker per
 *      turn. Its recalling→recalled transition IS the header brain-icon's signal — coalescing would drop the
 *      "recalling…" tell (the hang indicator) — and a turn is never a bulk fan, so there is no storm to contain. */
const QUIET_COALESCABLE = {
  roomEntityChanged: true,
  chatDeleted: false,
  memoryRecall: false,
} as const satisfies Record<LiveOnlyChatEventType, boolean>;

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
  /** The boot-time owner id. `undefined` in OIDC mode when no owner row exists yet (the first
   *  owner-policy OIDC login will create it). When absent, role-client binding is deferred and every
   *  provider call fails closed until the owner provisions. */
  readonly ownerId: UserId | undefined;
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
  /** Mirrors `characterSeeder`, for the default `{{user}}` persona. */
  readonly personaSeeder: DefaultPersonaSeeder;
  /** Mirrors `characterSeeder`, for the bundled EXAMPLE conversations. MUST run AFTER `characterSeeder` —
   *  each example attaches to seeded cards (a missing handle skips that example, never a partial room). */
  readonly demoChatSeeder: DemoChatSeeder;
  /** Mirrors `characterSeeder`, for the two SHOWCASE PLUGIN examples. Independent of the three above (it
   *  attaches to nothing), and it seeds the rows INSTALLED-BUT-UNGRANTED — the user's first act is consent. */
  readonly examplePluginSeeder: ExamplePluginSeeder;
  /** The SERVER-WIDE published plugin set applied to a user (D147 clause (d)) — the new-user half of the admin
   *  fan-out, driven by the same first-authed-request hook and latched per user. Distinct from
   *  `examplePluginSeeder`: that ships with the build, this is whatever THIS deployment's admin published. */
  readonly distributedPluginApplier: DistributedPluginApplier;
  /** The rpg `ChatRpgOps` runtime (the turn hooks chat fires) — surfaced top-level so the composed-real int
   *  test drives a turn's flush (`onTurnCompleted`) through the REAL compose graph (the [compose-stub-goes-stale]
   *  antidote). Not on the transport `Services` bundle (chat's turn lifecycle is its only production caller). */
  readonly rpgChatOps: RpgComposeResult["chatOps"];
  /** R-OBS — the rpg flight recorder's READ half, or `undefined` when tracing is off. `lifecycle.ts` hands it
   *  to `createApp`, which registers `/api/_debug/rpg/traces` only when it is present (the route's own
   *  `rpgTrace === undefined ⇒ not registered` contract, `foundation/observability/debug/routes.ts`). */
  readonly rpgTrace: RpgTraceRecorder | undefined;
  /** #412 — whether THIS compose actually wired the provider wire-capture request sink (`deps.wireCapture`
   *  OR the env flag). `lifecycle.ts` hands it to `createApp`, which publishes it on
   *  `/api/_debug/wire/captures` as `enabled` so a reader can tell an off recorder from a quiet one. Surfaced
   *  because the decision lives HERE and nothing downstream can re-derive the force-flag half. */
  readonly wireCaptureOn: boolean;
  /** #250 — the memory-recall flight recorder's READ half. Always present (the recorder is unconditional);
   *  `lifecycle.ts` hands it to `createApp`, which registers `/api/_debug/memory/recalls` over it. */
  readonly recallRecorder: MemoryRecallRecorder;
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
    // D8 `session_entries` write path (issue #71) — the sealed agent-sdk backend never touches @orb/db
    // itself; this is the compose-root op it persists a lineage entry through.
    sessionWriter: createSessionEntryWriter(db),
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
    genRepetitionPenalty: () => effectiveConfig.getEffectiveConfig().engineLaunch.genRepetitionPenalty,
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
    // The custom_openai health arm: infra/network dials the row's own endpoint (host-pinned safeFetch),
    // stamping `checkedAt` from the composition clock (no-raw-clock).
    probeEndpoint: (args): Promise<CredentialHealth> => probeOpenAiEndpoint(args, now),
    inspect: (req): Promise<EndpointInspection> => diagnostics.inspect(req),
    fetchModels: fetchOpenAiModels,
    audit,
    emitUserEvent: publishUserEvent,
  });
  const resolveProviderCredential = mapProviderCredentialResolver(credentials.resolve);
  const providerCredentials: CredentialsService = { ...credentials, resolve: resolveProviderCredential };
  const vllmAvailable = !deps.vllmDisabled;
  const connection = createConnectionService({
    db,
    now,
    resolveCredential: (params): Promise<ResolvedCredential> => resolveProviderCredential(params),
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
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — the ONE `requireOwner`/`can()`
      // kernel's refusal collapses to a boolean verdict; a denied check can never read as owner. Ends if
      // `requireOwner` grows a distinct infra-error class this boolean must stop swallowing.
      try {
        requireOwner(principal);
        return true;
      } catch {
        return false;
      }
    },
  });

  // D135 clause G — the binder's `Principal` is READ off `users.role` through the one row→Principal home,
  // never stamped in the binder. The subject is not always the box owner: `/autobg` binds a bundle for an
  // automation rule's AUTHOR (`automation-plugin.ts`), and a rule author only needs D18 ROOM host authority.
  // Bound here rather than reusing `resolveHostPrincipal` (built ~150 lines below, at the chat seam) because
  // the boot bundle on the next line needs it now; both are the same `createHostPrincipalResolver` closure.
  const resolveRoleClientPrincipal = createHostPrincipalResolver(sessions);
  const bindRoleClients = (ownerId: UserId): Promise<RoleClientsWithSignal> =>
    bindRoleClientsForUser(
      {
        connection,
        executor,
        resolvePrincipal: resolveRoleClientPrincipal,
        // A thunk, like `structuredOutputShape` below: an admin flip governs the next structured call.
        structuredOutputVehicle: () => effectiveConfig.getEffectiveConfig().structuredOutputVehicle,
        // THE DERIVE-ROLE CREDENTIAL STRIKE-OUT (#1800) — a DIRECT wire, for the same reason the chat
        // seam's twin is one (`entry/compose/chat.ts`): the binder already carries the provider's own
        // `ProviderErrorKind` plus the credentialId that call authenticated with, which is exactly
        // `MaybeRevokeParams`, so an adapter here could only re-derive a fact it was handed — and #1373's
        // whole defect was an adapter whose re-derived vocabulary the verb could never match.
        maybeRevokeOnAuthFailed: credentials.maybeRevokeOnAuthFailed,
      },
      ownerId,
    );
  // OIDC lazy-mint (#1853): when no owner exists at boot the role-clients bundle is a fail-closed stub;
  // every provider call throws until the first owner-policy OIDC login provisions the row and the
  // per-call `live()` re-resolution succeeds naturally (role-clients are already hot-reloadable per call).
  const roleClients = deps.ownerId !== undefined ? await bindRoleClients(deps.ownerId) : createUnboundRoleClients();

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
  const emitChatEventChecked: ChatComposeInput["emitChatEventChecked"] = async (event, claimStatement) => {
    const logged = claimStatement === undefined ? await chatBus.emit(event) : await chatBus.emitAfterClaim(event, claimStatement);
    // `false` ⇒ another retry owned the claim: converged success with nothing to fan. `null` ⇒ the durable
    // append was dropped + reported (bus.ts FLAG[emit-is-total], e.g. the chat was
    // deleted mid-turn). Durable-first means an un-logged event is never fanned — it has no replay cursor.
    // The fan carries `logged.event`, not the caller's — the bus stamped the §3.6 member projection onto it,
    // and the live path must deliver byte-for-byte what the durable replay will.
    if (logged === false) {
      return true;
    }
    if (logged !== null) {
      publishChatEvent(logged);
      return true;
    }
    return false;
  };
  const emitChatEvent = async (event: DurableChatBusEvent): Promise<void> => {
    await emitChatEventChecked(event);
  };
  const prepareChatCreationEvent: ChatComposeInput["prepareChatCreationEvent"] = (event) => {
    const prepared = chatBus.prepareCreation(event);
    return {
      statement: prepared.statement,
      publishCommitted: (): void => publishChatEvent(prepared.publishCommitted()),
    };
  };
  // THE LIVE-ONLY FAN (entity→room member-freshness bridge, design §3.4) — the durable-append-free twin of
  // `emitChatEvent`. No `chat_events` INSERT, no ring entry, no seq: the member carries no canon, so there is
  // nothing to replay and a durable row would only cost an INSERT per seated room per edit. The pump yields it
  // at the CURRENT cursor (`stream/sources/chat.ts`, the attach-synthetic non-advancement rule) and the client
  // admits it by TYPE. Restricted to `LiveOnlyChatBusEvent` — a durable member cannot take this door, and a
  // live-only member cannot take the durable one (both `chatBus.emit` and `emitChatEvent` narrow the other way).
  // Not async and never rejecting: a no-listener publish is a free `EventEmitter.emit`, so there is no failure
  // mode to classify (contrast the durable path's FLAG[emit-is-total] append classification).
  //
  // BULK QUIET MODE applies to exactly ONE of the lane's two members (`transport/trpc/quiet-fanout.ts`,
  // design §5 / fork F-B), and {@link QUIET_COALESCABLE} above is the belt that keeps that a DECISION rather
  // than an accident.
  const emitChatEventLive = (event: LiveOnlyChatBusEvent): void => {
    const publish = (): void => {
      publishChatEvent({ seq: null, event });
    };
    if (QUIET_COALESCABLE[event.type] && event.type === "roomEntityChanged" && silenceRoomEntityFan(event.chatId, event.entity, publish)) {
      return;
    }
    publish();
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
    emitChatEventLive,
    corpusAutoindex: resolved.corpusAutoindex,
    // preset's ONE cross-feature op (`resolveEffective` projects the funnel against the caller's own chat
    // model) — the SAME verb the client's params panel already reads, so the two can't disagree.
    resolveChatCapability: (args) => connection.resolveChatCapability(args),
    getContributions: getWorkloadContributions,
  });
  const { embeddings, indexer, persona, resolvePersonasForParticipants, presetCtx, preset, stats, search, discovery, notifications, workloads } =
    searchDiscovery;
  // PD-139(a): bind the embed-model-change → bulk purge+reindex enqueue now that `workloads` exists.
  enqueueEmbedReindex = searchDiscovery.enqueueEmbedReindex;

  // ── the refinery seam (R1) — the card-refinery pipeline over the summarize rung. Needs `character`
  // (the four injected ops) + the caller-scoped preset/prose resolvers; nothing composes on top of it.
  const { refinery, refineryWorkloads } = buildRefinery({
    db,
    now,
    roleClients,
    character,
    resolveUserPresetParams,
    loadUserSettings: settings.loadUserSettings,
  });

  // ── the regex script LIBRARY (D121-E). Built before admin/chat: admin's export service needs its card
  // RE-EMBED op and chat's context needs its four-scope RESOLVE op.
  const regexCompose = buildRegex({ db, now, audit, emitChatEventLive });

  // ── admin + the ONE tool-use registry + the export service (the admin seam).
  const { admin, toolUse, exportService } = buildAdmin({
    db,
    now,
    newUserId,
    hashPassword: passwordHasher.hash,
    audit,
    sessions,
    // W7a — an admin revoke ends the streams those sessions opened, not just the cookies. The registry is
    // built above in this same function (transport state, entry-owned clock), so the port wires here.
    sockets: { evictSession: (sessionId) => sockets.evictSession(sessionId), evictUser: (userId) => sockets.evictUser(userId) },
    vllmEngine: registry.vllmEngine,
    character,
    embeddings,
    embedModel: () => roleClients.embedModel,
    cas,
    imageTransform: imageAdapter.transform,
    exportCardScripts: regexCompose.exportCardScripts,
    // R6 — the chat-anchored campaign READ the orb-native chat-bundle export carries. A standalone factory
    // (db only), so it wires here rather than waiting on the rpg compose seam below.
    exportRpgGame: createExportRpgGame({ db }),
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
    // IMGMAC — the imagery mode templates' user-macro plane, from BOTH authoring homes. Late-bound for the
    // same reason `resolveViewerVisibility` is: chat and rpg both compose below, and this arrow is only
    // called at request time. Handed UNMERGED — the shadow policy is chat's law (`buildTurnUserMacros`).
    resolveUserMacroDefs: (chatId) => resolveChatUserMacroDefs(chatId),
    // ⑫ — the FOREIGN-inputs seam for the per-mode imagery prompt-template/caption overrides.
    loadUserSettings: settings.loadUserSettings,
    toolUse,
  });

  // ── databank (the databank seam) — built BEFORE chat so `gatherDatabank` (DB6) can inject into the chat build.
  const { databank, databankIngest, databankPortability } = buildDatabank({
    db,
    now,
    audit,
    assetsStore: assets.store,
    loadAssetBytes: assets.loadAssetBytes,
    embeddings,
    extractText,
    embedModel: () => roleClients.embedModel,
    search,
    workloads,
    loadUserSettings: settings.loadUserSettings,
  });

  // The host's REAL principal by userId — shared by chat compose and rpg's lite capability resolve (a game turn
  // runs as the host, D19).
  const resolveHostPrincipal = createHostPrincipalResolver(sessions);
  // FORWARD-REF (rpg-design/05 §4.10): chat's turn hooks call rpg's `ChatRpgOps`, but rpg builds AFTER chat
  // (chat's `rpgChatOps` is rpg's dep). The delegate below forwards to a late-bound holder bound SYNCHRONOUSLY
  // once rpg composes, a few lines down (the agents-delegate precedent) — no request can run before then, so the
  // holder is always live at call time (a null read would be a compose-order bug, hence the throw).
  let rpgOpsHolder: NonNullable<ChatContext["rpg"]> | null = null;
  const rpgOps = (): NonNullable<ChatContext["rpg"]> => {
    if (rpgOpsHolder === null) {
      throw new Error("rpg ops accessed before the rpg seam composed (compose-order bug)");
    }
    return rpgOpsHolder;
  };
  const rpgOpsDelegate: NonNullable<ChatContext["rpg"]> = {
    planGameBirth: (chatId, params) => rpgOps().planGameBirth(chatId, params),
    gameBirthCommitted: (chatId) => rpgOps().gameBirthCommitted(chatId),
    resolvePresetOverride: (chatId) => rpgOps().resolvePresetOverride(chatId),
    resolveUserMacros: (chatId) => rpgOps().resolveUserMacros(chatId),
    gatherTurnContext: (args) => rpgOps().gatherTurnContext(args),
    markDicePreRollEligible: (turnId) => rpgOps().markDicePreRollEligible(turnId),
    onUserCommit: (chatId, messageId) => rpgOps().onUserCommit(chatId, messageId),
    // biome-ignore lint/complexity/useMaxParams: mirrors the injected `ChatRpgOps.onTurnCompleted` contract signature (positional delegate).
    onTurnCompleted: (chatId, messageId, variantId, turnId, turn) => rpgOps().onTurnCompleted(chatId, messageId, variantId, turnId, turn),
    onTurnAborted: (chatId, turnId, reason) => rpgOps().onTurnAborted(chatId, turnId, reason),
    cancelStateRounds: (chatId, principalUserId) => rpgOps().cancelStateRounds(chatId, principalUserId),
    resolveGmSeatHolderKind: (chatId) => rpgOps().resolveGmSeatHolderKind(chatId),
    resolveReasoningHostOnly: (chatId) => rpgOps().resolveReasoningHostOnly(chatId),
    forkGame: (args) => rpgOps().forkGame(args),
    handoffHealStatements: (args) => rpgOps().handoffHealStatements(args),
    handoffWouldCopyGmPreset: (chatId, nomineeUserId) => rpgOps().handoffWouldCopyGmPreset(chatId, nomineeUserId),
    handoffRekeyActors: (chatId, cardCopies) => rpgOps().handoffRekeyActors(chatId, cardCopies),
  };
  // #250 — the memory-recall flight recorder. Built UNCONDITIONALLY (unlike `rpgTrace`): the slice it retains
  // is produced by every recall anyway (it is the assembly trace's memory row), so the ring's only cost is
  // holding a bounded number of already-built objects — and an observability lens that first requires a
  // restart with a flag set does not answer "why did memory surface that".
  const recallRecorder = createMemoryRecallRecorder({ now });
  // The PLUGIN-MACRO registry (plugin-ui-plane §5.15, U6) — ONE process-wide instance, minted HERE rather than
  // inside the plugin plane because chat composes FIRST and both sides need the same object: chat reads it per
  // turn (`ChatContext.pluginMacros`), the plugin plane writes it at activation. Minting it at the shared root
  // is what keeps this out of the late-bind shape the S4 confirmed-act runner had to take.
  const pluginMacros = createPluginMacroRegistry();
  const chatCompose = buildChatService({
    toolUse,
    db,
    now,
    recallRecorder,
    // U6 §5.15 — the per-turn plugin-macro resolve, off the registry minted just above (the plugin plane below
    // registers into the SAME instance at activation).
    pluginMacros: pluginMacros.resolveForTurn,
    emitChatEvent,
    emitChatEventChecked,
    prepareChatCreationEvent,
    emitChatEventLive,
    holder: deps.holder ?? "replica-default",
    sessionSecret: deps.sessionSecret,
    resolveHostPrincipal,
    audit,
    can,
    roleClients,
    connection,
    credentials: providerCredentials,
    character,
    persona,
    resolvePersonasForParticipants,
    preset,
    settings,
    notifications,
    search,
    assets,
    materializeBackground,
    embeddings,
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    runChatTurn: executor.runChatTurn,
    // The Anthropic prompt-cache depth FLOOR, read PER TURN off the resolved AppSettings tier (Settings ›
    // Admin › System tuning). A thunk for the same reason `structuredOutputShape` below is one: an admin flip
    // must govern the next turn with no restart.
    promptCacheMinDepth: () => effectiveConfig.getEffectiveConfig().promptCacheMinDepth,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
    gatherDatabank: databank.gatherRetrieval,
    rpg: rpgOpsDelegate,
    resolveRegexSources: regexCompose.resolveRegexSources,
    // The FOREIGN S2 teaching contributions (D145's registry). tool-use's contribution attaches the turn
    // HOST's own plugin tools — the second door D146 governs, the first being automation's `run_tool` arm.
    // Automation's contribution (C1/S5) delivers the chat's standing ANALYSIS GUIDANCE — one verbatim,
    // macro-inert authors-note-register line whose read self-gates on enabled + author-is-the-turn-host
    // (a handoff or disable makes the very next turn read nothing). It takes only `db` — the read exists
    // before the automation service composes, which is why registering it here creates no ordering knot.
    // Assembled HERE, at the composition root, because that is the only place a contribution may be
    // registered: the `domain-teaching-contribution-compose-only` cruiser stanza makes the owning domain's
    // front door the sole legal importer, so no verb can reach the factory and call it inline.
    teaching: [
      ...createToolUseTeachingContributions({ listDrivableToolNames: (userId) => toolUse.listDrivableToolNames(userId) }),
      ...createAutomationTeachingContributions({ db }),
    ],
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
  // R-OBS — the rpg flight recorder. Built ONLY when tracing is enabled, and `undefined` otherwise: the emit
  // sites guard with `deps.trace?.(…)`, so an untraced deployment never even constructs an event object and
  // its turns are byte-identical. The explicit `rpgTrace` dep wins over the env so an int test / the drive kit
  // never depends on the ambient environment (the `wireCapture` precedent, and the [[ENV-BLEEDS-INTO-TESTS]]
  // lesson: a test that reads the operator's `.env` is a test that passes on the wrong machine).
  // THE cross-domain viewer-visibility op (the read-visibility D-entry): membership AND the D16 canon floor as
  // ONE answer for one human over one chat. Built ONCE here and injected into every non-chat consumer that
  // decides "may this human see this chat's CONTENT" — imagery's extractQuiet (via the late-bound getter
  // above), the automation plugin fan-out's delivery gate, the plugin membrane's canon read, and rpg's
  // member-facing reads (#1528). There is exactly ONE clamp home (chat's `resolveHistoryFloorSeq`, reached
  // only through this op). Declared BEFORE the rpg compose because rpg consumes it; it needs only `db`.
  const resolveViewerVisibility = createResolveViewerVisibility({ db });

  const rpgTrace = (deps.rpgTrace ?? env.RPG_TRACE === "on") ? createRpgTraceRecorder({ now }) : undefined;
  const rpgCompose = buildRpg({
    db,
    now,
    ...(rpgTrace === undefined ? {} : { trace: rpgTrace.sink }),
    rpgChatOps: chatCompose.rpgChatOps,
    // #1528 — the member-facing rpg reads' PROJECTION verdict (hidden-span posture + the D16 floor). The SAME
    // op every other non-chat consumer takes: one clamp home, one hidden-content verdict.
    resolveViewerVisibility,
    connection,
    executor,
    resolveHostPrincipal,
    resolvePresetOwned,
    // The GM-preset GIFT — the handoff copy offer's preset arm (preset owns the `presets` table; both owners
    // stay explicit params so no call site can drop one). Absent an offer this op is never called and the
    // built conditional heal stands.
    copyPresetToUser: createCopyPresetToUser({ db, now, newPresetId: minter(ID_PREFIX.preset) }),
    // R4 promotion's durable half — the two front doors the injected `promoteToCharacter` op mints through (a
    // character card + a chat roster seat, both under the room host). rpg reads neither table itself.
    character,
    chat: chatCompose.service,
    toolUse,
    // D126 — the deployment's structured-output wire shape, read PER CALL off the resolved AppSettings tier
    // (Settings › Admin › Structured output). A thunk, so an admin flip reaches the next extraction without a
    // restart (the `maxImageBytes` / `promptTransformDeadlineMs` precedent).
    structuredOutputShape: () => effectiveConfig.getEffectiveConfig().structuredOutputShape,
  });
  rpgOpsHolder = rpgCompose.chatOps;
  const rpg = rpgCompose.service;
  // IMGMAC — the chat's authored user-macro DEFS from BOTH homes, for imagery's mode-template extraction (the
  // late-bound thunk threaded into `buildImagery` above). Pure wiring: it reads the two existing front doors
  // (chat's active-preset macro declaration + rpg's game macros) and hands them over UNMERGED, because the
  // preset↔game shadow is chat's ruled policy and has exactly one home (`shadowPresetUserMacros`).
  const resolveChatUserMacroDefs = async (chatId: ChatId): Promise<ChatUserMacroDefs> => {
    const [presetDefs, gameDefs] = await Promise.all([chatCompose.rpgChatOps.resolvePromptUserMacros(chatId), rpgOpsDelegate.resolveUserMacros(chatId)]);
    return { preset: presetDefs, game: gameDefs };
  };

  // ── world-info + the import ports + the bulk importers + the OWNER-principal resolver (the world-info seam).
  const worldInfoCompose = buildWorldInfo({
    db,
    now,
    audit,
    sessions,
    emitChatBusEvent,
    emitDomainEvent: eventBus.emit,
    emitChatEventLive,
    assets,
    character,
  });
  const { worldInfo, importWorldInfo, bulkImportChats, bulkImportPersonas, resolveOwnerPrincipal } = worldInfoCompose;

  // #679 U8 seam 17 + #798 — the ONE per-installer character-import closure both plugin canon-write arms share.
  // It runs the SAME `importCharacter` funnel a file upload takes over the given bytes (the ContentChanged-
  // emitting path: importHash dedup, book/regex relink, `character.create`'s `contentChanged:true` emit). The
  // input form is the only difference between the arms: `character.ingest` serializes a guest JSON card (no
  // avatar); `character.ingestAsset` (#798) hands the funnel a PNG the installer owns, and a PNG carries its
  // EMBEDDED avatar through (`isPng` → `parseCardPng` → CAS-store the avatar), which is the whole point of #798.
  // `pluginId` is PROVENANCE ONLY (#1702): neither `character.ingest` arm carries a filename (a guest JSON
  // card and a CAS-read PNG both arrive nameless), so `importCharacter` derived nothing and every hub-ingested
  // card read `characterProvenanceOf` as `authored` (row #1702). It rides straight through to `ImportCardInput`,
  // which mints `importedFrom` from the plugin's OWN verified identity + the card's content hash — never from
  // guest-authored card content, which is unspoofable-or-bust the whole reason it lives at contracts
  // (`pluginImportedFrom`, `@orb/contracts/character`).
  const runInstallerCharacterImport = async (
    installerUserId: UserId,
    bytes: Uint8Array,
    pluginId: PluginId | null,
  ): Promise<{ characterId: CharacterId; created: boolean }> => {
    const principal = await resolveOwnerPrincipal(installerUserId);
    const importCtx = buildImportContext({
      principal,
      character,
      storeAvatar: assets.store,
      attachCardTag: tag.attachCardTagByName,
      importLorebook: importWorldInfo.importLorebook,
      hasPrimaryBook: importWorldInfo.hasPrimaryBook,
      linkCarriedBooks: importWorldInfo.linkCarriedBooks,
      importCardScripts: regexCompose.importCardScripts,
    });
    const { characterId, created } = await createImportService(importCtx).importCharacter({
      card: { bytes, ...(pluginId === null ? {} : { pluginId }) },
    });
    return { characterId, created };
  };

  // ── automation + plugin (the automation-plugin seam) — built LAST of the domain services (both close over
  // chat/world-info/imagery/notifications + resolveOwnerPrincipal; plugin reuses automation's op objects).
  const { automation, plugin } = await buildAutomationPlugin({
    db,
    now,
    chatCompose,
    pluginMacros,
    resolveViewerVisibility,
    worldInfo,
    notifications,
    imagery,
    settings,
    assets,
    // #788 F1 — the owner-scoped RAG verb the plugin `search.query` read rides (search over the installer's own corpus).
    search,
    toolUse,
    // The fan-out's RECIPIENT enumeration (D147 clause (d)) — the admin verb, so the list is read under the
    // acting admin's own authority and re-gated there rather than swept off `users` by a domain that may not
    // read it.
    admin,
    resolveOwnerPrincipal,
    // C5 — the owner-global lane's standing-authority read rides SESSIONS, the one domain that owns `users`.
    sessions,
    bindRoleClients,
    resolveUserPresetParams,
    // #679 U8 seams 15/17 — the two canon-write ops the plugin membrane rides under the installer. databank's
    // own createFromText content-addresses + dedups + enqueues the ingest workload (the indexer).
    databankCreateFromText: databank.createFromText,
    // #679 U8 seam 17 — the guest JSON card serialized to bytes (no embedded avatar) through the shared funnel.
    ingestCharacterCard: ({ installerUserId, card, pluginId }) =>
      runInstallerCharacterImport(installerUserId, new TextEncoder().encode(JSON.stringify(card)), pluginId),
    // #798 — the remote-image "summon with art" arm. Read the PNG from the installer's OWN CAS through the
    // OWNER-GATED `readOwnedAssetBytes` (a foreign/absent id throws leak-free — `AssetNotFoundError` collapses
    // "not yours" and "absent", no existence oracle), then run the SAME funnel: a PNG carries its embedded
    // avatar, so the summoned character arrives WITH its art. Owner-scoped by construction (the read AND the
    // import both run under the installer's own resolved Principal).
    ingestCharacterAsset: async ({ installerUserId, assetId, pluginId }) => {
      const principal = await resolveOwnerPrincipal(installerUserId);
      const owned = await assets.readOwnedAssetBytes(principal, castId<AssetId>(assetId));
      return runInstallerCharacterImport(installerUserId, owned.bytes, pluginId);
    },
  });

  // ── roster-preset (saved parties, D61 B6) — built AFTER chat AND after automation (moved below the
  // automation-plugin seam when B10's rules rider landed): `applyToChat` drives chat's own host-gated
  // verbs + chat's own `requireHost` guard, and the rules rider drives automation's own front-door
  // verbs, all through injected ops (one authority home per domain).
  const rosterPreset = buildRosterPreset({ db, now, audit, emitUserEvent: publishUserEvent, can, chat, automation });

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
    // The ST world NAME-LINK attach (card `extensions.world` + charLore) — same ctx shape as the standalone
    // import; the id minters are unused by an attach but ride the one WorldInfoImportContext bundle.
    attachBooksByName: createAttachOwnedBooksByName({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
    galleryCtx,
    databankCtx: databankPortability,
    persona,
    exportService,
    character,
    assets,
    attachCardTag: tag.attachCardTagByName,
    // R6 — the orb-native chat bundle's tag-overlay + rpg-campaign re-links.
    attachChatTag: tag.attachChatTagByName,
    importRpgGame: rpgCompose.importGame,
    importWorldInfo,
    importCardScripts: regexCompose.importCardScripts,
    importPresetScripts: regexCompose.importPresetScripts,
    importGlobalScripts: regexCompose.importGlobalScripts,
    exportRegexScripts: regexCompose.exportRegexScripts,
    importRegexScript: regexCompose.importRegexScript,
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
    refineryWorkloads,
    purgeDocumentVectors: async (): Promise<void> => {
      // The purge's row counts are advisory — the sweep's own counts are the workload result.
      await embeddings.purgeDocumentVectors();
    },
    backfillMemory: (args) => chatCompose.backfill.memory(args),
    // The #156 admission gate's read — one hop to the ONE memory-config merge, never a second settings read.
    isMemoryEnabled: chatCompose.isMemoryEnabled,
    backfillGroupCharacters: (args) => chatCompose.backfill.groupCharacters(args),
    purgeMemoryVectors: async (): Promise<void> => {
      // The purge's row counts are advisory — the sweep's own counts are the workload result.
      await embeddings.purgeMemoryVectors();
    },
    loadUserSettings: settings.loadUserSettings,
    // The ONE per-user freshness plane the background passes fan `corpusRecomputed` on at their terminals
    // (event-bus coverage survey §2.5/F6) — shared by discovery's five analytics kinds AND embeddings'
    // `index` sweep, which is why it is wired once here rather than per domain seam.
    emitUserEvent: publishUserEvent,
    // The BULK arm's announce audience (`ownerId: null`), bound behind the search-discovery seam. Homed in
    // discovery's persistence beside the four per-kind enumerations it unions; embeddings receives it as an
    // injected op rather than reaching across the domain line for the same query.
    listCorpusOwners: searchDiscovery.listCorpusOwners,
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
    refinery,
    regex: regexCompose.regex,
    rosterPreset,
    rpg,
    search,
    sessions,
    settings,
    stats,
    tag,
    workloads,
    worldInfo,
  };

  // The ONE demo-chat seeder instance boot + the app first-request hook share (the characterSeeder
  // precedent). Built HERE, last: it needs chat's bulk write (world-info seam), character's handle lookup,
  // rpg's create door, and the settings latch — every one of them composed above. The transcript READ is
  // injected by the lifecycle (the bytes ship in @orb/default-content, which the seeder itself never imports).
  const demoChatGameDoor = createDemoChatGameDoor({ rpg });
  const demoChatSeeder = createDemoChatSeeder({
    readTranscript: readSeedDemoChat,
    findCharacterByHandle: async ({ principal, handle }) => {
      const ref = await character.findByHandle({ ownerId: principal.userId, handle });
      if (ref === null) {
        return null;
      }
      const detail = await character.get({ principal, characterId: ref.characterId });
      return { characterId: ref.characterId, name: detail.name };
    },
    writeChats: bulkImportChats,
    // The receiving user's own persona for the host seat — the SAME chain `startChat` walks (current, else
    // default). A seeded example is their room; it opens playing as them, which is also what keeps the rpg
    // player actor from resolving to their bare account handle.
    resolveSeatPersona: async (principal): Promise<PersonaId | null> => {
      const seeds = (await settings.getUserSettings({ principal })).config.seeds;
      const raw = seeds.currentPersonaId ?? seeds.defaultPersonaId;
      if (raw === null) {
        return null;
      }
      // The `UserSettings` seeds tier stores these lenient (a deleted persona leaves a stale id behind), so
      // the id is VERIFIED before it is seated — the `resolveCurrentPersona` precedent in compose/chat.ts.
      try {
        return (await persona.get({ principal, personaId: castId<PersonaId>(raw) })).id;
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface (never silently stamp an example without the intended identity, #760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
      }
    },
    // rpg's REAL create door + the authored-setup replay through rpg's real HAND doors (entry/compose/
    // demo-chat-game.ts owns the seat→actor-ref resolution; domain/chat stays rpg-table-blind).
    createGame: demoChatGameDoor,
    now,
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.demoChatsSeeded,
    markSeeded: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { demoChatsSeeded: true } },
      });
    },
    readPackVersion: async (principal): Promise<number> => (await settings.getUserSettings({ principal })).config.onboarding.demoChatsPackVersion,
    markPackVersion: async (principal, version): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { demoChatsPackVersion: version } },
      });
    },
    // #1550's per-example evidence — WHOLE-set replace, never a merge (a slug that finally landed has to be
    // able to leave). The seeder owns what goes in it; this pair is only the settings door.
    readSkippedSlugs: async (principal): Promise<readonly string[]> => (await settings.getUserSettings({ principal })).config.onboarding.demoChatsSkipped,
    markSkippedSlugs: async (principal, slugs): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { demoChatsSkipped: [...slugs] } },
      });
    },
    // ── the pack-bump HEAL's doors (only-if-unset; the seeder owns that policy) ──
    readSeededChat: async ({ principal, importHash }) => (await loadSeededChatDressing(db, principal.userId, importHash)) ?? null,
    // BOTH halves of the persona binding the fresh bulk write does in one shot: the host seat's own
    // "playing as" (persona's door) and the room's anchor pin (chat's door).
    bindSeatPersona: async ({ principal, chatId, personaId }): Promise<void> => {
      await persona.setActivePersona({ principal, chatId, targetUserId: principal.userId, personaId });
      await chat.setChatAnchorPersona({ principal, chatId, personaId });
    },
    setChatBackground: async ({ principal, chatId, background }): Promise<void> => {
      await chat.setChatBackground({ principal, chatId, background });
    },
  });

  // The ONE example-plugin seeder instance boot + the app first-request hook share. It drives the REAL plugin
  // verbs under the RECEIVING USER's own Principal — never a synthetic installer and never a second install
  // path: the bundle meets the same unzip hardening, manifest validation and CAS store a hand upload meets,
  // and `install`'s own `(owner, slug)` collision refusal is the seeder's layer-2 idempotency.
  const examplePluginSeeder = createExamplePluginSeeder({
    packBundle: packShowcaseBundle,
    // An EMPTY grant, deliberately (the seeder's header): the row lands able to do nothing at all.
    install: async ({ caller, bundle }) => await services.plugin.install({ caller, bundle, grant: [] }),
    // …and the empty RE-GRANT right after it, which is what raises `pending_reconsent` — the standing "this
    // plugin is asking for capabilities you have not allowed" state the client's consent affordance is gated
    // on. `acknowledgedNetHosts` is `[]` because the echo gate only runs when the grant includes `net.fetch`.
    requestConsent: async ({ caller, pluginId }) => {
      await services.plugin.setGrant({ caller, pluginId, grant: [], acknowledgedNetHosts: [] });
    },
    // #803's auto-upgrade rides the REAL upgrade verb — the same one a hand upload and the one-click url
    // update drive — so the consent wall (widened reach ⇒ disabled + standing re-consent, grant = prior ∩
    // declared) is the seeder's too, and there is no second install path.
    upgrade: async ({ caller, pluginId, bundle }) => {
      await services.plugin.upgrade({ caller, pluginId, bundle });
    },
    // The version the SHIPPED bundle declares, straight off its own manifest — never re-spelled here.
    bundledVersion: async (slug): Promise<string | null> => (await readShowcaseManifest(slug))?.version ?? null,
    // ONE read per pass: it is both the install half's collision check and the upgrade half's subject list.
    // The seeder filters it down to the showcase slugs itself (a user's OWN plugins are none of its business).
    listHeld: async (caller) => (await services.plugin.list({ caller })).map((row) => ({ slug: row.slug, pluginId: row.id, version: row.version })),
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.examplePluginsSeeded,
    markSeeded: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { examplePluginsSeeded: true } } });
    },
    readSeededVersions: async (principal): Promise<Readonly<Record<string, string>>> =>
      (await settings.getUserSettings({ principal })).config.onboarding.seededPluginVersions,
    writeSeededVersions: async (principal, versions): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { seededPluginVersions: { ...versions } } } });
    },
  });

  // The ONE distributed-plugin applier the app's first-request hook drives (D147 clause (d)). It owns nothing
  // but the once-per-user latch: the plugin logic — which slugs are published, what a distributed copy lands
  // as, the already-held skip — lives in the self-scoped verb, which this drives under the ARRIVING user's own
  // Principal. The latch is a settings fact, which is why it is wired here and not in the domain.
  const distributedPluginApplier = createDistributedPluginApplier({
    apply: async (principal) => await services.plugin.applyDistributedPlugins({ caller: principal }),
    isApplied: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.distributedPluginsApplied,
    markApplied: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { distributedPluginsApplied: true } } });
    },
  });

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
    demoChatSeeder,
    examplePluginSeeder,
    distributedPluginApplier,
    rpgChatOps: rpgCompose.chatOps,
    rpgTrace,
    recallRecorder,
    toolUse,
    chatRpgOps: chatCompose.rpgChatOps,
    wireCaptureOn,
  };
}
