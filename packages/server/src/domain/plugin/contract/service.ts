// domain/plugin/contract/service — the typed API surface: the infra seam TYPE the domain declares for the
// sandbox runtime (`PluginHostPort` — `domain/plugin` never imports `#infra/plugin-host`; the runtime is wired
// upward at compose), the resident-instance registry the lifecycle owns, the DI bundle (`PluginContext`), and
// the `PluginService` (7 verbs incl. the inline `runSnippet`). Every cross-tier value is a declared type here; the
// runtime is assembled at the composition root (one-directional flow: transport → domain/plugin →
// infra/plugin-host → nothing).

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { AssetId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { PluginBelts, PluginHostOps, PluginRegistrationHandle, SnippetGate } from "./ops.ts";
import type {
  ApplyDistributedPluginsParams,
  GetPluginLogParams,
  InstallForAllUsersParams,
  InstallPluginParams,
  ListDistributedPluginsParams,
  ListPluginsParams,
  RunSnippetParams,
  SetPluginEnabledParams,
  SetPluginGrantParams,
  UninstallForAllUsersParams,
  UninstallPluginParams,
  UpgradePluginParams,
} from "./params.ts";
import type { DistributedPluginApplication, DistributedPluginView, PluginFanoutResult, PluginLogView, PluginView, SnippetResult } from "./results.ts";

/** The caller's leak-free chat authority for the snippet gate: `canRead` admits the chat at all,
 *  `canWrite` unlocks the write half of the fixed profile (host authority). An unknown/foreign chat resolves
 *  to `{false,false}` — indistinguishable from a no-access chat (the loadPresentRole compose-gate semantics),
 *  so a snippet against a chat the caller cannot see is refused NOT_FOUND, never given an existence oracle. */
interface ChatAuthority {
  readonly canRead: boolean;
  readonly canWrite: boolean;
}

/** Per-instance DoS budget (structural twin of `infra/plugin-host`'s `SandboxLimits` — the domain never imports
 *  `#infra`; the port defaults these from `budgets.ts` when omitted). A snippet passes the wider wall. */
export interface PluginBudgets {
  readonly cpuDeadlineMs: number;
  readonly memoryLimitBytes: number;
}

/** The input to `createInstance`: the guest source + the confirmed grants + the authority-agnostic
 *  membrane BRIDGE the domain built (per-installer: `substrate/bridge.ts` closes global-vars over the installer
 *  and passes chat ops through) + the activation-run chat scope + the optional budget override. The domain
 *  gated the invocation-chat-context (`can(installer,"read",chat)`) + folded host-authority into `grants` /
 *  `chat.canWrite` BEFORE this call — infra is authority-blind (a plugin can never exceed its installer).
 *  `chat` is `null` for an installed plugin's registration-only `main.js`; set for a snippet run. Constructed
 *  ONCE at the trust boundary, never guest-supplied. */
export interface CreateInstanceInput {
  readonly mainJs: string;
  readonly grants: readonly PluginCapability[];
  readonly bridge: PluginBridge;
  readonly chat: InvocationChat | null;
  /** The manifest's declared `net.fetch` allowlist — plain-string DATA forwarded from the RE-VALIDATED manifest
   *  (never guest-runtime-supplied, never `ANY_HOST`). The infra `net.fetch` host-fn pins `safeFetch` to this
   *  list (the SSRF wall); omitted/absent ⇒ `[]` fail-closed (no host reachable). */
  readonly netHosts?: readonly string[];
  readonly budgets?: PluginBudgets;
}

/** The outcome of an activation run: a healthy resident instance, OR a contained activation failure
 *  (a `main.js` throw, an unserved `orb.host(2)`, a budget blow) surfaced as data — NEVER a partial activation
 *  (registrations from a failed run are discarded). `log` carries the activation-run host.log lines (the
 *  `last_error` context + the log ring's first fill). */
export type CreateInstanceOutcome =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogView[] };

/** The infra seam the sandbox runtime implements (`infra/plugin-host`'s front door). `domain/plugin`
 *  DRIVES it; the port never sees a DB row. TYPED here; the createInstance/invoke bodies (host-fn wiring
 *  over the `Sandbox`) live in infra. */
export interface PluginHostPort {
  /** Boot a guest instance, install the realm, run `main.js` under the invocation budget, collect its
   *  registrations. Activation failure is contained → `ok:false` (the host process is never fatal). */
  readonly createInstance: (input: CreateInstanceInput) => Promise<CreateInstanceOutcome>;
  /** Invoke a collected guest handler (a tool/transform/event callback) with JSON-encoded args under the
   *  per-invocation budget. `chat` sets the handler's invocation-chat scope (a resident tool runs in the
   *  chat it was called from — the domain resolves read/host authority before threading it; `null` = no scope). */
  readonly invoke: (instance: PluginInstance, handler: PluginHandlerRef, argsJson: string, chat: InvocationChat | null) => Promise<string>;
  /** Run an inline snippet: a FRESH transient instance, run once as the caller under the 5 s wall, then
   *  disposed — no residency. The fixed capability profile + the admitted chat scope are the domain's; the port
   *  returns the drained log + a contained `error` (a snippet crash is data, never a resident-crash counter). */
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
  }) => Promise<SnippetResult>;
  /** A non-destructive snapshot of the instance's RUNTIME host.log ring: the activation drain plus every later
   *  invocation's, oldest-first, bounded and evicted from the front by the port. IN-MEMORY and per resident
   *  instance (`ASSUMES(single-replica)`) — a restart or a deactivate→activate cycle resets it. It is a recent-
   *  activity view for the owner, NOT an audit log of record: derive nothing security-load-bearing from what it
   *  contains or from what it is missing. */
  readonly readLog: (instance: PluginInstance) => readonly PluginLogView[];
  /** Tear down the instance (disposes the guest context + all realm handles). Idempotent-safe. */
  readonly dispose: (instance: PluginInstance) => void;
}

/** What activation needs off the row (owner is `caller`) — never the whole DB row (the port never sees one).
 *  Homed here (not `activation/activate.ts`) so the verb factories import the seam type from a type home. */
export interface ActivateInput {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly bundleAssetId: AssetId;
  readonly grants: readonly PluginCapability[];
  /** The declared `netHosts` this activation must WITHHOLD from the egress wall — the destinations the owner
   *  has not answered for (a standing re-consent). Activation subtracts them from the re-validated manifest's
   *  list (`consentedNetHosts`), so the wall can only ever be NARROWER than the manifest and never wider: the
   *  allowlist is still DERIVED from the validated bundle, never caller-supplied. `[]` = nothing withheld.
   *  Required, not optional, on purpose — a new activation site must state its consent fact rather than
   *  inherit full reach by forgetting a field. */
  readonly withheldNetHosts: readonly string[];
}

/** Activation result — success (resident + enabled), or a contained failure whose detail is on the errored row. */
export type ActivateOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** The activation factories the lifecycle verbs (upgrade/setEnabled/uninstall) drive — built once per service
 *  over the shared registry and injected (the imagery verb-to-verb dep pattern). */
export interface ActivationDeps {
  readonly activate: (input: ActivateInput) => Promise<ActivateOutcome>;
  readonly deactivate: (pluginId: PluginId) => void;
}

/** The crash-policy surface the invocation loop drives (auto-disable posture). Homed here (not
 *  `activation/crash-policy.ts`) so the `activate` factory imports the seam type from the domain's type home —
 *  the factory `createCrashPolicy` stays in activation/, this is only its shape. */
export interface CrashPolicy {
  /** Record one guest-invocation crash: bump the counter + the detail; at the threshold auto-disable +
   *  deactivate + notify the installing OWNER (`recipientUserId` — the `plugin-disabled` NotificationEvent,
   *  ids-only, deep-links the owner's plugin surface). Returns whether the plugin was disabled + the new count. */
  readonly recordCrash: (args: {
    readonly pluginId: PluginId;
    readonly recipientUserId: UserId;
    readonly error: string;
  }) => Promise<{ readonly disabled: boolean; readonly count: number }>;
  /** A clean invocation resets the consecutive-crash counter. */
  readonly recordCleanRun: (pluginId: PluginId) => Promise<void>;
}

/** One resident enabled plugin: its live instance + the registrar handles (`deactivate`/`uninstall`
 *  `unregister`s each — no ghost registrations). */
interface ResidentPlugin {
  readonly instance: PluginInstance;
  readonly handles: readonly PluginRegistrationHandle[];
}

/** The in-process resident-instance registry the lifecycle owns (`ASSUMES(single-replica)` — the enabled-index
 *  precedent). Created once per service; enable adds, disable/uninstall unregisters + disposes + removes. */
export type PluginRegistry = Map<PluginId, ResidentPlugin>;

/** The in-memory UI-surface STATE plane (`host.ui.setState` writes; `plugin.getSurfaceState` reads —
 *  plugin-ui-plane #679 U1). Minted ONCE per service at compose (the resident-registry / suggestion-store
 *  precedent), `ASSUMES(single-replica)`, respawn wipes. The FACTORY (`createPluginSurfaceStateStore`) lives in
 *  `substrate/surface-state.ts` (the SnippetGate/NotifyFloor convention: seam TYPE in contract, factory in
 *  substrate). Keyed by pluginId + surfaceId; cleared per-plugin on deactivate. */
export interface PluginSurfaceStateStore {
  /** Replace the whole state for one surface. THROWS over the 16 KiB serialized cap (a rejected guest promise
   *  upstream) rather than storing a truncated object the renderer would bind by path. */
  readonly set: (pluginId: PluginId, surfaceId: string, state: Record<string, unknown>) => void;
  /** The surface's published state, or `null` when nothing has been published (the renderer binds `null` to
   *  each node's fallback). */
  readonly get: (pluginId: PluginId, surfaceId: string) => Record<string, unknown> | null;
  /** Drop every surface's state for one plugin — the deactivate/uninstall sweep (no ghost state). */
  readonly clearForPlugin: (pluginId: PluginId) => void;
}

/** The injected-op bundle every plugin verb closes over, assembled at the composition root. */
export interface PluginContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPluginId: () => PluginId;
  // NO `can` SEAM, and that is the design (D147). A plugin is USER-SCOPED: anyone installs for themselves,
  // every management verb loads its row through the owner-scoped `getById(db, caller.userId, pluginId)`, and
  // that load IS the whole authority decision. There is no global-role factor to consult, so injecting the
  // `can()` kernel here would be a seam nothing asks — and a tempting one to answer WRONG, because the
  // obvious "admins may manage any row" branch would run one user's untrusted guest bundle under another
  // user's identity (the bridge and the PL-C ceiling both close over the ENABLING caller). The admin-gated
  // SERVER-WIDE install is a separate, unbuilt shape (D147); it does not reuse these verbs.
  /** The per-user CAS ops the bundle bytes ride: `store` (kind fixed `"plugin"`), the owner-gated `readBytes`
   *  (activation re-reads + re-parses — "re-validated on load"), and `reapOrphans` (uninstall reaps the bundle
   *  asset AFTER the row's FK reference is deleted — the RESTRICT/`reapIfOrphan` posture). */
  readonly assets: {
    readonly store: (caller: Principal, bytes: Uint8Array, mime: string) => Promise<StoredAsset>;
    readonly readBytes: (caller: Principal, assetId: AssetId) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;
    readonly reapOrphans: (assetIds: readonly AssetId[]) => Promise<void>;
  };
  readonly host: PluginHostPort;
  readonly ops: PluginHostOps;
  /** The UI-surface state plane (plugin-ui-plane #679 U1) — the read verb (`getSurfaceState`) reads it and
   *  deactivate/uninstall clears it. Written by the compose-side `ops.ui.setState` (the same store instance,
   *  shared by construction). Minted ONCE at compose (`createPluginSurfaceStateStore`). */
  readonly surfaceState: PluginSurfaceStateStore;
  /** The snippet gate: resolve the caller's leak-free read/host authority for a chat. Caller-in-params
   *  (the injected-op-caller-gate rule); a foreign/unknown chat yields `{false,false}` — no existence oracle.
   *  Injected at compose (the domain never imports chat) — `loadPresentRole` under the caller. */
  readonly resolveChatAuthority: (caller: Principal, chatId: ChatId) => Promise<ChatAuthority>;
  /** The process-wide capability BELTS every bridge closes over — the `notify` 60 s per-(plugin, chat)
   *  cooldown (02 §2), the `net.fetch` hourly egress ceiling, and the `llm.quiet` hourly generation ceiling.
   *  All are process-wide state, so all are minted ONCE at compose and shared by every activation, exactly
   *  like the resident registry; the bridge claims the relevant one before each guarded op. Bundled because
   *  three positional floors is where a seam stops being readable. */
  readonly belts: PluginBelts;
  /** The per-user concurrent-snippet ceiling — process-wide state, minted ONCE at compose
   *  (`createSnippetGate`) exactly like the notify floor. `runSnippet` claims a slot for the duration of the run.
   *  It is the ONLY belt on the member-reachable path that speaks in CONCURRENCY; the transport bucket speaks in
   *  requests-per-minute and cannot bound how many contexts one member pins at once. */
  readonly snippetGate: SnippetGate;
}

/** The deps the SERVER-WIDE DISTRIBUTION verbs close over — a SEPARATE bundle from {@link PluginContext},
 *  and that separation is the whole point (D147 clause (a)).
 *
 *  The per-row management verbs still have no `can` seam and must never grow one: their authority question is
 *  "is this row yours", the owner-scoped load answers it, and an "admins may manage any row" branch would run
 *  one user's untrusted guest bundle under another user's identity. Distribution asks a DIFFERENT question —
 *  "may this caller publish to the deployment" — which is a global-role question and has no per-row answer.
 *  So the gate arrives here, scoped to the two verbs that need it, instead of widening the context every verb
 *  shares. `requireAdmin` (not the general `can`) is what gets injected for the same reason: the narrowest
 *  seam that answers the one question.
 *
 *  WHY THE ADMIN VERB IS SAFE WHERE AN ADMIN ANY-ROW BRANCH IS NOT: publishing only MINTS disabled,
 *  zero-grant, consent-pending rows. It runs no guest code, spends no credential, and never touches an
 *  existing row's consent or status — the recipient's own enable is still the only act that executes
 *  anything, and it still runs as them. */
export interface PluginDistributionDeps {
  /** The global-admin gate (`domain/admin`'s `requireAdmin` — `can(caller,"admin",{kind:"global"})`), injected
   *  at compose because a domain may not sideways-import another. THROWS `DomainForbiddenError` on a
   *  non-admin, which is the right shape here and not a leak: the distribution set is deployment policy, not
   *  an owned entity, so there is no existence to oracle (the `admin.*` router posture). */
  readonly requireAdmin: (caller: Principal) => void;
  /** Every user a fan-out reaches, as a resolved `Principal` — minted at the ENTRY seam (only entry mints a
   *  Principal, the constitution) through the same row→Principal resolver the frozen-host bridge uses, so a
   *  recipient's role/enabled state is a ROW READ and never invented. Scoped to HUMAN accounts at compose: an
   *  agent row is not a person who can consent, and consent is the whole posture a distributed copy lands in.
   *
   *  It takes the ACTING admin because the enumeration itself is an admin read (`admin.listUsers`, which
   *  re-gates) — the recipient list is never obtained on nobody's authority. */
  readonly listRecipients: (caller: Principal) => Promise<readonly Principal[]>;
  /** The PUBLISHED bundle's bytes by asset id. Deliberately NOT `ctx.assets.readBytes`: this read is
   *  cross-owner by construction (the bytes belong to the publishing admin; the recipient is someone else),
   *  and it is legitimate for exactly one reason — the id never comes from a caller, it comes from the
   *  distribution record an admin wrote. The recipient's own install then stores its OWN CAS copy (D21: no
   *  shared bytes), so nothing cross-owner survives the call. */
  readonly readPublishedBundle: (assetId: AssetId) => Promise<Uint8Array>;
}

/** The two REAL per-user verbs a fan-out drives, passed as functions (the `ActivationDeps` verb-to-verb
 *  precedent) rather than the whole service, so the distribution path cannot reach a verb it has no business
 *  calling — notably `setEnabled`, which is the one act D147 clause (b) forbids performing for someone. */
export interface DistributionInstallDeps {
  readonly install: PluginService["install"];
  readonly setGrant: PluginService["setGrant"];
}

/** The plugin lifecycle surface, incl. `runSnippet` (the inline mode). */
export interface PluginService {
  /** Unzip+validate the bundle → grant ⊆ declared → store bytes in the CAS → `disabled` row. */
  readonly install: (params: InstallPluginParams) => Promise<PluginView>;
  /** Replace the bundle for an installed plugin (slug must match; downgrade refused; new caps ⇒ disabled). */
  readonly upgrade: (params: UpgradePluginParams) => Promise<PluginView>;
  /** RE-CONSENT: replace the confirmed capability subset (⊆ the PERSISTED manifest's declared set). The
   *  explicit act that lets an owner allow a newly-declared capability after an upgrade WITHOUT uninstalling.
   *  Never enables a disabled plugin; a resident instance is restarted so the running grants match the row. */
  readonly setGrant: (params: SetPluginGrantParams) => Promise<PluginView>;
  /** Activate (run `main.js`, register) or deactivate (dispose + deregister) — idempotent per target state. */
  readonly setEnabled: (params: SetPluginEnabledParams) => Promise<void>;
  /** Deactivate → delete the row (KV cascades) → reap the bundle asset. */
  readonly uninstall: (params: UninstallPluginParams) => Promise<void>;
  /** The caller's OWN installed plugins (fetchOwned), newest-installed first. */
  readonly list: (params: ListPluginsParams) => Promise<readonly PluginView[]>;
  /** ADMIN: publish a bundle to the deployment — record it, then fan out a real per-user install to every
   *  existing user (each disabled, zero-grant, consent-pending). Never enables anything for anyone. */
  readonly installForAllUsers: (params: InstallForAllUsersParams) => Promise<PluginFanoutResult>;
  /** ADMIN: withdraw a published plugin — drop the record, then fan out a real per-user uninstall, SKIPPING
   *  (and reporting) any recipient whose row diverged from the distributed version. */
  readonly uninstallForAllUsers: (params: UninstallForAllUsersParams) => Promise<PluginFanoutResult>;
  /** ADMIN: the published set. */
  readonly listDistributedPlugins: (params: ListDistributedPluginsParams) => Promise<readonly DistributedPluginView[]>;
  /** SELF: install every published plugin the caller does not already hold — the new-user half of the
   *  fan-out, driven once per user by the entry hook behind its onboarding latch. */
  readonly applyDistributedPlugins: (params: ApplyDistributedPluginsParams) => Promise<DistributedPluginApplication>;
  /** The host.log ring for an owned plugin — empty for a plugin with no resident instance. */
  readonly getLog: (params: GetPluginLogParams) => Promise<readonly PluginLogView[]>;
  /** The inline mode: run `code` once as the caller in `chatId` under the fixed capability profile ∩
   *  the caller's chat authority (read admits, host unlocks writes), disposed after. Refuses NOT_FOUND when the
   *  caller cannot read the chat (leak-free). */
  readonly runSnippet: (params: RunSnippetParams) => Promise<SnippetResult>;
}
