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
// Determinism: `now` is an injected param (compose never calls Date.now()); id minters are built from
// mintTypeId/newId. Compose order: guards → sessions → settings → runtime → credentials → connection →
// assets-character → search-discovery → admin → imagery → databank → chat → world-info → automation/plugin →
// portability/runner. settings' effective-config cache is warmed before the runtime (it publishes the F12
// private-endpoint allowlist and sources the agent-sdk fan-out cap).
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
import { resolve } from "node:path";
import type { DurableChatBusEvent, LiveOnlyChatBusEvent, LiveOnlyChatEventType } from "@orb/contracts/chat";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { EmbedResult } from "@orb/contracts/providers";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { automationRules, chatParticipants, plugins, userCredentials } from "@orb/db";
import { fetchOwned } from "@orb/db/kit";
import { readSeedDemoChat } from "@orb/default-content";
import type { InferenceDeps, InferenceRuntime, Resolved, RoleClientsWithSignal } from "@orb/inference";
import { createInferenceRuntime, resolveClaudeExecutable } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, PersonaId, PluginId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, newId } from "@orb/kit/ids";
import { packShowcaseBundle, readShowcaseManifest } from "@orb/showcase-plugins";
import { and, eq, isNull } from "drizzle-orm";
import type { ServerRestartPort } from "#domain/admin";
import { can, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import { createAutomationTeachingContributions } from "#domain/automation";
import type { DefaultCharacterSeeder } from "#domain/character";
import type { ChatContext, ChatUserMacroDefs, DemoChatSeeder, MemoryEmbedSpace, MemoryRecallRecorder, SignupInviteOps } from "#domain/chat";
import { createDemoChatSeeder, createMemoryRecallRecorder, createResolveViewerVisibility, loadSeededChatDressing } from "#domain/chat";
import type { ConnectionContext } from "#domain/connection";
import { createConnectionPorts, createConnectionService } from "#domain/connection";
import { createCredentialsService } from "#domain/credentials";
import type { DatabankIngest } from "#domain/databank";
import type { EmbeddingConnectionSnapshot, EmbeddingsIndexer, EmbeddingsService, GenerationReceipt } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createImportService } from "#domain/import";
import { PersonaNotFoundError } from "#domain/persona";
import { createPluginMacroRegistry } from "#domain/plugin";
import { createCopyPresetToUser, PresetNotFoundError } from "#domain/preset";
import type { RpgTraceRecorder } from "#domain/rpg";
import { createExportRpgGame, createRpgTraceRecorder } from "#domain/rpg";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import type { DefaultBackgroundSeeder, SettingsContext, SettingsServiceDeps } from "#domain/settings";
import { createSettingsContext, createSettingsService } from "#domain/settings";
import type { RelayController } from "#domain/share";
import { createShareService } from "#domain/share";
import type { TagContext } from "#domain/tag";
import { createTagService } from "#domain/tag";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseTeachingContributions } from "#domain/tool-use";
import type { WorkloadContributions } from "#domain/workloads";
import { createAttachOwnedBooksByName, createImportStandaloneLorebook } from "#domain/world-info";
import { APP_NAME, APP_URL } from "#foundation/config";
import { allowedHostsInput, bindPostureInput, env, processEnvSnapshot, publicAddresses } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import {
  addSpanEvent,
  getLog,
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  logAudit,
  recordWireCapture,
  securityEvent,
  span,
  superviseDetached,
} from "#foundation/observability";
import { versionIdentity } from "#foundation/version";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createExtractText } from "#infra/extraction";
import { createImageAdapter } from "#infra/image";
import { endpointAdmission, publishPrivateEndpointAllowlist } from "#infra/network";
import { createCas, createUserRuntimeDirs, createVariantCache } from "#infra/storage";
import { createChatBus, requireParticipant } from "../../domain/chat/index.ts";
import type { Services } from "../../transport/trpc/context.ts";
import { publishChatEvent, publishUserEvent, silenceRoomEntityFan } from "../../transport/trpc/index.ts";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry.ts";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry.ts";
import type { SocketRegistry } from "../../transport/trpc/stream/socket-registry.ts";
import { createSocketRegistry } from "../../transport/trpc/stream/socket-registry.ts";
import { createHostPrincipalResolver } from "../auth/index.ts";
import type { DefaultPersonaSeeder, DistributedPluginApplier, ExamplePluginSeeder } from "../boot/index.ts";
import { createDistributedPluginApplier, createExamplePluginSeeder, createLocalLightUserSeed } from "../boot/index.ts";
import type { ImportWorldInfoPort } from "../import/index.ts";
import { buildImportContext } from "../import/index.ts";
import { buildAdmin } from "./admin.ts";
import { buildAssetsCharacter } from "./assets-character.ts";
import { buildAutomationPlugin } from "./automation-plugin.ts";
import type { ChatComposeInput, ChatComposeResult } from "./chat.ts";
import { buildChatService, createSignupMinterCheck } from "./chat.ts";
import { buildDatabank } from "./databank.ts";
import { createDemoChatGameDoor } from "./demo-chat-game.ts";
import type { EffectiveConfigWiring } from "./effective-config.ts";
import { createEffectiveConfigWiring } from "./effective-config.ts";
import type { DomainEventBus } from "./event-bus.ts";
import { createDomainEventBus } from "./event-bus.ts";
import { buildImagery } from "./imagery.ts";
import { createStoreInlineReplyImage } from "./inline-reply-image.ts";
import { minter } from "./minter.ts";
import { buildPortabilityRunner } from "./portability-runner.ts";
import { buildRefinery } from "./refinery.ts";
import { buildRegex } from "./regex.ts";
import { withRetrievalDegrade } from "./retrieval-degrade.ts";
import { buildRosterPreset } from "./roster-preset.ts";
import type { RpgComposeResult } from "./rpg.ts";
import { buildRpg } from "./rpg.ts";
import { buildSearchDiscovery } from "./search-discovery.ts";
import { createSessionEntryWriter } from "./session-entries.ts";
import { buildSideGenParams } from "./side-gen-params.ts";
import { createProbeUpstreamHead } from "./update-check.ts";
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

/** The runtime seams a composition root MAY override — the SDK `query` test seam, the D8 session store, a
 *  prebuilt local-light model cache, a wire-capture sink, and the provider TRANSPORT. Everything else the
 *  runtime needs is wired HERE from the domains; nothing about a provider, an engine or a posture is a boot
 *  dep any more (§4, F1/F2).
 *
 *  `sdkFetch` is the one seam that is REQUIRED on `InferenceDeps` and therefore always supplied below: a
 *  caller that does not override it gets the deployment's real transport, a caller that does gets its fake
 *  from the runtime's FIRST call onward. That ordering is the whole reason the field is required —
 *  `buildBackends` resolves the transport ONCE, synchronously, inside `createInferenceRuntime`, so a
 *  `vi.spyOn(globalThis, "fetch")` installed after `createServices` has already returned can never reach it.
 *  While the field was optional with an ambient fallback, a composed-real test that forgot the seam reached
 *  a real listening inference engine on the box and asserted against its real answer. */
type InferenceSeams = Partial<Pick<InferenceDeps, "agentSdk" | "localLight" | "captureWire" | "sdkFetch">>;

/**
 * What boot supplies to stand up the whole service graph. The env→config→runtime facts (the private-endpoint
 * allowlist, the agent-sdk fan-out cap, the local-light cache dir) are read from the resolved effective
 * config + `env` inside `createServices`, never passed in.
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
  /** The staging root the upload route stages a zip under; absent ⇒ `DEFAULT_IMPORT_STAGING_DIR`
   *  (the same default the route resolves). */
  readonly importStagingDir?: string;
  /** The ST profile-directory snapshot `import-st`'s `importAll` reads; absent ⇒ repo-root `.st-data`. */
  readonly stProfileDir?: string;
  readonly sessionSecret: string | null;
  readonly providerSeams?: InferenceSeams;
  /** This replica's stable lock-holder tag — must match the boot reclaim's match key. */
  readonly holder?: string;
  /** Force the rpg flight recorder on (R-OBS), independent of `env.RPG_TRACE` — the drive kit / a trace int test
   *  passes `true` so it never depends on the ambient env. Absent ⇒ `env.RPG_TRACE === "on"` decides. */
  readonly rpgTrace?: boolean;
  /** TASK-24: force the provider wire-capture sink on, independent of `env.WIRE_CAPTURE` — an int test passes
   *  `true`. Absent ⇒ `isWireCaptureEnabled()` (env) decides. When neither is on, NO sink is wired into the
   *  backends (zero cost, zero retained bytes). */
  readonly wireCapture?: boolean;
  /** Audit D2/D3: force the REPLY tap on, independent of `env.WIRE_CAPTURE_REPLY`. Absent ⇒
   *  `isWireReplyCaptureEnabled()` (env) decides. Inert unless the request sink is wired at all. */
  readonly wireCaptureReply?: boolean;
  /** The process restart `admin.restart` drives (`entry/lifecycle.ts` builds it; a test passes an unsupervised one). */
  readonly serverRestart: ServerRestartPort;
  /** The share relay `share.*` drives (`entry/lifecycle.ts` builds it; a test passes {@link NO_SHARE_RELAY}). */
  readonly share: ShareComposeDeps;
}

/** The lifecycle-owned half of the share service: the one relay controller and this machine's setup address. */
export interface ShareComposeDeps {
  readonly relay: RelayController;
  readonly localSetupUrl: () => string;
}

/** The share deps for a composition that runs no relay (a seed script, a test graph): `status` reads `off`, `stop` has
 *  nothing to end, and a start that passes the preconditions throws rather than pretend a relay started. */
export const NO_SHARE_RELAY: ShareComposeDeps = {
  relay: {
    start: () => Promise.reject(new Error("compose: this composition runs no relay")),
    stop: (): void => undefined,
    status: () => ({ state: "off" }),
  },
  localSetupUrl: (): string => {
    throw new Error("compose: this composition serves no local origin");
  },
};

/** The restart port for a composition no supervisor started (a seed script, a test graph). `admin.restart` refuses as
 *  unsupervised before it reaches `restart`, which throws if anything ever does. */
export const UNSUPERVISED_RESTART: ServerRestartPort = {
  supervised: false,
  restart: (): void => {
    throw new Error("compose: nothing supervises this process, so nothing may restart it");
  },
};

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
  /** The ONE inference runtime (§3.3) — surfaced for the boot's local-light prefetch plan and the composed-real
   *  int tests; every domain reaches it through its own injected ops, never this handle. */
  readonly runtime: InferenceRuntime;
  /** The per-FUNDER `RoleClients` binder (§8.5b): the runtime's binding fold under that user's real Principal.
   *  The workloads worker binds a pass's role clients from this; entry never touches the raw executor. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly effectiveConfig: EffectiveConfigWiring;
  readonly secretBox: SecretBox;
  /** The default-card seeder — the one instance both boot and the app first-request hook share, so the
   *  in-process memo + persisted latch hold across both call sites. */
  readonly characterSeeder: DefaultCharacterSeeder;
  /** Mirrors `characterSeeder`, for the default `{{user}}` persona. */
  readonly personaSeeder: DefaultPersonaSeeder;
  /** Mirrors `characterSeeder`, for the bundled EXAMPLE conversations. MUST run AFTER `characterSeeder` —
   *  each example attaches to seeded cards (a missing handle skips that example, never a partial room). */
  readonly demoChatSeeder: DemoChatSeeder;
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
  /** #412 — whether THIS compose actually wired the provider wire-capture request sink (`deps.wireCapture`
   *  OR the env flag). `lifecycle.ts` hands it to `createApp`, which publishes it on
   *  `/api/_debug/wire/captures` as `enabled` so a reader can tell an off recorder from a quiet one. Surfaced
   *  because the decision lives HERE and nothing downstream can re-derive the force-flag half. */
  readonly wireCaptureOn: boolean;
  /** D254 — chat's signup-invite ops, for the local signup route. */
  readonly signupInvites: SignupInviteOps;
  /** The per-user local-light seed, surfaced for the signup route (it runs after the signup commit). */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
  /** Enqueue one owner's cards, documents and memory sweeps after a seed changed their embed space. Surfaced
   *  for boot, whose owner seed and local-light sweep run outside the compose-built seed. */
  readonly enqueueOwnerEmbedIndex: (ownerId: UserId) => void;
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

const OWNER_EMBED_INDEX_SPAN = "embeddings.ownerEmbedIndex";

/** Construct the full service graph + the boot handles. Async: the runtime loads the provider registry's
 *  runtime rows (`provider_rows`) before any consumer that resolves against it is built. */
export async function createServices(deps: ServicesDeps): Promise<ServicesResult> {
  const { db, now } = deps;
  const presence = createPresenceRegistry(now);
  const sockets = createSocketRegistry(now);

  const audit = (entry: AuditEntry, at: number): Promise<void> => logAudit(db, entry, at);
  const newUserId = (): UserId => newId<UserId>();
  const eventBus = createDomainEventBus();

  // #2481 — the per-user half of the local-light seed (§7.2/§5.3b). The boot SWEEP covers the accounts
  // alive at boot; this op is what covers every account minted afterwards, and it is threaded into both
  // user-minting domains (sessions below, admin further down) rather than called from one of them —
  // neither may import `domain/connection`.
  // A seed that newly binds the encoder schedules that owner's sweeps; `workloads` exists only far below, so the
  // holder is late-bound like `enqueueEmbedReindex` and derefs at call time (a mint, never during compose).
  let enqueueOwnerEmbedIndex: (ownerId: UserId) => void = () => undefined;
  const seedUserConnections = createLocalLightUserSeed({ db, now, onEmbedSpaceBound: (ownerId) => enqueueOwnerEmbedIndex(ownerId) });
  const sessions = createSessionsService({ db, now, sessionSecret: deps.sessionSecret, seedUserConnections });
  // A connection/binding write that changes an owner's embed or imageEmbed SPACE
  // must enqueue the purge+reindex. `workloads` is built far below (the search-discovery seam), so this holder
  // is late-bound after it exists; the connection ctx derefs it at request time (a pane write), never during
  // boot. Until then it is an inert no-op.
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
    materializeBackground,
    newBackgroundEntryId: () => randomUUID(),
    versionIdentity,
    // The manual update check's one GET. Wired here (never imported by the domain) so the egress belt stays
    // on this side of the tier line, exactly like `materializeBackground` above it.
    probeUpstreamHead: createProbeUpstreamHead({ localVersion: () => versionIdentity().version }),
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
  // floor⊕override config before the runtime reads it, then PUBLISH the F12 private-endpoint allowlist onto
  // the egress guard — the second input every `auth: endpoint` dial is judged against (deployment-wide, no
  // principal). Re-published on every reload so an admin's Governance edit reaches the next dial.
  const effectiveConfig = createEffectiveConfigWiring(settings);
  await effectiveConfig.reload();
  const resolved = effectiveConfig.getEffectiveConfig();
  publishPrivateEndpointAllowlist(resolved.privateEndpointAllowlist);

  // Built before the runtime so the hosted image arms get the real GIF→first-frame-PNG wire-normalize
  // transform (MA-6) — the sharp adapter, wrapped inside the package so it never leaks in.
  const imageAdapter = createImageAdapter();
  // TASK-24: wire the provider wire-capture sink ONLY when capture is enabled (env or the force flag). When
  // off, no sink is injected → the send boundaries never record → zero cost, zero retained bytes, prod-safe.
  const wireCaptureOn = deps.wireCapture === true || isWireCaptureEnabled();
  const wireReplyCaptureOn = wireCaptureOn && (deps.wireCaptureReply === true || isWireReplyCaptureEnabled());
  const secretBox = createSecretBox(deps.secretBoxKey);
  const cas = createCas(deps.casDir);
  const variants = createVariantCache(deps.variantDir);
  const extractText = createExtractText();
  const passwordHasher = createPasswordHasher(deps.sessionSecret);
  const userRuntimeDirs = createUserRuntimeDirs(env.USER_RUNTIME_DIR);

  // The four persistence ports the runtime reads THROUGH (never `@orb/db` itself): connections, bindings,
  // provider rows and the catalog-snapshot KV — all wired by `domain/connection`'s persistence, which stays
  // the ONE writer of its three tables (§5.3b producer ownership).
  const ports = createConnectionPorts({ db, now });

  // The credentials domain composes BEFORE the runtime: the runtime resolves a connection's sealed secret
  // through it (`resolveCredential` by credentialId — `loadActiveCredential` is gone, §5.3), and reports a
  // derive-task auth failure back to it (#1800). `findProvider` is bound to the runtime's registry through a
  // late-bound holder because the registry exists only once the runtime does — a genuine construction cycle,
  // closed one line after `createInferenceRuntime` returns.
  let runtimeHolder: InferenceRuntime | null = null;
  const runtimeRef = (): InferenceRuntime => {
    if (runtimeHolder === null) {
      throw new Error("compose: inference runtime derefed before it was built");
    }
    return runtimeHolder;
  };
  const credentials = createCredentialsService({
    db,
    now,
    newCredentialId: minter(ID_PREFIX.userCredential),
    box: secretBox,
    findProvider: (providerId, viewer) => runtimeRef().providers.registry.get(providerId, viewer),
    audit,
    emitUserEvent: publishUserEvent,
  });

  const claudeExecutable = resolveClaudeExecutable();
  const runtime = await createInferenceRuntime({
    ...(deps.providerSeams ?? {}),
    now,
    log: getLog(),
    span: (name, fn, attrs) => span(name, () => fn(), attrs),
    superviseDetached: (name, attrs, operation) => superviseDetached(`inference:${randomUUID()}`, name, attrs, operation),
    addSpanEvent,
    securityEvent: (kind, fields) => securityEvent(kind, { ...fields }),
    env: {
      // "The bundled `claude` runtime resolves" IS the agent-sdk wire's registration (§8.4-1); a box without
      // it reads `runtime-missing` on every `claude-sub` row and builds no backend.
      ...(claudeExecutable !== null ? { claudeExecutable } : {}),
      hostEnvAllowlist: (): Readonly<Record<string, string>> =>
        Object.fromEntries(Object.entries(processEnvSnapshot()).flatMap(([k, v]) => (v === undefined ? [] : [[k, v] as const]))),
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
    // A thunk: an admin flip governs the next structured call (D126).
    structuredOutputVehicle: () => effectiveConfig.getEffectiveConfig().structuredOutputVehicle,
    // The sink stamps `at` from the injected clock (no-raw-clock) and forwards to the process ring.
    ...(wireCaptureOn ? { captureWire: (entry): void => recordWireCapture({ ...entry, at: now() }) } : {}),
    // The reply tap lives at the SEND BOUNDARY (it owns the 64 KiB cap and the by-value scrub); compose only
    // carries the verdict. A second opt-in on purpose — see the recorder's header.
    captureWireReply: wireReplyCaptureOn,
    imageToPng: (bytes) => imageAdapter.transform(bytes, { format: "png" }),
    agentSdk: {
      // LIVE getter (per request) so an admin retune applies WITHOUT a restart (Q6 / item 7).
      summarizeConcurrency: () => effectiveConfig.getEffectiveConfig().agentSdkConcurrency.summarize,
      // D8 `session_entries` write path (issue #71) — the sealed backend never touches @orb/db itself.
      sessionWriter: createSessionEntryWriter(db),
      ...(deps.providerSeams?.agentSdk ?? {}),
    },
    userRuntimeDir: (ownerId, tool) => userRuntimeDirs.dirFor(ownerId, tool),
    embedSpace: { dims: EMBED_SPACE_DIMS },
    // THE PROVIDER TRANSPORT, read from the ambient api HERE and nowhere else (reviewed grant
    // `no-raw-egress:entry-compose-transport`): the root reads the platform's `fetch` once so every tier
    // below receives it INJECTED rather than reaching for the global — the `no-raw-clock:entry-lifecycle`
    // shape, where a root that cannot read the ambient api cannot mint the one it injects.
    // THE SSRF BELT IS NOT THIS REFERENCE. Provider egress is backstopped by the boot-installed global
    // undici dispatcher (`infra/network/egress.ts` `installEgressFirewall` → `setGlobalDispatcher`, wired at
    // `entry/lifecycle.ts`, with `EGRESS_FIREWALL` defaulting on), whose DNS-lookup override closes the
    // rebinding TOCTOU. A user-influenced URL never rides this transport at all: it goes through `safeFetch`,
    // which runs its own resolve→validate→pin independent of that toggle.
    sdkFetch: deps.providerSeams?.sdkFetch ?? globalThis.fetch,
    localLight: {
      // ABSOLUTE on purpose: transformers.js hands `env.cacheDir` straight to its FileCache, which path.joins
      // it per file and lets node's fs resolve the rest — so a cwd-relative value would follow whatever cwd
      // the process happens to have rather than the data root this knob names.
      cacheDir: resolve(env.LOCAL_LIGHT_CACHE_DIR),
      embedDtype: env.LOCAL_LIGHT_EMBED_DTYPE,
      ...(deps.providerSeams?.localLight ?? {}),
    },
  });
  runtimeHolder = runtime;
  const executor = runtime.executor;

  // The funder's REAL principal by userId (D135 clause G — READ off `users.role` through the one row→Principal
  // home, never stamped). The binder every seam receives: the runtime's per-funder fold over
  // `connection_bindings` (§7.1) under that user's own Principal.
  const resolveFunderPrincipal = createHostPrincipalResolver(sessions);
  const roleClientsFor = async (funderUserId: UserId): Promise<RoleClientsWithSignal> => runtime.roleClientsFor(await resolveFunderPrincipal(funderUserId));
  const executeEmbed = (
    encoderConnection: Resolved<"embed">,
    input: string | readonly string[],
    opts?: Parameters<EmbeddingConnectionSnapshot["embed"]>[1],
  ): Promise<EmbedResult> => {
    if (encoderConnection.capability.kind !== "embedding") {
      throw new Error("text embed connection has a non-embedding capability");
    }
    const knobs = runtime.funnel.embed(opts ?? {}, encoderConnection.capability.embedding);
    return runtime.executor.embed({
      connection: encoderConnection,
      input,
      ...(knobs.dimensions === undefined ? {} : { dimensions: knobs.dimensions }),
      ...(knobs.truncateTo === undefined ? {} : { truncateTo: knobs.truncateTo }),
      ...(knobs.inputType === undefined ? {} : { inputType: knobs.inputType }),
      ...(knobs.instruction === undefined ? {} : { instruction: knobs.instruction }),
    });
  };
  const isResolvedTask = <T extends Resolved["task"]>(candidate: Resolved, task: T): candidate is Resolved<T> => candidate.task === task;
  const snapshotOf = (generationConnection: Resolved): EmbeddingConnectionSnapshot => ({
    connectionId: generationConnection.connectionId,
    providerId: generationConnection.providerId,
    model: generationConnection.model,
    capability: generationConnection.capability,
    api: generationConnection.api ?? "none",
    wire: generationConnection.wire,
    baseUrl: generationConnection.baseUrl,
    features: generationConnection.features,
    extras: generationConnection.extras,
    transport: generationConnection.transport,
    embed: (input, opts): ReturnType<EmbeddingConnectionSnapshot["embed"]> => {
      if (!isResolvedTask(generationConnection, "embed") || generationConnection.capability.kind !== "embedding") {
        throw new Error("generation is not a text embed connection");
      }
      return executeEmbed(generationConnection, input, opts);
    },
    imageEmbed: (input): ReturnType<EmbeddingConnectionSnapshot["imageEmbed"]> => {
      if (!isResolvedTask(generationConnection, "imageEmbed")) {
        throw new Error("generation is not an image embed connection");
      }
      return runtime.executor.imageEmbed({ connection: generationConnection, input });
    },
  });
  const resolveEmbeddingConnection: import("#domain/embeddings").ResolveEmbeddingConnection = async (ownerId, task, connectionId) => {
    const principal = await resolveFunderPrincipal(ownerId);
    let outcome: Awaited<ReturnType<typeof runtime.resolve>>;
    try {
      outcome = await runtime.resolve({ task, principal, ...(connectionId === undefined ? {} : { connectionId }) });
    } catch (error) {
      if (connectionId === undefined) {
        throw error;
      }
      return null;
    }
    return snapshotOf(outcome.resolved);
  };

  // The connection domain — selection's thin front door over the runtime (§3.3). The four ownership /
  // admission reads it needs are wired here rather than derived inside the domain: a credential row is the
  // credentials domain's, a rule row automation's, a plugin row plugin's, and the allowlist verdict lives on
  // the egress guard. Owner-scoped reads by construction (the id AND the owner are the predicate).
  const connectionCtx: ConnectionContext = {
    db,
    now,
    newConnectionId: minter(ID_PREFIX.userConnection),
    newBindingId: minter(ID_PREFIX.connectionBinding),
    runtime,
    audit,
    credentialOwned: async (ownerId, credentialId) => (await fetchOwned(db, userCredentials, credentialId, ownerId)) !== undefined,
    ruleOwnedBy: async (ruleId, userId) => (await fetchOwned(db, automationRules, ruleId, userId)) !== undefined,
    pluginOwnedBy: async (pluginId, userId) => (await fetchOwned(db, plugins, pluginId, userId)) !== undefined,
    endpointAdmission,
    recordProbeOutcome: credentials.recordProbeOutcome,
    // The late-bound holder above, derefed at request time.
    onEmbedSpaceChanged: () => enqueueEmbedReindex(),
    emitUserEvent: publishUserEvent,
  };
  const connection = createConnectionService(connectionCtx);

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
    roleClientsFor,
    materializeBackground,
    maxImageBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    imageVariantQuality: () => effectiveConfig.getEffectiveConfig().imageVariantQuality,
    settings,
    newBackgroundEntryId: settingsDeps.newBackgroundEntryId,
    getPreset: () => preset,
    getPersona: () => persona,
    resolveUserPresetParams,
  });
  const { assets, character, galleryCtx, characterSeeder, personaSeeder, backgroundSeeder } = assetsCharacter;
  // Now that `assets` exists, rebind the real materializeBackground op (the holder above forwards to it).
  materializeBackgroundOp = assetsCharacter.materializeBackgroundOp;

  // ── the derived-data cluster + persona/preset/stats/search/discovery/notifications/workloads (the
  // search-discovery seam). Produces `persona` + `preset` (forward-referenced above) and `workloads` +
  // `enqueueEmbedReindex` (bound onto the keystone's late-bound holder below).
  const searchDiscovery = buildSearchDiscovery({
    db,
    now,
    audit,
    roleClientsFor,
    resolveEmbeddingConnection,
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
  // Bind the embed-model-change → bulk purge+reindex enqueue now that `workloads` exists.
  enqueueEmbedReindex = searchDiscovery.enqueueEmbedReindex;

  // ── the refinery seam (R1) — the card-refinery pipeline over the summarize rung. Needs `character`
  // (the four injected ops) + the caller-scoped preset/prose resolvers; nothing composes on top of it.
  const { refinery, refineryWorkloads } = buildRefinery({
    db,
    now,
    roleClientsFor,
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
    db,
    now,
    connection,
    executor,
    assets,
    character,
    roleClientsFor,
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
  // The PLUGIN-MACRO registry — ONE process-wide instance, minted HERE rather than
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
    roleClientsFor,
    connection,
    maybeRevokeOnAuthFailed: credentials.maybeRevokeOnAuthFailed,
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
      storeGenerated: async (ownerId, bytes, mime) =>
        assets.store({
          principal: await resolveHostPrincipal(ownerId),
          bytes,
          kind: "generated",
          mime,
          enforceMagic: true,
          maxBytes: effectiveConfig.getEffectiveConfig().maxImageBytes,
        }),
      maxBytes: () => effectiveConfig.getEffectiveConfig().maxImageBytes,
    }),
    embeddings,
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    authMode: env.AUTH_MODE,
    signup: {
      signupUserStatement: sessions.signupUserStatement,
      minterMayMintSignup: createSignupMinterCheck(sessions, resolveHostPrincipal),
    },
    runChatTurn: executor.runChatTurn,
    // The Anthropic prompt-cache depth FLOOR, read PER TURN off the resolved AppSettings tier (Settings ›
    // Admin › System tuning). A thunk for the same reason `structuredOutputShape` below is one: an admin flip
    // must govern the next turn with no restart.
    promptCacheMinDepth: () => effectiveConfig.getEffectiveConfig().promptCacheMinDepth,
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    generatePicture: imagery.generatePicture,
    // The `{{databank}}` slot's in-turn retrieval, with the SAME space-refusal degrade the digest op carries
    // (#2510 — `retrieval-degrade.ts` states the boundary). This arm is the one that was actually killing
    // turns: `search.documents` runs once per turn whether or not the room has documents, so an owner whose
    // vector space was mid-move could not send a message at all. `null` is databank's own ruled empty — the
    // byte-identical no-op an absent op produces — so a degraded gather assembles exactly like a bankless one.
    gatherDatabank: (args, events) =>
      withRetrievalDegrade(async () => await databank.gatherRetrieval(args), { empty: null, onIndexUnavailable: events?.onIndexUnavailable }),
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
    importReportsDir: env.DATA_LAYOUT.reports,
  });

  // THE COVERED SET of a vector sweep, from its ENUMERATION SCOPE (#2517): `null` is the bulk arm, whose
  // covered set is exactly `listCorpusOwners()`; a `UserId` is a per-owner catch-up, whose covered set is
  // that one owner. Deriving it HERE rather than fencing the CALL is what lets a singular pass record its
  // own `embed_space_state` completion — a true statement about the scope it actually swept — without ever
  // reaching a neighbour's live space.
  const sweptOwners = async (enumerationScope: UserId | null): Promise<readonly UserId[]> =>
    enumerationScope === null ? await searchDiscovery.listCorpusOwners() : [enumerationScope];

  // The memory receipt for an owner the sweep covered but produced no space for. Only completable when
  // memory is OFF for them: they have no memory vectors, so the scope is vacuously in the target space. An
  // ENABLED owner with no receipt was not swept and gets none.
  const vacuousMemoryReceipt = async (ownerId: UserId): Promise<MemoryEmbedSpace | null> => {
    if (await chatCompose.isMemoryEnabled(ownerId)) {
      return null;
    }
    const generation = await embeddings.resolveGeneration(ownerId, "embed");
    return generation === null ? null : { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
  };

  // One owner's embed space changed outside the binding verb (a seed): enqueue that owner's cards, documents and
  // memory sweeps, so each scope lands in the new target and search reads it. A memory-off owner's memory sweep
  // is refused at admission and would derive nothing, so its vacuous receipt is recorded directly instead.
  // Fire-and-forget under the supervised-detach boundary, like `enqueueEmbedReindex`: a duplicate or failed
  // enqueue is logged and never fails the seed.
  enqueueOwnerEmbedIndex = (ownerId: UserId): void => {
    // With the autoindex off nothing embeds in the background, so no target is pinned and search reads the live
    // space without a migration to wait on.
    if (!resolved.corpusAutoindex) {
      return;
    }
    const at = now();
    superviseDetached(`owner-embed-index:index:${ownerId}:${String(at)}`, OWNER_EMBED_INDEX_SPAN, { workloadKind: "index" }, () =>
      workloads.start({ input: { kind: "index", params: { source: "all" } }, caller: null, mode: "singular", ownerId }),
    );
    superviseDetached(`owner-embed-index:databank:${ownerId}:${String(at)}`, OWNER_EMBED_INDEX_SPAN, { workloadKind: "databank-reindex" }, () =>
      workloads.start({
        input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
        caller: null,
        mode: "singular",
        ownerId,
      }),
    );
    superviseDetached(`owner-embed-index:memory:${ownerId}:${String(at)}`, OWNER_EMBED_INDEX_SPAN, { workloadKind: "memory-backfill" }, async () => {
      const vacuous = await vacuousMemoryReceipt(ownerId);
      if (vacuous === null) {
        await workloads.start({ input: { kind: "memory-backfill", params: {} }, caller: null, mode: "singular", ownerId });
        return;
      }
      await embeddings.purgeMemoryVectors({
        ownerId,
        generation: { id: vacuous.generationId, task: "embed", via: "embed", epoch: vacuous.generationEpoch, space: vacuous.model },
      });
    });
  };

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
    // The completion + old-space reclaim is PER OWNER (vector tasks are owner-scoped, §7.5) — one receipt
    // per owner in the swept set (`sweptOwners` above), the row counts advisory.
    beginDocumentVectorSweep: async (enumerationScope) => {
      const receipts: { ownerId: UserId; generation: GenerationReceipt }[] = [];
      for (const ownerId of await sweptOwners(enumerationScope)) {
        const generation = await embeddings.resolveGeneration(ownerId, "embed");
        if (generation !== null) {
          receipts.push({ ownerId, generation });
        }
      }
      return receipts;
    },
    purgeDocumentVectors: async (receipts): Promise<void> => {
      for (const receipt of receipts) {
        await embeddings.purgeDocumentVectors(receipt);
      }
    },
    backfillMemory: (args) => chatCompose.backfill.memory(args),
    // The #156 admission gate's read — one hop to the ONE memory-config merge, never a second settings read.
    isMemoryEnabled: chatCompose.isMemoryEnabled,
    backfillGroupCharacters: (args) => chatCompose.backfill.groupCharacters(args),
    // Same enumeration rule as `beginDocumentVectorSweep` above — one `sweptOwners` set, two consumers.
    purgeMemoryVectors: async (spaces, enumerationScope): Promise<void> => {
      const completed = new Map(spaces.map((space) => [space.ownerId, space]));
      for (const ownerId of await sweptOwners(enumerationScope)) {
        const receipt = completed.get(ownerId) ?? (await vacuousMemoryReceipt(ownerId));
        if (receipt === null) {
          continue;
        }
        await embeddings.purgeMemoryVectors({
          ownerId,
          generation: { id: receipt.generationId, task: "embed", via: "embed", epoch: receipt.generationEpoch, space: receipt.model },
        });
      }
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
    share: createShareService({
      relay: deps.share.relay,
      requireOwner,
      authMode: env.AUTH_MODE,
      inContainer: bindPostureInput().inContainer,
      ownerNeedsPassword: () => sessions.ownerNeedsPassword(),
      localSetupUrl: deps.share.localSetupUrl,
      publicAddresses: publicAddresses(env.AUTH_MODE, allowedHostsInput()),
      liveSocketCount: (userId) => sockets.liveSocketCount(userId),
      audit,
      now,
    }),
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
    // The curated room plate, resolved into the RECEIVING user's own owned asset (the card pack's twin).
    resolveSeededBackground: backgroundSeeder.resolvePlate,
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
    runtime,
    roleClientsFor,
    audit,
    effectiveConfig,
    secretBox,
    characterSeeder,
    personaSeeder,
    demoChatSeeder,
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
    enqueueOwnerEmbedIndex: (ownerId) => enqueueOwnerEmbedIndex(ownerId),
    wireCaptureOn,
  };
}
