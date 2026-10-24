// The composition root's KEYSTONE. `createServices` builds the infra handles (SecretBox/CAS/variant cache/image
// adapter), the in-process event bus, and the ONE `@orb/inference` runtime (`createInferenceRuntime` over the
// server-wired ports — inference program §11), then delegates each domain cluster to its sibling
// `entry/compose/*` seam builder (each takes an explicit deps object — the buildChatService precedent). Returns
// the `Services` bundle transport reads + the boot handles the lifecycle supervises/probes/wires.
//
// THERE IS NO BOOT-GLOBAL ROLE-CLIENTS BUNDLE (§8.5b, verify9 H3): every side call resolves through
// `roleClientsFor(funderUserId)` — the runtime's per-funder fold over `connection_bindings`. Room turns and
// their side calls pass the frozen host funder (D19); non-room background work passes its explicit owner.
// Neither path falls back to the box owner. `roleClientsFor` is the one
// binder every seam receives; it reads the funder's real `Principal` off `users.role` (D135 clause G).
//
// Determinism: `now` and the process seams (timers, PRNGs, id source, nonce) are required deps; compose never
// reads the ambient process, and every id minter binds `deps.idSource`. Compose order: guards → sessions →
// settings → runtime → credentials → connection → assets-character → search-discovery → admin → imagery → databank → chat → world-info → automation/plugin →
// portability/runner. settings' effective-config cache is warmed before the runtime (it publishes the F12
// private-endpoint allowlist and sources the agent-sdk fan-out cap).
//
// LANDING A NEW DOMAIN IS ONE CHANGE ACROSS SIX SITES — the first two are the only ones `tsc` forces:
// the `Services` type + its build here, the domain's own `entry/compose/<name>.ts` seam, the tRPC router
// registration, the domain's `DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES` row if it carries a non-template root file
// (`tests/server/layout.suite.test.ts`), its schema module named for it
// (`tests/db/schema/module-structure.suite.test.ts`), and a cross-tenant
// probe for every new procedure.
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
// `embedReindex` (bound once workloads exists), `resolveViewerVisibility` (getter threaded into imagery
// before chat composes; the real const into automation after).

import { resolve } from "node:path";
import type { DomainEvent } from "@orb/contracts/events";
import type { AuthModeSource } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import { CATALOG_SETTINGS_PREFIX } from "@orb/contracts/settings";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { DatabaseHandle } from "@orb/db/wiring";
import { SEED_MANIFEST } from "@orb/default-content";
import type { BindingActor, InferenceDeps, InferenceRuntime, RoleClientsWithSignal } from "@orb/inference";
import { availableClaudeExecutable, createInferenceRuntime } from "@orb/inference";
import { createBinding } from "@orb/kit/binding";
import type { ChatId, IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { PubSub } from "@orb/kit/pubsub";
import type { TimerScheduler } from "@orb/kit/time";
import { packShowcaseBundle, readShowcaseManifest } from "@orb/showcase-plugins";
import type { ServerRestartPort } from "#domain/admin";
import { can, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import {
  createAssetEmbeddingReads,
  createImportAvatarStore,
  createImportOwnedAsset,
  createStoreGeneratedImage,
  createStoreInlineReplyImage,
} from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import { createAutomationTeachingContributions, createRuleOwnedBy, startAutomationWatcher } from "#domain/automation";
import type { DefaultCharacterSeeder } from "#domain/character";
import { createCharacterImportOps, createFindSeedCharacter } from "#domain/character";
import type { ChatContext, MemoryRecallRecorder, SignupInviteOps } from "#domain/chat";
import {
  createChatBus,
  createChatPublication,
  createMemoryRecallRecorder,
  createResolveChatUserMacroDefs,
  createResolveViewerVisibility,
  isCharacterSeated,
  loadPresentHostUserId,
  requireParticipant,
} from "#domain/chat";
import type { ConnectionContext } from "#domain/connection";
import { createConnectionPorts, createConnectionService, createSessionEntryWriter } from "#domain/connection";
import { createCredentialHealthThrottle, createCredentialOwned, createCredentialsService } from "#domain/credentials";
import type { DatabankIngest } from "#domain/databank";
import { createGatherDatabankForTurn } from "#domain/databank";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import { createRecordUsage, createResolveEmbeddingConnection, createVectorSweepOps } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createImageryPortability } from "#domain/imagery";
import { buildImportContext, createInstallerCharacterImport, serializeImportCard } from "#domain/import";
import type { DefaultPersonaSeeder } from "#domain/persona";
import { createSeedPersonaWithCompletion } from "#domain/persona";
import type { DistributedPluginApplier } from "#domain/plugin";
import {
  createDistributedPluginApplier,
  createPluginGrantTasksOf,
  createPluginMacroRegistry,
  createPluginSeedOps,
  createShowcaseVersionReader,
} from "#domain/plugin";
import { buildSideGenParams, createCopyPresetToUser, createLoadOptionalPreset, createPresetReadable } from "#domain/preset";
import { createResolveStructuredBinding } from "#domain/refinery";
import type { ImportCardScripts } from "#domain/regex";
import { createSeedRosterPreset } from "#domain/roster-preset";
import type { RpgContext, RpgTraceRecorder } from "#domain/rpg";
import { createExportRpgGame, createRpgEventBus, createRpgTraceRecorder } from "#domain/rpg";
import { createFieldIndexCache, withRetrievalDegrade } from "#domain/search";
import type { SessionsRolePolicy, SessionsService } from "#domain/sessions";
import { createResolveUserEnabled, createSessionsRolePolicy, createSessionsService } from "#domain/sessions";
import type { DefaultBackgroundSeeder, SettingsContext, SettingsServiceDeps } from "#domain/settings";
import {
  createEffectiveConfigCache,
  createJoinerSettingsStatement,
  createReadSeededKeys,
  createSettingsComposedOps,
  createSettingsContext,
  createSettingsKvPort,
  createSettingsService,
  recordSeededItemKeys,
} from "#domain/settings";
import type { CertificateController, RelayController } from "#domain/share";
import { createEnableShareSeating, createShareService } from "#domain/share";
import { createStatsBatchWiring } from "#domain/stats";
import type { TagContext } from "#domain/tag";
import { createImportedCardTag, createReadAttachedEntity, createTagService } from "#domain/tag";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseTeachingContributions } from "#domain/tool-use";
import type { WorkloadContributions, WorkloadProgressBus } from "#domain/workloads";
import { createWorkloadProgressBus } from "#domain/workloads";
import type { ImportWorldInfoPort } from "#domain/world-info";
import { createAttachOwnedBooksByName, createImportStandaloneLorebook } from "#domain/world-info";
import { APP_NAME, APP_URL } from "#foundation/config";
import type { Env } from "#foundation/env/record";
import { allowedHostsInput, installKind, publicAddresses } from "#foundation/env/record";
import type { AuditEntry, BugReportDiagnosticsRead, WireCaptureSpill } from "#foundation/observability";
import {
  addSpanEvent,
  createAuditWiring,
  createBugReportDiagnosticsRead,
  createWireCaptureSpill,
  getLog,
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  recordTurnOutcome,
  recordWireCapture,
  securityEvent,
  span,
} from "#foundation/observability";
import { SERVER_INSTANCE_ID } from "#foundation/server-instance";
import { versionIdentity } from "#foundation/version";
import type { AuthConfig, ForwardJwtVerifier } from "#infra/auth";
import { createForwardJwtVerifier, createJwksReader, createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { createVideoPreparer } from "#infra/media";
import type { ScopedEgress, ScopedEgressOptions } from "#infra/network";
import { createScopedEgress } from "#infra/network";
import { createCas, createUserRuntimeDirs, createVariantCache } from "#infra/storage";
import type { BackgroundWork } from "#infra/tasks";
import { createBackgroundWork } from "#infra/tasks";
import { createScopedTimers } from "#infra/timers";
import type { ServiceJobs } from "#transport/jobs";
import type { LiveBuses, PresenceRegistry, RateLimitGate, Services, SocketRegistry } from "#transport/trpc";
import { createLiveBuses, createPresenceRegistry, createSocketRegistry } from "#transport/trpc";
import { createHostPrincipalResolver, createMultiHumanCapability } from "../auth/index.ts";
import type { ExamplePluginSeeder } from "../boot/seed-example-plugins.ts";
import { createExamplePluginSeeder } from "../boot/seed-example-plugins.ts";
import { createLocalLightUserSeed } from "../boot/seed-local-light.ts";
import type { UserContentSeeder } from "../boot/seed-user-content.ts";
import { createUserContentSeeder } from "../boot/seed-user-content.ts";
import { createRateLimitGate } from "../rate-limit-gate.ts";
import { buildAdmin } from "./admin.ts";
import { buildAssetsCharacter } from "./assets-character.ts";
import type { AutomationPluginComposeDeps, AutomationPluginComposeResult } from "./automation-plugin.ts";
import { buildAutomationPlugin } from "./automation-plugin.ts";
import { createAutomationWatcherEnv } from "./automation-watcher.ts";
import type { ChatComposeResult } from "./chat.ts";
import { buildChatService, createSignupMinterCheck } from "./chat.ts";
import { buildDatabank } from "./databank.ts";
import type { EffectiveConfigWiring } from "./effective-config.ts";
import { createEffectiveConfigWiring } from "./effective-config.ts";
import { createDomainEventBus } from "./event-bus.ts";
import { buildImagery } from "./imagery.ts";
import { minter } from "./minter.ts";
import type { PortabilityRunnerComposeResult } from "./portability-runner.ts";
import { buildPortabilityRunner } from "./portability-runner.ts";
import { buildRefinery } from "./refinery.ts";
import { buildRegex } from "./regex.ts";
import { buildRosterPreset } from "./roster-preset.ts";
import type { RpgComposeResult } from "./rpg.ts";
import { buildRpg } from "./rpg.ts";
import type { SearchDiscoveryComposeResult } from "./search-discovery.ts";
import { buildSearchDiscovery } from "./search-discovery.ts";
import { buildServiceJobs } from "./service-jobs.ts";
import { SESSIONS_CRYPTO } from "./sessions-crypto.ts";
import { createUpstreamProbes } from "./update-check.ts";
import { buildWorkloadContributions } from "./workload-contributions.ts";
import { buildWorldInfo } from "./world-info.ts";

/** The runtime seams a composition root MAY override — the SDK `query` test seam, the D8 session store, a
 *  prebuilt local-light model cache and a wire-capture sink. Everything else the runtime needs is wired HERE
 *  from the domains; nothing about a provider, an engine or a posture is a boot dep any more (§4, F1/F2).
 *
 *  The provider TRANSPORT is not one of them: `InferenceDeps.sdkFetch` is always this graph's
 *  `egress.configuredEndpointFetch`, over the required `ServicesDeps.networkExecution.fetch`. `buildBackends`
 *  resolves it ONCE, synchronously, inside `createInferenceRuntime`, so a `vi.spyOn(globalThis, "fetch")`
 *  installed after `createServices` has returned can never reach it; a test root scripts that fetch instead. */
type InferenceSeams = Partial<Pick<InferenceDeps, "agentSdk" | "localLight" | "captureWire" | "span">>;

/**
 * What boot supplies to stand up the whole service graph. The env→config→runtime facts (the private-endpoint
 * allowlist, the agent-sdk fan-out cap, the local-light cache dir) are read from the resolved effective
 * config + the `env` record inside `createServices`, never passed in one by one.
 */
export interface ServicesDeps {
  /** The parsed env record (`createProcessSeams` reads the process's; a test root parses its own). Every knob this
   *  graph reads comes from here, so a root that sets a key in its record turns the same production read. */
  readonly env: Env;
  /** The agent-sdk child-env baseline, the process environment's present variables (`createProcessSeams`). */
  readonly hostEnvAllowlist: () => Readonly<Record<string, string>>;
  /** Where this process's `AUTH_MODE` came from (`createProcessSeams`); the share panel names it. */
  readonly authModeSource: AuthModeSource;
  readonly pluginExecution?: AutomationPluginComposeDeps["pluginExecution"];
  /** The fetch and resolver every egress this graph builds uses (`systemFetch` and `systemResolver` from `createProcessSeams`). */
  readonly networkExecution: Pick<ScopedEgressOptions, "fetch" | "resolver">;
  /** The physical dial every egress this graph builds uses (`systemConnector` from `createProcessSeams`). */
  readonly buildConnector: ScopedEgressOptions["buildConnector"];
  /** The plugin broker's connect-deadline clock (`performance.now` from `createProcessSeams`). */
  readonly monotonicNow: AutomationPluginComposeDeps["monotonicNow"];
  /** The process seams are required so a forgotten one fails to compile instead of reaching the real process;
   *  `createProcessSeams` (`./process-seams.ts`) is their one real source. */
  readonly timers: TimerScheduler;
  readonly userRuntimeDir?: string;
  readonly authConfig?: Pick<AuthConfig, "mode">;
  readonly rolePolicy?: SessionsRolePolicy;
  readonly random: () => number;
  readonly randomInt: RpgContext["randomInt"];
  readonly idSource: IdSource;
  readonly newOpaqueId: () => string;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  /** The boot-time owner id. `undefined` in OIDC mode when no owner row exists yet (the first
   *  owner-policy OIDC login will create it). When absent, role-client binding is deferred and every
   *  provider call fails closed until the owner provisions. */
  readonly ownerId: UserId | undefined;
  readonly secretBoxKey: Buffer | null;
  readonly casDir: string;
  readonly variantDir: string;
  /** The staging root the upload route stages a zip under; absent ⇒ `DEFAULT_IMPORT_STAGING_DIR`
   *  (the same default the route resolves). */
  readonly importStagingDir?: string;
  /** Where an import writes its report; absent ⇒ the env data layout's `reports` slot. A test root passes its own
   *  directory so a report never lands in the checkout. */
  readonly importReportsDir?: string;
  /** The ST profile-directory snapshot `import-st`'s `importAll` reads; absent ⇒ repo-root `.st-data`. */
  readonly stProfileDir?: string;
  readonly sessionSecret: string | null;
  readonly providerSeams?: InferenceSeams;
  /** This replica's stable lock-holder tag — must match the boot reclaim's match key. */
  readonly holder?: string;
  /** Where both wire-capture arms spill; absent ⇒ the record's data layout `wireCapture` slot. A test root passes its
   *  own directory so a capture never lands in the checkout. */
  readonly wireCaptureDir?: string;
  /** The process restart `admin.restart` drives (`entry/lifecycle.ts` builds it; a test passes an unsupervised one). */
  readonly serverRestart: ServerRestartPort;
  /** The share relay `share.*` drives (`entry/lifecycle.ts` builds it; a test passes {@link NO_SHARE_RELAY}). */
  readonly share: ShareComposeDeps;
}

/** The lifecycle-owned half of the share service: the one relay controller, the one IP certificate controller, this
 *  machine's setup address, and the app listener's port and reach. */
export interface ShareComposeDeps {
  readonly relay: RelayController;
  readonly certificate: CertificateController;
  readonly localSetupUrl: () => string;
  readonly appPort: () => number;
  /** True when the app listener admits connections from beyond loopback (`BindPosture.publicBind`). */
  readonly publicBind: boolean;
}

/** The share deps for a composition that runs no relay and no https listener (a seed script, a test graph): both read
 *  `off`, a stop has nothing to end, and a start that passes the preconditions throws rather than pretend one started. */
export const NO_SHARE_RELAY: ShareComposeDeps = {
  relay: {
    start: () => Promise.reject(new Error("compose: this composition runs no relay")),
    stop: (): void => undefined,
    status: () => ({ state: "off" }),
  },
  certificate: {
    enable: () => Promise.reject(new Error("compose: this composition serves no https listener")),
    disable: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    status: () => ({ state: "off" }),
  },
  localSetupUrl: (): string => {
    throw new Error("compose: this composition serves no local origin");
  },
  appPort: (): number => {
    throw new Error("compose: this composition serves no local origin");
  },
  publicBind: false,
};

/** The restart port for a composition no supervisor started (a seed script, a test graph). `admin.restart` refuses as
 *  unsupervised before it reaches `restart`, which throws if anything ever does. */
export const UNSUPERVISED_RESTART: ServerRestartPort = {
  supervised: false,
  serverInstanceId: SERVER_INSTANCE_ID,
  restart: (): void => {
    throw new Error("compose: nothing supervises this process, so nothing may restart it");
  },
};

/** What the composition root hands back: the transport `Services` bundle + the boot handles the lifecycle
 *  supervises/probes/wires. */
export interface ServicesResult extends AsyncDisposable {
  readonly startJobs: ServiceJobs["start"];
  readonly workloadEvents: WorkloadProgressBus;
  readonly liveBuses: LiveBuses;
  readonly egress: ScopedEgress;
  readonly forwardJwtVerifier: ForwardJwtVerifier;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  readonly multiHumanCapable: ReturnType<typeof createMultiHumanCapability>;
  readonly settleBackground: BackgroundWork["settle"];
  readonly supervise: BackgroundWork["supervise"];
  /** The root's opaque nonce, for the supervised work the HTTP app starts on this graph. */
  readonly newOpaqueId: () => string;
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
  readonly settleImportMemory: PortabilityRunnerComposeResult["settleImportMemory"];
  readonly importWorldInfo: ImportWorldInfoPort;
  /** The card regex-script lift, for the HTTP card door (the same op every other import door threads). */
  readonly importCardScripts: ImportCardScripts;
  readonly eventBus: PubSub<DomainEvent>;
  /** The kind-keyed workload contribution registry (the retired runner-env's replacement) — the worker
   *  driver dispatches through it. */
  readonly workloadContributions: WorkloadContributions;
  /** The databank ingest subsystem — surfaced so the seed script can run ONE document's ingest inline
   *  (the same op the `databank-ingest` contribution drives off the queue). */
  readonly databankIngest: DatabankIngest;
  /** The ONE inference runtime (§3.3) — surfaced for the boot's local-light prefetch plan and the composed-real
   *  int tests; every domain reaches it through its own injected ops, never this handle. */
  readonly runtime: InferenceRuntime;
  /** The per-FUNDER `RoleClients` binder (§8.5b): the runtime's binding fold under that user's real Principal.
   *  The workloads worker binds a pass's role clients from this; entry never touches the raw executor. */
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly effectiveConfig: EffectiveConfigWiring;
  readonly secretBox: SecretBox;
  /** The default-card seeder — the one instance both boot and the app first-request hook share, so the
   *  in-process memo + persisted latch hold across both call sites. */
  readonly characterSeeder: DefaultCharacterSeeder;
  /** Mirrors `characterSeeder`, for the default `{{user}}` persona. */
  readonly personaSeeder: DefaultPersonaSeeder;
  /** The user seed (D263): walks the manifest for an account and seeds what its seed ledger lacks. Drives
   *  `characterSeeder` and `personaSeeder`; the boot owner step and the first-authed-request hook share it. */
  readonly contentSeeder: UserContentSeeder;
  /** The per-user SCENE-PLATE seeder (`domain/settings`) — boot + the first-authed-request hook run it. */
  readonly backgroundSeeder: DefaultBackgroundSeeder;
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
  /** #412 — whether THIS compose actually wired the provider wire-capture request sink (`WIRE_CAPTURE` in
   *  the record). `lifecycle.ts` hands it to `createApp`, which publishes it on
   *  `/api/_debug/wire/captures` as `enabled` so a reader can tell an off recorder from a quiet one. Surfaced
   *  because the decision lives HERE, so no downstream reader re-reads the knob. */
  readonly wireCaptureOn: boolean;
  /** The production "Report a bug" read over this graph's env record; the tRPC context carries it. */
  readonly bugReportDiagnostics: BugReportDiagnosticsRead;
  /** D259 — chat's signup-invite ops, for the local signup route. */
  readonly signupInvites: SignupInviteOps;
  /** The per-user local-light seed, surfaced for the signup route (it runs after the signup commit). */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
  /** The embed-space sweep enqueue (`search-discovery.ts`), surfaced for boot and the seed tools, whose owner seed
   *  and local-light sweep run outside the compose-built seed. Never rejects. */
  readonly enqueueEmbedReindex: (scope: UserId | null) => Promise<void>;
  /** The same sweeps started detached, for a boot seed that must not wait on them. */
  readonly detachEmbedReindex: (scope: UserId | null) => void;
  /** Boot's re-index of every owner whose stored generation went stale without a user action, detached. */
  readonly detachStaleSpaceReindex: () => void;
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

function pluginExecutionInputs(deps: ServicesDeps): Pick<AutomationPluginComposeDeps, "pluginExecution"> {
  return deps.pluginExecution === undefined ? {} : { pluginExecution: deps.pluginExecution };
}

// The outcome arm rides the request sink's gate, so the two wire-capture reads can never disagree.
function turnOutcomeRecorderOf(wireCaptureOn: boolean, spill: WireCaptureSpill): Pick<Parameters<typeof buildChatService>[0], "recordTurnOutcome"> {
  return wireCaptureOn ? { recordTurnOutcome: (outcome): void => recordTurnOutcome(outcome, spill) } : {};
}

function inferenceSpanOf(deps: ServicesDeps): InferenceDeps["span"] {
  return (
    deps.providerSeams?.span ??
    (<T>(name: string, fn: () => Promise<T> | T, attrs?: Parameters<InferenceDeps["span"]>[2]): Promise<T> => span(name, () => fn(), attrs))
  );
}

/** Construct the full service graph + the boot handles. Async: the runtime loads the provider registry's
 *  runtime rows (`provider_rows`) before any consumer that resolves against it is built. */
export async function createServices(deps: ServicesDeps): Promise<ServicesResult> {
  await using construction = new AsyncDisposableStack();
  const resources = new AsyncDisposableStack();
  construction.defer(() => resources.disposeAsync());
  const wireSpill = createWireCaptureSpill(deps.wireCaptureDir ?? deps.env.DATA_LAYOUT.wireCapture);
  // Deferred first so it runs last: every turn has settled, so no wire-capture append outlives the graph.
  resources.defer(wireSpill.settle);
  const backgroundResources = new AsyncDisposableStack();
  construction.defer(() => backgroundResources.disposeAsync());
  // biome-ignore lint/nursery/useDisposables: resources adopts this owner through the moved graph stack; local using would close it before the graph starts.
  const timers: TimerScheduler = resources.use(createScopedTimers(deps.timers));
  // biome-ignore lint/nursery/useDisposables: resources adopts this owner through the moved graph stack; local using would close it before the graph starts.
  const rpgEvents = resources.use(createRpgEventBus());
  const workloadEvents = resources.use(createWorkloadProgressBus());
  const liveBuses = resources.use(createLiveBuses({ rpg: rpgEvents, workloads: workloadEvents }));
  // biome-ignore lint/nursery/useDisposables: resources adopts the cache through the moved graph stack; local using would close it before graph use.
  const fieldIndex = resources.use(createFieldIndexCache());
  // biome-ignore lint/nursery/useDisposables: resources adopts the throttle through the moved graph stack; local using would close it before graph use.
  const healthThrottle = resources.use(createCredentialHealthThrottle());
  const publishUserEvent = liveBuses.user.publishUserEvent;
  // biome-ignore lint/nursery/useDisposables: backgroundResources owns this settlement through the moved graph stack; the borrowed operation view must not close at return.
  const background: Omit<BackgroundWork, keyof AsyncDisposable> = backgroundResources.use(createBackgroundWork());
  let chatLifetime: ChatComposeResult | undefined;
  let rpgLifetime: RpgComposeResult | undefined;
  let pluginLifetime: AutomationPluginComposeResult | undefined;
  let localLightLifetime: InferenceRuntime["localLight"] | undefined;
  let agentSdkLifetime: InferenceRuntime["agentSdk"] | undefined;
  let egressLifetime: ScopedEgress | undefined;
  let jobsLifetime: ServiceJobs | undefined;
  let stopAutomationWatcher: (() => void) | undefined;
  construction.defer(async () => {
    const results = await Promise.allSettled([
      jobsLifetime?.[Symbol.asyncDispose](),
      chatLifetime?.[Symbol.asyncDispose](),
      rpgLifetime?.[Symbol.asyncDispose](),
      pluginLifetime?.[Symbol.asyncDispose](),
      localLightLifetime?.close(),
      agentSdkLifetime?.settle(),
    ]);
    const failures: Error[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason instanceof Error ? result.reason : new Error("service graph disposal failed", { cause: result.reason }));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "service graph domain disposal failed");
    }
  });
  construction.defer(() => {
    using cancellation = new DisposableStack();
    cancellation.defer(() => egressLifetime?.cancel());
    cancellation.defer(() => agentSdkLifetime?.cancel());
    cancellation.defer(() => background.cancel());
    cancellation.defer(() => jobsLifetime?.cancel());
    cancellation.defer(() => liveBuses.chatOpen.setChatOpenTap(null));
    cancellation.defer(() => stopAutomationWatcher?.());
  });
  const egress = resources.use(
    createScopedEgress({
      ...deps.networkExecution,
      timers,
      buildConnector: deps.buildConnector,
      env: deps.env,
    }),
  );
  egressLifetime = egress;
  const forwardJwtVerifier = createForwardJwtVerifier(resources.use(createJwksReader(egress.configuredEndpointFetch)).jwksFor);
  const {
    db,
    now,
    authConfig = { mode: deps.env.AUTH_MODE },
    rolePolicy = createSessionsRolePolicy(deps.env),
    idSource,
    newOpaqueId,
    userRuntimeDir = deps.env.USER_RUNTIME_DIR,
    importReportsDir = deps.env.DATA_LAYOUT.reports,
  } = deps;
  const authMode = authConfig.mode;
  const presence = createPresenceRegistry(now);
  const sockets = createSocketRegistry(now, newOpaqueId);

  const audit = createAuditWiring(db, idSource).log;
  const newUserId = (): UserId => idSource.userId();
  const { applyStatsDelta, bumpStatsCanonVersion } = createStatsBatchWiring(idSource);
  // biome-ignore lint/nursery/useDisposables: resources adopts this owner through the moved graph stack; local using would close it before the graph starts.
  const eventBus = resources.use(createDomainEventBus(background.supervise, newOpaqueId));

  // #2481 — the per-user half of the local-light seed (§7.2/§5.3b). The boot SWEEP covers the accounts
  // alive at boot; this op is what covers every account minted afterwards, and it is threaded into both
  // user-minting domains (sessions below, admin further down) rather than called from one of them —
  // neither may import `domain/connection`.
  // A seed that newly binds the encoder starts that owner's embed sweeps through `embedReindex` below (late-bound:
  // it derefs at call time, a mint, never during compose).
  const seedUserConnections = createLocalLightUserSeed({
    idSource,
    db,
    now,
    onEmbedSpaceBound: (ownerId) => {
      embedReindex.detachEmbedReindex(ownerId);
    },
  });
  const sessions = createSessionsService({
    db,
    now,
    idSource,
    crypto: SESSIONS_CRYPTO,
    sessionSecret: deps.sessionSecret,
    seedUserConnections,
    rolePolicy,
  });
  // A connection/binding write that changes an owner's embed or imageEmbed SPACE
  // must enqueue the purge+reindex. `workloads` is built far below (the search-discovery seam), so this holder
  // is late-bound after it exists; the connection ctx derefs it at request time (a pane write), never during
  // boot. Until then it is an inert no-op.
  let embedReindex: Pick<SearchDiscoveryComposeResult, "enqueueEmbedReindex" | "detachEmbedReindex" | "detachStaleSpaceReindex"> = {
    enqueueEmbedReindex: () => Promise.resolve(),
    detachEmbedReindex: () => undefined,
    detachStaleSpaceReindex: () => undefined,
  };
  // A connection write awaits the owner's target sync, and the pane's change preview asks the same move rule; both are
  // the embeddings domain's, which composes after the connection domain.
  let embedTargets: Pick<EmbeddingsService, "syncTargetGenerations" | "targetWouldMove"> = {
    syncTargetGenerations: () => Promise.reject(new Error("compose: syncTargetGenerations invoked before search-discovery wiring")),
    targetWouldMove: () => Promise.reject(new Error("compose: targetWouldMove invoked before search-discovery wiring")),
  };
  // chat's memory-enabled read for the search-discovery seam, which composes before chat. Bound once chat exists.
  let isMemoryEnabled: (ownerId: UserId) => Promise<boolean> = () => Promise.reject(new Error("compose: isMemoryEnabled invoked before chat wiring"));
  let emptyMemoryScope: ChatComposeResult["emptyMemoryScope"] = () => Promise.reject(new Error("compose: emptyMemoryScope invoked before chat wiring"));
  // The connection pane's embedder-change preview counts the embeddings domain's rows, which compose after it.
  let countOwnedVectors: ConnectionContext["countOwnedVectors"] = () =>
    Promise.reject(new Error("compose: countOwnedVectors invoked before search-discovery wiring"));
  // materializeBackground (side-eye F-P0-2): built after `assets` + `effectiveConfig` exist (the assets-character
  // seam), but settings/character/chat compose BEFORE `assets`, so they deref this late-bound holder at request
  // time (the `spriteSheetOps` pattern). Invoked only when a user pastes an external background URL.
  let materializeBackgroundOp: MaterializeBackgroundOp = () => {
    throw new Error("compose: materializeBackground invoked before assets wiring");
  };
  const materializeBackground: MaterializeBackgroundOp = (principal, url) => materializeBackgroundOp(principal, url);
  let refreshAutoindex = (): void => undefined;
  const settingsDeps: SettingsServiceDeps = {
    // The root's auth snapshot decides the mode floor, so the floor and the auth seam agree on the mode.
    effectiveConfig: createEffectiveConfigCache(db, { ...deps.env, ["AUTH_MODE"]: authMode }),
    onEffectiveConfigChanged: () => refreshAutoindex(),
    db,
    now,
    audit,
    requireAdmin,
    requireOwner,
    newThemeId: minter(ID_PREFIX.theme, idSource),
    emitUserEvent: publishUserEvent,
    materializeBackground,
    newBackgroundEntryId: newOpaqueId,
    versionIdentity,
    // The manual update check's one GET. Wired here (never imported by the domain) so the egress belt stays
    // on this side of the tier line, exactly like `materializeBackground` above it.
    probeUpstream: createUpstreamProbes({ localVersion: () => versionIdentity().version, now, fetchImpl: egress.safeFetch }),
    publishPrivateEndpointAllowlist: egress.publishPrivateEndpointAllowlist,
  };
  // The workload contribution registry is assembled LAST (it spans every owning domain, chat included) but
  // the workloads SERVICE is built mid-graph and needs it as its params validator — so the service holds this
  // late-bound thunk, dereferenced per verb call after the registry has been assembled.
  const workloadBinding = createBinding<WorkloadContributions>("compose: workload contributions derefed before the registry was assembled");
  const getWorkloadContributions = workloadBinding.read;
  const settingsCtx: SettingsContext = createSettingsContext(settingsDeps);
  const settings = createSettingsService(settingsCtx);
  const rateLimit = createRateLimitGate({
    db,
    now,
    resolveRateLimits: () => settings.getEffectiveConfig().rateLimits,
    windowMs: deps.env.RATE_LIMIT_WINDOW_MS,
  });
  const multiHumanCapable = createMultiHumanCapability(authMode, () => settings.getEffectiveConfig());

  // Warm the resolved-config cache from the stored override so the sync getEffectiveConfig() returns the
  // floor⊕override config before the runtime reads it. The settings domain's reload also publishes the F12
  // private-endpoint allowlist onto the egress guard (`settingsDeps.publishPrivateEndpointAllowlist`), here
  // and after every AppSettings write, so an owner's save reaches the next dial.
  const effectiveConfig = createEffectiveConfigWiring(settings);
  await effectiveConfig.reload();

  // Built before the runtime so the hosted image arms get the real GIF→first-frame-PNG wire-normalize
  // transform (MA-6) — the sharp adapter, wrapped inside the package so it never leaks in.
  const imageAdapter = createImageAdapter();
  // TASK-24: wire the provider wire-capture sink ONLY when the record enables capture. When off, no sink is
  // injected → the send boundaries never record → zero cost, zero retained bytes, prod-safe.
  const wireCaptureOn = isWireCaptureEnabled(deps.env);
  const wireReplyCaptureOn = wireCaptureOn && isWireReplyCaptureEnabled(deps.env);
  const secretBox = createSecretBox(deps.secretBoxKey);
  const cas = createCas(deps.casDir);
  const variants = createVariantCache(deps.variantDir);
  const extractText = createExtractText();
  const passwordHasher = createPasswordHasher(deps.sessionSecret);
  const userRuntimeDirs = createUserRuntimeDirs(userRuntimeDir);

  const ports = createConnectionPorts({ db, now, catalogSettings: createSettingsKvPort(db, CATALOG_SETTINGS_PREFIX, now) });

  // The credentials domain composes BEFORE the runtime: the runtime resolves a connection's sealed secret
  // through it (`resolveCredential` by credentialId — `loadActiveCredential` is gone, §5.3), and reports a
  // derive-task auth failure back to it (#1800). `findProvider` is bound to the runtime's registry through a
  // late-bound holder because the registry exists only once the runtime does — a genuine construction cycle,
  // closed one line after `createInferenceRuntime` returns.
  const runtimeBinding = createBinding<InferenceRuntime>("compose: inference runtime derefed before it was built");
  const runtimeRef = runtimeBinding.read;
  const credentials = createCredentialsService({
    healthThrottle,
    db,
    now,
    newCredentialId: minter(ID_PREFIX.userCredential, idSource),
    box: secretBox,
    findProvider: (providerId, viewer) => runtimeRef().providers.registry.get(providerId, viewer),
    audit,
    emitUserEvent: publishUserEvent,
  });

  const runtime = await createInferenceRuntime({
    random: deps.random,
    ...(deps.providerSeams ?? {}),
    beginEmbeddingAccounting: createRecordUsage({
      db,
      now,
      newCallId: minter(ID_PREFIX.embeddingCall, idSource),
      newInvocationId: minter(ID_PREFIX.embeddingInvocation, idSource),
      applyStatsDelta,
    }),
    now,
    scheduleTimeout: timers.timeout,
    scheduleTimeoutUnref: timers.timeoutUnref,
    log: getLog(),
    span: inferenceSpanOf(deps),
    superviseDetached: (name, attrs, operation) => background.supervise(`inference:${newOpaqueId()}`, name, attrs, operation),
    addSpanEvent,
    securityEvent: (kind, fields) => securityEvent(kind, { ...fields }),
    env: {
      get claudeExecutable(): string | undefined {
        return availableClaudeExecutable();
      },
      hostEnvAllowlist: deps.hostEnvAllowlist,
    },
    app: { name: APP_NAME, url: APP_URL },
    snapshotStore: ports.snapshotStore,
    connections: ports.connections,
    bindings: ports.bindings,
    providerStore: ports.providerStore,
    resolveCredential: ({ credentialId, ownerId, providerId }) => credentials.resolve({ ownerId, credentialId, providerId }),
    // THE DERIVE-ROLE CREDENTIAL STRIKE-OUT (#1800) — a DIRECT wire: the runtime carries the provider's own
    // `ProviderErrorKind` plus the credentialId the call authenticated with, which is exactly
    // `MaybeRevokeParams`; an adapter here could only re-derive a fact it was handed (#1373's whole defect).
    onAuthFailed: credentials.maybeRevokeOnAuthFailed,
    // The sink stamps `at` from the injected clock (no-raw-clock) and forwards to the process ring.
    ...(wireCaptureOn ? { captureWire: (entry): void => recordWireCapture({ ...entry, at: now() }, wireSpill) } : {}),
    // The reply tap lives at the SEND BOUNDARY (it owns the 64 KiB cap and the by-value scrub); compose only
    // carries the verdict. A second opt-in on purpose — see the recorder's header.
    captureWireReply: wireReplyCaptureOn,
    imageToPng: (bytes) => imageAdapter.transform(bytes, { format: "png" }),
    agentSdk: {
      // D8 `session_entries` write path (issue #71) — the sealed backend never touches @orb/db itself.
      sessionWriter: createSessionEntryWriter(db, minter(ID_PREFIX.sessionEntry, idSource)),
      ...(deps.providerSeams?.agentSdk ?? {}),
    },
    userRuntimeDir: (ownerId, tool) => userRuntimeDirs.dirFor(ownerId, tool),
    // Configured provider URLs use this graph's egress guard before its injected raw transport.
    // URL validation always runs; EGRESS_FIREWALL additionally gates scoped endpoint pins/admission
    // and the physical connector's hostname/address/port verdict. Untrusted or provider-returned URLs
    // use safeFetch's independent resolve→validate→pin policy, not this configured-endpoint door.
    sdkFetch: egress.configuredEndpointFetch,
    localLight: {
      // ABSOLUTE on purpose: transformers.js hands `env.cacheDir` straight to its FileCache, which path.joins
      // it per file and lets node's fs resolve the rest — so a cwd-relative value would follow whatever cwd
      // the process happens to have rather than the data root this knob names.
      cacheDir: resolve(deps.env.LOCAL_LIGHT_CACHE_DIR),
      cpuPercent: deps.env.LOCAL_LIGHT_CPU_PERCENT,
      embedDtype: deps.env.LOCAL_LIGHT_EMBED_DTYPE,
      ...(deps.providerSeams?.localLight ?? {}),
    },
  });
  localLightLifetime = runtime.localLight;
  agentSdkLifetime = runtime.agentSdk;
  resources.defer(() => runtime.localLight.settle());
  runtimeBinding.bind(runtime);
  const executor = runtime.executor;

  // The funder's REAL principal by userId (D135 clause G — READ off `users.role` through the one row→Principal
  // home, never stamped). The binder every seam receives: the runtime's per-funder fold over
  // `connection_bindings` (§7.1) under that user's own Principal.
  const resolveFunderPrincipal = createHostPrincipalResolver(sessions);
  const roleClientsFor = async (funderUserId: UserId, actor?: BindingActor): Promise<RoleClientsWithSignal> =>
    runtime.roleClientsFor(await resolveFunderPrincipal(funderUserId), actor);
  const resolveEmbeddingConnection = createResolveEmbeddingConnection(runtime, resolveFunderPrincipal);

  // The connection domain — selection's thin front door over the runtime (§3.3). The four ownership /
  // admission reads it needs are wired here rather than derived inside the domain: a credential row is the
  // credentials domain's, a rule row automation's, a plugin row plugin's, and the allowlist verdict lives on
  // the egress guard. Owner-scoped reads by construction (the id AND the owner are the predicate).
  const connectionCtx: ConnectionContext = {
    db,
    now,
    newConnectionId: minter(ID_PREFIX.userConnection, idSource),
    newBindingId: minter(ID_PREFIX.connectionBinding, idSource),
    runtime,
    audit,
    credentialOwned: createCredentialOwned(db),
    relabelCredential: credentials.relabel,
    ruleOwnedBy: createRuleOwnedBy(db),
    pluginGrantTasksOf: createPluginGrantTasksOf(db),
    endpointAdmission: egress.resolvedEndpointAdmission,
    recordProbeOutcome: credentials.recordProbeOutcome,
    // The late-bound holder above, derefed at request time.
    countOwnedVectors: (ownerId) => countOwnedVectors(ownerId),
    syncEmbedTargets: (ownerId) => embedTargets.syncTargetGenerations(ownerId),
    targetWouldMove: (args) => embedTargets.targetWouldMove(args),
    emitUserEvent: publishUserEvent,
  };
  const connection = createConnectionService(connectionCtx);

  // Built before character so character's by-name card-tag attach port wires to the real tag verb.
  const tagCtx: TagContext = {
    db,
    now,
    newTagId: minter(ID_PREFIX.tag, idSource),
    readAttachedEntity: createReadAttachedEntity({
      characterName: (caller, id) => character.get({ principal: caller, characterId: id }),
      chatTitle: (caller, id) => chat.getChat({ principal: caller, chatId: id }),
      worldBookName: (caller, id) => worldInfo.getBook({ principal: caller, bookId: id }),
      personaName: (caller, id) => persona.get({ principal: caller, personaId: id }),
      presetName: (userId, id) => preset.get({ userId, id }),
    }),
    requireParticipant: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    audit: (entry): Promise<void> => audit(entry, now()),
    emitUserEvent: publishUserEvent,
  };
  const tag = createTagService(tagCtx);

  // The one chat bus, built early (persona composes before buildChatService — chat needs persona.get for turn
  // assembly, a genuine cycle) and threaded into persona's write and
  // buildChatService.
  const chatBus = createChatBus({ db, now, newEventId: minter(ID_PREFIX.chatEvent, idSource) });
  const {
    emitChecked: emitChatEventChecked,
    emit: emitChatEvent,
    prepareCreationEvent: prepareChatCreationEvent,
    emitLive: emitChatEventLive,
  } = createChatPublication({
    bus: chatBus,
    publish: liveBuses.chat.publishChatEvent,
    silenceRoomEntityFan: liveBuses.quiet.silenceRoomEntityFan,
  });

  // The chat's PRESENT host (role='host', leftSeq NULL) — the room authority a room picture runs as.
  const resolveChatHostUserId = (chatId: ChatId): Promise<UserId | null> => loadPresentHostUserId(db, chatId);
  // WHICH preset a Utility-role background task reads (D299) — one home for every side-gen consumer. `preset`
  // composes below (the search-discovery seam), so its `get` is a request-time forward-ref (the `getPreset`
  // precedent — derefed only when a side-gen call fires, never at boot).
  const { resolveUtilityPresetParams } = buildSideGenParams({
    preset: { get: (args) => preset.get(args) },
    loadUserSettings: (userId) => settings.loadUserSettings(userId),
  });

  // ── assets + character + the two seeders (the assets-character seam). Threads the late-bound
  // materializeBackground holder + the request-time preset/persona forward-ref getters (both compose below).
  const assetsCharacter = buildAssetsCharacter({
    env: deps.env,
    evictFieldIndex: fieldIndex.evict,
    emitUserEvent: liveBuses.user.publishUserEvent,
    fetchImpl: egress.safeFetch,
    idSource,
    db,
    now,
    cas,
    variants,
    imageAdapter,
    emit: eventBus.emit,
    audit,
    tag,
    roleClientsFor,
    materializeBackground,
    maxImageBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    imageVariantQuality: () => effectiveConfig.getEffectiveConfig().imageVariantQuality,
    settings,
    newBackgroundEntryId: settingsDeps.newBackgroundEntryId,
    getPreset: () => preset,
    getPersona: () => persona,
    getLorebookImport: () => worldInfoCompose.importWorldInfo,
    resolveUtilityPresetParams,
  });
  const { assets, character, galleryCtx, characterSeeder, personaSeeder, backgroundSeeder, characterOwned } = assetsCharacter;
  // Now that `assets` exists, rebind the real materializeBackground op (the holder above forwards to it).
  materializeBackgroundOp = assetsCharacter.materializeBackgroundOp;

  // ── the derived-data cluster + persona/preset/stats/search/discovery/notifications/workloads (the
  // search-discovery seam). Produces `persona` + `preset` (forward-referenced above) and `workloads` +
  // `enqueueEmbedReindex` (bound onto the keystone's late-bound holder below).
  const searchDiscovery = buildSearchDiscovery({
    fieldIndex,
    emitWorkloadEvent: workloadEvents.emitWorkloadEvent,
    emitUserEvent: liveBuses.user.publishUserEvent,
    supervise: background.supervise,
    scheduleTimeout: timers.timeout,
    idSource,
    db,
    now,
    audit,
    roleClientsFor,
    resolveEmbeddingConnection,
    withStableEmbeddingBinding: connection.withStableEmbeddingBinding,
    eventBus,
    attachCardTagByName: tag.attachCardTagByName,
    resolveUtilityPresetParams,
    character,
    assets,
    settings,
    getEffectiveConfig: () => effectiveConfig.getEffectiveConfig(),
    emitChatEvent,
    emitChatEventLive,
    // preset's ONE cross-feature op (`resolveEffective` projects the funnel against the caller's own chat
    // model) — the SAME verb the client's params panel already reads, so the two can't disagree.
    resolveChatCapability: (args) => connection.resolveChatCacheContext(args),
    getContributions: getWorkloadContributions,
    isMemoryEnabled: (ownerId) => isMemoryEnabled(ownerId),
    emptyMemoryScope: (ownerId) => emptyMemoryScope(ownerId),
  });
  const {
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
  } = searchDiscovery;
  // Bind the embed-space sweep enqueue now that `workloads` exists.
  embedReindex = searchDiscovery;
  countOwnedVectors = searchDiscovery.embeddings.countOwnedVectors;
  embedTargets = searchDiscovery.embeddings;
  await searchDiscovery.embeddings.purgeDisallowedImages();
  refreshAutoindex = searchDiscovery.refreshAutoindex;

  // ── the refinery seam (R1) — the card-refinery pipeline over the summarize rung. Needs `character`
  // (the four injected ops) + the caller-scoped preset/prose resolvers; nothing composes on top of it.
  const { refinery, refineryWorkloads } = buildRefinery({
    emitUserEvent: liveBuses.user.publishUserEvent,
    idSource,
    db,
    now,
    roleClientsFor,
    resolveStructuredBinding: createResolveStructuredBinding({ resolve: (input) => runtime.resolve(input), principalOf: resolveFunderPrincipal }),
    character,
    resolveUtilityPresetParams,
    loadUserSettings: settings.loadUserSettings,
  });

  // ── the regex script LIBRARY (D121-E). Built before admin/chat: admin's export service needs its card
  // RE-EMBED op and chat's context needs its four-scope RESOLVE op.
  const regexCompose = buildRegex({ emitUserEvent: liveBuses.user.publishUserEvent, db, now, audit, emitChatEventLive, idSource });

  // ── admin + the ONE tool-use registry + the export service (the admin seam).
  const { admin, toolUse, exportService } = buildAdmin({
    emitUserEvent: liveBuses.user.publishUserEvent,
    idSource,
    db,
    now,
    newUserId,
    hashPassword: passwordHasher.hash,
    seedUserConnections,
    audit,
    sessions,
    // W7a — an admin revoke ends the streams those sessions opened, not just the cookies. The registry is
    // built above in this same function (transport state, entry-owned clock), so the port wires here.
    sockets: { evictSession: (sessionId) => sockets.evictSession(sessionId), evictUser: (userId) => sockets.evictUser(userId) },
    character,
    embeddings,
    roleClientsFor,
    cas,
    imageTransform: imageAdapter.transform,
    exportCardScripts: regexCompose.exportCardScripts,
    // R6 — the chat-anchored campaign READ the orb-native chat-bundle export carries. A standalone factory
    // (db only), so it wires here rather than waiting on the rpg compose seam below.
    exportRpgGame: createExportRpgGame({ db }),
    serverRestart: deps.serverRestart,
  });

  // ── imagery (the imagery seam). `resolveViewerVisibility` is a late-bound forward-ref (chat composes below);
  // the getter derefs the const once it exists.
  const imagery = buildImagery({
    fetchImageBytes: egress.fetchImageBytes,
    idSource,
    db,
    now,
    connection,
    executor,
    assets,
    characterOwned,
    character,
    roleClientsFor,
    // D298: a room picture runs as the present host, loaded with its real role.
    resolveChatHostUserId,
    isCharacterSeated: (chatId, characterId) => isCharacterSeated(db, chatId, characterId),
    resolveHostPrincipal: resolveFunderPrincipal,
    maxImageBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    resolveViewerVisibility: (chatId, userId) => resolveViewerVisibility(chatId, userId),
    resolveUtilityPresetParams,
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
    emitUserEvent: liveBuses.user.publishUserEvent,
    fetchWebDocument: egress.fetchWebDocument,
    idSource,
    db,
    now,
    audit,
    assetsStore: assets.store,
    loadAssetBytes: createAssetEmbeddingReads(assets).loadAssetBytes,
    embeddings,
    extractText,
    roleClientsFor,
    search,
    workloads,
    loadUserSettings: settings.loadUserSettings,
    emitChatEventLive,
  });

  // The host's REAL principal by userId — shared by chat compose and rpg's lite capability resolve (a game turn
  // runs as the host, D19).
  const resolveHostPrincipal = resolveFunderPrincipal;
  // FORWARD-REF (docs/plans/rpg/design.md): chat's turn hooks call rpg's `ChatRpgOps`, but rpg builds AFTER chat
  // (chat's `rpgChatOps` is rpg's dep). The delegate below forwards to a late-bound holder bound SYNCHRONOUSLY
  // once rpg composes, a few lines down (the agents-delegate precedent) — no request can run before then, so the
  // holder is always live at call time (a null read would be a compose-order bug, hence the throw).
  const rpgBinding = createBinding<NonNullable<ChatContext["rpg"]>>("rpg ops accessed before the rpg seam composed (compose-order bug)");
  const rpgOps = rpgBinding.read;
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
  // The PLUGIN-MACRO registry — ONE process-wide instance, minted HERE rather than
  // inside the plugin plane because chat composes FIRST and both sides need the same object: chat reads it per
  // turn (`ChatContext.pluginMacros`), the plugin plane writes it at activation. Minting it at the shared root
  // is what keeps this out of the late-bind shape the S4 confirmed-act runner had to take.
  const pluginMacros = createPluginMacroRegistry(timers.timeout);
  const chatCompose = buildChatService({
    publishChatChanged: liveBuses.user.publishChatChanged,
    publishNotification: liveBuses.notifications.publishNotification,
    timers,
    backgroundSignal: background.signal,
    trackBackground: background.track,
    ...turnOutcomeRecorderOf(wireCaptureOn, wireSpill),
    random: deps.random,
    idSource,
    resolveUtilityPresetParams,
    mediaProcessing: { frameCount: imageAdapter.frameCount, prepareVideo: createVideoPreparer(timers.timeoutUnref) },
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
    roleClientsFor,
    connection,
    character,
    persona,
    resolvePersonasForParticipants,
    preset,
    settings,
    notifications,
    search,
    assets,
    materializeBackground,
    // §6.7: the inline-reply picture store. Built HERE rather than inside `buildChatService` because the
    // per-image byte cap is a boot dep, and it is the exact `materializeBackground` shape one line up — the
    // same egress + magic belts over a response-controlled URL, only the asset `kind` differs.
    storeInlineReplyImage: createStoreInlineReplyImage({
      fetchImpl: egress.safeFetch,
      storeGenerated: createStoreGeneratedImage({
        store: (args) => assets.store(args),
        resolvePrincipal: resolveHostPrincipal,
        maxBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
      }),
      maxBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    }),
    embeddings,
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    resolveUserEnabled: createResolveUserEnabled(sessions),
    authMode,
    signup: {
      signupUserStatement: sessions.signupUserStatement,
      signupPersonaStatement: joinerPersonaStatement,
      signupPersonaPointersStatement: createJoinerSettingsStatement({ db }),
      minterMayMintSignup: createSignupMinterCheck(sessions, resolveHostPrincipal),
    },
    runChatTurn: executor.runChatTurn,
    // The Anthropic prompt-cache depth FLOOR, read PER TURN off the resolved AppSettings tier (Settings ›
    // Admin › System tuning). A thunk, so an admin flip governs the next turn with no restart.
    promptCacheMinDepth: () => effectiveConfig.getEffectiveConfig().promptCacheMinDepth,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
    // The `{{databank}}` slot's in-turn retrieval, with the SAME space-refusal degrade the digest op carries
    // (#2510 — `retrieval-degrade.ts` states the boundary). This arm is the one that was actually killing
    // turns: `search.documents` runs once per turn whether or not the room has documents, so an owner whose
    // vector space was mid-move could not send a message at all. `null` is databank's own ruled empty — the
    // byte-identical no-op an absent op produces — so a degraded gather assembles exactly like a bankless one.
    gatherDatabank: createGatherDatabankForTurn((args) => databank.gatherRetrieval(args), withRetrievalDegrade),
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
  chatLifetime = chatCompose;
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;
  isMemoryEnabled = chatCompose.isMemoryEnabled;
  emptyMemoryScope = chatCompose.emptyMemoryScope;

  // The preset-ownership gate (fork-clones-the-game §3.2) — `forkGame` asks whether a source game's `gmPresetId`
  // is SAFE for the forker to carry (readable BY them). Off the preset front door `get` (the ONLY legal preset
  // import): it returns the preset for an owned row OR the shared system default, and throws `PresetNotFoundError`
  // for a preset the user can't read — the exact "foreign preset" the strip drops. Any OTHER error is a genuine
  // fault and RETHROWS (never swallowed into a false "not owned").
  const resolvePresetOwned = createPresetReadable(createLoadOptionalPreset((args) => preset.get(args)));

  // ── rpg (the rpg seam) — the LITE vertical. Built AFTER chat (its `rpgChatOps` are rpg's cross-feature deps);
  // its `ChatRpgOps` are bound back onto the forward-ref holder above so chat's turn hooks reach the live rpg
  // service. Registers rpg's 7 state tools into the ONE tool registry (the imagery precedent).
  // R-OBS — the rpg flight recorder. Built ONLY when tracing is enabled, and `undefined` otherwise: the emit
  // sites guard with `deps.trace?.(…)`, so an untraced deployment never even constructs an event object and
  // its turns are byte-identical. The knob is the root's record, so a test root turns it in its own parse.
  // THE cross-domain viewer-visibility op (the read-visibility D-entry): membership AND the D16 canon floor as
  // ONE answer for one human over one chat. Built ONCE here and injected into every non-chat consumer that
  // decides "may this human see this chat's CONTENT" — imagery's extractQuiet (via the late-bound getter
  // above), the automation plugin fan-out's delivery gate, the plugin membrane's canon read, and rpg's
  // member-facing reads (#1528). There is exactly ONE clamp home (chat's `resolveHistoryFloorSeq`, reached
  // only through this op). Declared BEFORE the rpg compose because rpg consumes it; it needs only `db`.
  const resolveViewerVisibility = createResolveViewerVisibility({ db });

  const rpgTrace = deps.env.RPG_TRACE === "on" ? createRpgTraceRecorder({ now }) : undefined;
  const rpgCompose = buildRpg({
    emitRpgEvent: rpgEvents.publishRpgEvent,
    scheduleTimeout: timers.timeout,
    randomInt: deps.randomInt,
    idSource,
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
    copyPresetToUser: createCopyPresetToUser({ db, now, newPresetId: minter(ID_PREFIX.preset, idSource) }),
    // R4 promotion's durable half — the two front doors the injected `promoteToCharacter` op mints through (a
    // character card + a chat roster seat, both under the room host). rpg reads neither table itself.
    character,
    chat: chatCompose.service,
    toolUse,
  });
  rpgLifetime = rpgCompose;
  rpgBinding.bind(rpgCompose.chatOps);
  const rpg = rpgCompose.service;
  // IMGMAC — the chat's authored user-macro DEFS from BOTH homes, for imagery's mode-template extraction (the
  // late-bound thunk threaded into `buildImagery` above). Pure wiring: it reads the two existing front doors
  // (chat's active-preset macro declaration + rpg's game macros) and hands them over UNMERGED, because the
  // preset↔game shadow is chat's ruled policy and has exactly one home (`shadowPresetUserMacros`).
  const resolveChatUserMacroDefs = createResolveChatUserMacroDefs(
    (chatId) => chatCompose.rpgChatOps.resolvePromptUserMacros(chatId),
    (chatId) => rpgOpsDelegate.resolveUserMacros(chatId),
  );

  // ── world-info + the import ports + the bulk importers + the OWNER-principal resolver (the world-info seam).
  const worldInfoCompose = buildWorldInfo({
    emitUserEvent: liveBuses.user.publishUserEvent,
    idSource,
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
  const runInstallerCharacterImport = createInstallerCharacterImport({
    resolvePrincipal: resolveOwnerPrincipal,
    contextFor: (principal) =>
      buildImportContext({
        principal,
        characterOps: createCharacterImportOps(principal, character),
        storeAsset: createImportAvatarStore(principal, (args) => assets.store(args)),
        attachCardTag: createImportedCardTag(principal.userId, (args) => tag.attachCardTagByName(args)),
        importLorebook: (args) => importWorldInfo.importLorebook(args),
        hasPrimaryBook: (args) => importWorldInfo.hasPrimaryBook(args),
        linkCarriedBooks: (args) => importWorldInfo.linkCarriedBooks(args),
        importCardScripts: (args) => regexCompose.importCardScripts(args),
      }),
  });

  // ── automation + plugin (the automation-plugin seam) — built LAST of the domain services (both close over
  // chat/world-info/imagery/notifications + resolveOwnerPrincipal; plugin reuses automation's op objects).
  const automationPlugin = await buildAutomationPlugin({
    env: deps.env,
    ...pluginExecutionInputs(deps),
    monotonicNow: deps.monotonicNow,
    timers,
    emitUserEvent: liveBuses.user.publishUserEvent,
    publishNotification: liveBuses.notifications.publishNotification,
    publishAutomationEvent: liveBuses.automation.publishAutomationEvent,
    egress,
    scheduleTimeout: timers.timeout,
    random: deps.random,
    newOpaqueId,
    idSource,
    db,
    now,
    connection,
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
    roleClientsFor,
    resolveUtilityPresetParams,
    // #679 U8 seams 15/17 — the two canon-write ops the plugin membrane rides under the installer. databank's
    // own createFromText content-addresses + dedups + enqueues the ingest workload (the indexer).
    databankCreateFromText: databank.createFromText,
    // #679 U8 seam 17 — the guest JSON card serialized to bytes (no embedded avatar) through the shared funnel.
    ingestCharacterCard: ({ installerUserId, card, pluginId }) => runInstallerCharacterImport(installerUserId, serializeImportCard(card), pluginId),
    // #798 — the remote-image "summon with art" arm. Read the PNG from the installer's OWN CAS through the
    // OWNER-GATED `readOwnedAssetBytes` (a foreign/absent id throws leak-free — `AssetNotFoundError` collapses
    // "not yours" and "absent", no existence oracle), then run the SAME funnel: a PNG carries its embedded
    // avatar, so the summoned character arrives WITH its art. Owner-scoped by construction (the read AND the
    // import both run under the installer's own resolved Principal).
    ingestCharacterAsset: createImportOwnedAsset({
      resolvePrincipal: resolveOwnerPrincipal,
      readOwnedAssetBytes: (principal, assetId) => assets.readOwnedAssetBytes(principal, assetId),
      importBytes: runInstallerCharacterImport,
    }),
  });

  pluginLifetime = automationPlugin;
  const { automation, plugin } = automationPlugin;

  // ── roster-preset (saved parties, D61 B6) — built AFTER chat AND after automation (moved below the
  // automation-plugin seam when B10's rules rider landed): `applyToChat` drives chat's own host-gated
  // verbs + chat's own `requireHost` guard, and the rules rider drives automation's own front-door
  // verbs, all through injected ops (one authority home per domain).
  const rosterPreset = buildRosterPreset({ db, now, audit, emitUserEvent: publishUserEvent, can, chat, automation, idSource });

  // ── portability + the workloads runner-env (the portability-runner seam) — built LAST.
  const { portability, importWorkloads, settleImportMemory } = buildPortabilityRunner({
    quiet: liveBuses.quiet.withQuietBulkFanout,
    emitUserEvent: liveBuses.user.publishUserEvent,
    publishChatChanged: liveBuses.user.publishChatChanged,
    idSource,
    db,
    now,
    tagCtx,
    settingsCtx,
    presetCtx,
    worldInfoExportCtx: { db },
    importStandaloneLorebook: createImportStandaloneLorebook({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook, idSource),
      newEntryId: minter(ID_PREFIX.worldEntry, idSource),
    }),
    // The ST world NAME-LINK attach (card `extensions.world` + charLore) — same ctx shape as the standalone
    // import; the id minters are unused by an attach but ride the one WorldInfoImportContext bundle.
    attachBooksByName: createAttachOwnedBooksByName({
      db,
      now,
      newBookId: minter(ID_PREFIX.worldBook, idSource),
      newEntryId: minter(ID_PREFIX.worldEntry, idSource),
    }),
    galleryCtx,
    imageryPortability: createImageryPortability({
      db,
      newCallId: minter(ID_PREFIX.imageryCall, idSource),
      newGenerationId: minter(ID_PREFIX.imageryGeneration, idSource),
      bumpStatsCanonVersion,
    }),
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
    importReportsDir,
  });

  // Assemble the contribution registry + close the late-bound holder the workloads verbs deref.
  const workloadContributions = buildWorkloadContributions({
    idSource,
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
    // The databank and memory sweeps' completion ops: one covered-owner set, per-owner receipts.
    ...createVectorSweepOps({
      embeddings,
      listCorpusOwners: searchDiscovery.listCorpusOwners,
      vacuousMemoryReceipt: searchDiscovery.vacuousMemoryReceipt,
    }),
    // The databank and memory sweeps settle on it the way the `index` sweep does.
    targetSnapshot: embeddings.targetSnapshot,
    backfillMemory: (args) => chatCompose.backfill.memory(args),
    estimateMemoryBackfill: (args) => chatCompose.backfill.estimateMemory(args),
    // The #156 admission gate's read — one hop to the ONE memory-config merge, never a second settings read.
    isMemoryEnabled: chatCompose.isMemoryEnabled,
    backfillGroupCharacters: (args) => chatCompose.backfill.groupCharacters(args),
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

  workloadBinding.bind(workloadContributions);

  const settingsComposedOps = createSettingsComposedOps(settings);

  const share = resources.use(
    createShareService({
      relay: deps.share.relay,
      certificate: deps.share.certificate,
      certificateSetting: settingsComposedOps.certificateSetting,
      saveCertificateSetting: settingsComposedOps.saveCertificateSetting,
      publicBind: deps.share.publicBind,
      appPort: deps.share.appPort,
      enableSeating: createEnableShareSeating({
        seating: () => settings.getEffectiveConfig(),
        getAppSettingsWithOverrides: (params) => settings.getAppSettingsWithOverrides(params),
        updateAppSettings: async (params) => {
          await settings.updateAppSettings(params);
        },
        getOwnerUserId: () => sessions.getOwnerUserId(),
        resolvePrincipal: resolveHostPrincipal,
      }),
      requireOwner,
      requireAdmin,
      authMode,
      authModeSource: deps.authModeSource,
      install: installKind(deps.env),
      ownerNeedsPassword: () => sessions.ownerNeedsPassword(),
      localSetupUrl: deps.share.localSetupUrl,
      publicAddresses: publicAddresses(authMode, allowedHostsInput(deps.env)),
      liveSocketCount: (userId) => sockets.liveSocketCount(userId),
      audit,
      now,
    }),
  );

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
    share,
    stats,
    tag,
    workloads,
    worldInfo,
  };

  // The ONE user seed (D263) boot + the app first-request hook share: the manifest's items, gated by the
  // account's seed ledger. Built here, after the roster presets it creates and the two seeders it drives.
  const seedContentEnabled = deps.env.SEED_CONTENT === "on";
  const contentSeeder = createUserContentSeeder({
    enabled: () => seedContentEnabled,
    manifest: SEED_MANIFEST,
    now,
    seededKeys: createReadSeededKeys(db),
    recordSeeded: (userId, keys, at) => recordSeededItemKeys(db, userId, keys, at),
    legacyLatches: settingsComposedOps.legacyLatches,
    seedCharacter: (principal, handle) => characterSeeder.seedCard(principal, handle),
    seedPersona: createSeedPersonaWithCompletion({
      ensureSeeded: (principal) => personaSeeder.ensureSeeded(principal),
      isSeeded: settingsComposedOps.personaSeeded,
    }),
    findCharacter: createFindSeedCharacter((args) => character.findByHandle(args)),
    createRosterPreset: createSeedRosterPreset((args) => rosterPreset.create(args)),
  });

  // The ONE example-plugin seeder instance boot + the app first-request hook share. It drives the REAL plugin
  // verbs under the RECEIVING USER's own Principal — never a synthetic installer and never a second install
  // path: the bundle meets the same unzip hardening, manifest validation and CAS store a hand upload meets,
  // and `install`'s own `(owner, slug)` collision refusal is the seeder's layer-2 idempotency.
  const pluginSeedOps = createPluginSeedOps({
    install: (args) => services.plugin.install(args),
    setGrant: (args) => services.plugin.setGrant(args),
    upgrade: (args) => services.plugin.upgrade(args),
    list: (args) => services.plugin.list(args),
    applyDistributedPlugins: (args) => services.plugin.applyDistributedPlugins(args),
  });
  const examplePluginSeeder = createExamplePluginSeeder({
    packBundle: packShowcaseBundle,
    install: pluginSeedOps.install,
    requestConsent: pluginSeedOps.requestConsent,
    upgrade: pluginSeedOps.upgrade,
    bundledVersion: createShowcaseVersionReader(readShowcaseManifest),
    listHeld: pluginSeedOps.listHeld,
    isSeeded: settingsComposedOps.isExamplePluginSeeded,
    markSeeded: settingsComposedOps.markExamplePluginSeeded,
    readSeededVersions: settingsComposedOps.readSeededPluginVersions,
    writeSeededVersions: settingsComposedOps.writeSeededPluginVersions,
  });
  const distributedPluginApplier = createDistributedPluginApplier({
    apply: pluginSeedOps.apply,
    isApplied: settingsComposedOps.isDistributedPluginApplied,
    markApplied: settingsComposedOps.markDistributedPluginApplied,
  });

  stopAutomationWatcher = startAutomationWatcher(
    createAutomationWatcherEnv({
      automation,
      eventBus,
      chatEvents: liveBuses.chat,
      supervise: background.supervise,
      newOpaqueId,
    }),
  ).stop;
  liveBuses.chatOpen.setChatOpenTap((chatId) => {
    background.supervise(`automation:chat-opened:${chatId}:${newOpaqueId()}`, "automation.handleEvent", { eventType: "chatOpened", chatId }, () =>
      automation.handleEvent({ type: "chatOpened", chatId }),
    );
  });

  // biome-ignore lint/nursery/useDisposables: jobsLifetime adopts this exact owner for graph cancellation and joins; local await using would stop it before startup.
  const jobs = buildServiceJobs({
    db,
    now,
    contributions: workloadContributions,
    audit,
    services,
    ownerId: deps.ownerId ?? null,
    timers,
    newOpaqueId,
    progress: workloadEvents,
    track: background.track,
    supervise: background.supervise,
  });
  jobsLifetime = jobs;

  const lifetime = construction.move();
  return {
    startJobs: jobs.start,
    workloadEvents,
    liveBuses,
    egress,
    forwardJwtVerifier,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
    settleBackground: background.settle,
    supervise: background.supervise,
    newOpaqueId,
    services,
    rateLimit,
    multiHumanCapable,
    automation,
    presence,
    sockets,
    sessions,
    embeddings,
    indexer,
    assets,
    exportService,
    portability,
    settleImportMemory,
    importWorldInfo,
    importCardScripts: regexCompose.importCardScripts,
    eventBus,
    workloadContributions,
    databankIngest,
    runtime,
    roleClientsFor,
    audit,
    effectiveConfig,
    secretBox,
    characterSeeder,
    personaSeeder,
    contentSeeder,
    backgroundSeeder,
    examplePluginSeeder,
    distributedPluginApplier,
    rpgChatOps: rpgCompose.chatOps,
    rpgTrace,
    recallRecorder,
    toolUse,
    chatRpgOps: chatCompose.rpgChatOps,
    signupInvites: chatCompose.signupInvites,
    seedUserConnections,
    enqueueEmbedReindex: (scope) => embedReindex.enqueueEmbedReindex(scope),
    detachEmbedReindex: (scope): void => {
      embedReindex.detachEmbedReindex(scope);
    },
    detachStaleSpaceReindex: (): void => {
      embedReindex.detachStaleSpaceReindex();
    },
    wireCaptureOn,
    bugReportDiagnostics: createBugReportDiagnosticsRead(deps.env),
  };
}
