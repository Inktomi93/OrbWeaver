// domain/plugin/contract/service — the typed API surface: the infra seam TYPE the domain declares for the
// sandbox runtime (`PluginHostPort` — `domain/plugin` never imports `#infra/plugin-host`; the runtime is wired
// upward at compose), the resident-instance registry the lifecycle owns, the DI bundle (`PluginContext`), and
// the `PluginService` (7 verbs incl. the inline `runSnippet`). Every cross-tier value is a declared type here; the
// runtime is assembled at the composition root (one-directional flow: transport → domain/plugin →
// infra/plugin-host → nothing).

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type {
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginFrameBody,
  PluginHandlerRef,
  PluginInstance,
  PluginInvokeArgs,
  PluginManifest,
  PluginToastLevel,
  PluginUiOutcome,
} from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { AssetId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { PluginBelts, PluginHostOps, PluginIdentity, PluginInvokeHandler, PluginRegistrationHandle, SnippetGate, UiHostCallGate } from "./ops.ts";
import type {
  ApplyDistributedPluginsParams,
  CheckForUpdatesParams,
  GetFrameBodyParams,
  GetPluginLogParams,
  GetSurfaceStateParams,
  GetUiBundleParams,
  InstallForAllUsersParams,
  InstallFromUrlParams,
  InstallPluginParams,
  InvokeUiActionParams,
  InvokeUiCommandParams,
  ListBundleAssetsParams,
  ListCommandsParams,
  ListDisplayTransformsParams,
  ListDistributedPluginsParams,
  ListPluginsParams,
  ListSurfacesParams,
  PreviewFromUrlParams,
  ReportUiCrashParams,
  RunSnippetParams,
  SetPluginEnabledParams,
  SetPluginGrantParams,
  TransformForDisplayParams,
  UiHostCallParams,
  UninstallForAllUsersParams,
  UninstallPluginParams,
  UpgradeFromShowcaseParams,
  UpgradeFromStoredUrlParams,
  UpgradeFromUrlParams,
  UpgradePluginParams,
} from "./params.ts";
import type {
  DistributedPluginApplication,
  DistributedPluginView,
  PluginBundleAssetView,
  PluginCommandView,
  PluginDisplayTransformView,
  PluginFanoutResult,
  PluginLogView,
  PluginSurfaceState,
  PluginSurfaceView,
  PluginUpdateCheck,
  PluginView,
  SnippetResult,
} from "./results.ts";

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
  /** The tag the runtime stamps on every guest log line it mirrors into the CENTRAL log stream (the file log +
   *  `/api/_debug/logs`): the manifest slug, plain-string DATA forwarded from the RE-VALIDATED manifest exactly
   *  like `netHosts` (never guest-runtime-supplied). Absent ⇒ the runtime mirrors nothing (a snippet run). */
  readonly label?: string;
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
  readonly invoke: (instance: PluginInstance, handler: PluginHandlerRef, argsJson: PluginInvokeArgs, chat: InvocationChat | null) => Promise<string>;
  /** Run an inline snippet: a FRESH transient instance, run once as the caller under the 5 s wall, then
   *  disposed — no residency. The fixed capability profile + the admitted chat scope are the domain's; the port
   *  returns the drained log + a contained `error` (a snippet crash is data, never a resident-crash counter).
   *
   *  A RUN THAT NEVER STARTED IS A THROW, not a result: the port holds its own PROCESS-wide concurrent-snippet
   *  admission (a snippet mints the same 32 MiB guest context an activation does, and {@link SnippetGate} bounds
   *  one USER, not the process), and refuses over it with a CONFLICT-class error — retryable the moment a slot
   *  frees, exactly like the per-user ceiling. Every field of `SnippetResult` describes a run that DID happen,
   *  so a refusal has no honest spelling in it. */
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
  }) => Promise<SnippetResult>;
  /** A snapshot COPY of the instance's RUNTIME host.log ring: the activation drain, every later invocation's,
   *  AND whatever a floated continuation logged between invocations (picked up on this read — #806), oldest-
   *  first, bounded and evicted from the front by the port. IN-MEMORY and per resident instance
   *  (`ASSUMES(single-replica)`) — a restart or a deactivate→activate cycle resets it. It is a recent-activity
   *  view for the owner, NOT an audit log of record: derive nothing security-load-bearing from what it contains
   *  or from what it is missing. */
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
 *  `unregister`s each — no ghost registrations) + the crash-policy'd invoker. */
interface ResidentPlugin {
  readonly instance: PluginInstance;
  readonly handles: readonly PluginRegistrationHandle[];
  /** The per-plugin crash-counting invoker activation built (the SAME closure the registrars drive): a UI
   *  action re-enters the surface's `onAction` through THIS so a throwing handler bumps `consecutive_crashes`
   *  (3-strike auto-disable) exactly like a tool/transform/event handler does (plugin-ui-plane §4.4). */
  readonly invoke: PluginInvokeHandler;
}

/** The in-process resident-instance registry the lifecycle owns (`ASSUMES(single-replica)` — the enabled-index
 *  precedent). Created once per service; enable adds, disable/uninstall unregisters + disposes + removes. */
export type PluginRegistry = Map<PluginId, ResidentPlugin>;

/** The in-memory UI-surface STATE plane (`host.ui.setState` writes; `plugin.getSurfaceState` reads —
 *  plugin-ui-plane #679 U1). Minted ONCE per service at compose (the resident-registry / suggestion-store
 *  precedent), `ASSUMES(single-replica)`, respawn wipes. The FACTORY (`createPluginSurfaceStateStore`) lives in
 *  `substrate/surface-state.ts` (the SnippetGate/NotifyFloor convention: seam TYPE in contract, factory in
 *  substrate). Keyed by pluginId + surfaceId + the OPTIONAL chatId (row 777 — the room dimension); cleared
 *  per-plugin on deactivate.
 *
 *  THE `chatId` AXIS IS A KEY, NOT A FILTER. `null` and a chat id name DIFFERENT rows, and neither falls back
 *  to the other: a plugin that publishes room-wide and a plugin that publishes per-room are making different
 *  statements ("this is my latest reading" vs "this is this room's reading"), and silently serving the shared
 *  row to a room-scoped read would make the second statement a lie the moment a plugin did both. A read that
 *  finds nothing returns `null`, which the anchored fan-out already treats as "stay silent" (§4.9). */
export interface PluginSurfaceStateStore {
  /** Replace the whole state for one surface (`chatId: null` = the plugin-wide row). THROWS over the 16 KiB
   *  serialized cap (a rejected guest promise upstream) rather than storing a truncated object the renderer
   *  would bind by path, and THROWS over the per-plugin key cap (see the factory). */
  readonly set: (pluginId: PluginId, surfaceId: string, chatId: ChatId | null, state: Record<string, unknown>) => void;
  /** The surface's published state for that exact key, or `null` when nothing has been published (the renderer
   *  binds `null` to each node's fallback; the room fan-out renders nothing at all). */
  readonly get: (pluginId: PluginId, surfaceId: string, chatId: ChatId | null) => Record<string, unknown> | null;
  /** Drop every surface's state for one plugin, ACROSS EVERY ROOM — the deactivate/uninstall sweep (no ghost
   *  state; a per-room row is still that plugin's row). */
  readonly clearForPlugin: (pluginId: PluginId) => void;
}

/** The in-memory per-plugin UI OUTBOX (plugin-ui-plane #679 U5, §4.5a) — where `host.ui.toast` and
 *  `host.ui.openDialog` land and where the two invoke verbs drain them onto the round-trip's outcome. The
 *  surface-state plane's sibling in every respect: minted ONCE per service at compose, `ASSUMES(single-replica)`,
 *  respawn wipes, cleared per-plugin on deactivate. FACTORY: `substrate/ui-outbox.ts` (the SnippetGate/NotifyFloor
 *  convention — seam TYPE here, factory in substrate).
 *
 *  The channel choice is the security property, not plumbing: because the ONLY way an item leaves this store is
 *  the outcome of a client-initiated `invokeUiAction`/`invokeUiCommand`, a plugin cannot raise a modal or a toast
 *  at a person who did not just act on it. A spontaneous open has no path to travel on. */
export interface PluginUiOutbox {
  /** Stamp the plugin's NAME as the attribution prefix, cap the body, claim the per-plugin toast cooldown, and
   *  queue it. THROWS when the cooldown refuses (→ a rejected guest promise: a plugin over its floor is told). */
  readonly pushToast: (plugin: PluginIdentity, level: PluginToastLevel, message: string) => void;
  /** Record an ask to open one of this plugin's `dialog` surfaces. LAST WRITE WINS; the id is resolved against
   *  the resident instance by the draining verb, never here. */
  readonly requestDialog: (pluginId: PluginId, surfaceId: string) => void;
  /** Take and clear everything queued for one plugin — called by the invoke verbs after the guest returns. */
  readonly drain: (pluginId: PluginId) => PluginUiOutcome;
  /** Drop one plugin's whole outbox — the deactivate/uninstall sweep (no ghost chrome outlives a disabled plugin). */
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
  /** Fetch a plugin bundle's bytes at a caller-supplied URL through the EGRESS GUARD (plugin-ui-plane #679 U8,
   *  seam 15 — the URL-install funnel). Wired at compose to `infra/network`'s `fetchPluginBundle`: `safeFetch`
   *  with the arbitrary-URL (`ANY_HOST`) posture — https-only, per-hop private-range/IP-literal denial (the SSRF
   *  wall), a redirect budget, and a byte cap that bounds the download BEFORE `parseBundle` ever sees it. NEVER a
   *  bare `fetch`. It THROWS on any refusal/non-2xx/network error (the domain never imports infra to branch —
   *  the `fetchWebDocument`→`ScrapeFailedError` precedent); the URL verbs collapse every throw to a single
   *  leak-free {@link PluginBundleFetchError}, so no SSRF oracle crosses the boundary. */
  readonly fetchBundle: (url: string) => Promise<Uint8Array>;
  /** The SHOWCASE bundles this build ships (#1740) — the SECOND byte source an update can come from, beside
   *  `fetchBundle`'s remembered URL. Injected rather than imported for the same reason every other byte source
   *  is: `@orb/showcase-plugins` reads its bundles off DISK (`node:fs`), and the domain tier does not touch the
   *  filesystem (`domain-no-node-fs`; the `domain/import` staging seam is the same call). Wired at compose to
   *  that package's `packShowcaseBundle`/`readShowcaseManifest` — the SAME reader the boot seeder's
   *  `packBundle`/`bundledVersion` ops use, so an update offered here and an auto-upgrade at boot can never
   *  disagree about what ships.
   *
   *  `slugs` is the SYNC half, and it has to be: `toPluginView` is a pure projection and decides
   *  `updateSource: "showcase"` from it on every read. `bundle`/`version` answer `null` for a slug this build
   *  ships nothing for, which is the same absence the seeder's ops report. */
  readonly showcase: {
    readonly slugs: ReadonlySet<string>;
    readonly bundle: (slug: string) => Promise<Uint8Array | null>;
    readonly version: (slug: string) => Promise<string | null>;
  };
  readonly host: PluginHostPort;
  readonly ops: PluginHostOps;
  /** The UI-surface state plane (plugin-ui-plane #679 U1) — the read verb (`getSurfaceState`) reads it and
   *  deactivate/uninstall clears it. Written by the compose-side `ops.ui.setState` (the same store instance,
   *  shared by construction). Minted ONCE at compose (`createPluginSurfaceStateStore`). */
  readonly surfaceState: PluginSurfaceStateStore;
  /** The UI OUTBOX (plugin-ui-plane #679 U5) — the invoke verbs drain it onto their outcome and
   *  deactivate/uninstall clears it. Written by the compose-side `ops.ui.toast`/`ops.ui.openDialog` (the same
   *  store instance, shared by construction). Minted ONCE at compose (`createPluginUiOutbox`). */
  readonly uiOutbox: PluginUiOutbox;
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
  /** The per-plugin CONCURRENCY belt on `plugin.uiHostCall` (U4) — process-wide state, minted ONCE at compose
   *  (`createUiHostCallGate`) exactly like the snippet gate and the notify floor. It mirrors the server guest's
   *  `HOST_CALLS_IN_FLIGHT_MAX`: the transport's rate bucket bounds calls per WINDOW and structurally cannot
   *  bound how many are RUNNING, which is what a re-rendering scripted surface can turn into a flood. */
  readonly uiHostCallGate: UiHostCallGate;
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
  /** Fetch a bundle at a URL through the egress guard and return its MANIFEST for the consent screen
   *  (plugin-ui-plane #679 U8, seam 15). Read-only; SELF-authority; a fetch failure is a leak-free
   *  {@link PluginBundleFetchError}, a bad zip a `ManifestInvalidError` — same funnel as a file install. */
  readonly previewFromUrl: (params: PreviewFromUrlParams) => Promise<PluginManifest>;
  /** Fetch a bundle at a URL through the egress guard, then run it through the SAME funnel + consent as a file
   *  install (delegates to {@link install}). SELF-authority — mints the caller's own row. */
  readonly installFromUrl: (params: InstallFromUrlParams) => Promise<PluginView>;
  /** Fetch a NEW bundle at a URL through the egress guard, then upgrade the OWNED plugin through {@link upgrade}
   *  — #615's re-consent wall applies (reach-widening ⇒ DISABLED). Owner-scoped: a foreign pluginId is a
   *  leak-free NOT_FOUND checked BEFORE any fetch, so a stranger never triggers server egress. NEVER silent. */
  readonly upgradeFromUrl: (params: UpgradeFromUrlParams) => Promise<PluginView>;
  /** AUTO UPDATE-CHECK (U8 2b — the thing ST's loader does): for the caller's OWN `url`-origin plugins, re-fetch
   *  each remote manifest through the same egress guard and compare versions. BATCH + SELF-scoped (no id); a
   *  file install is absent from the result (nothing to check), a fetch/parse failure is a leak-free
   *  `unreachable`. Read-only — nothing persists. */
  readonly checkForUpdates: (params: CheckForUpdatesParams) => Promise<readonly PluginUpdateCheck[]>;
  /** TRUE ONE-CLICK UPGRADE (U8 2b): re-fetch from the plugin's REMEMBERED `source_url` (re-paste-free) and run
   *  it through {@link upgrade} — #615's reach-widening→disabled wall applies, NEVER silent. Owner-scoped: a
   *  foreign pluginId is a leak-free NOT_FOUND checked BEFORE any fetch; a file (`upload`) install has no source
   *  and is a typed `PluginNoSourceUrlError`. */
  readonly upgradeFromStoredUrl: (params: UpgradeFromStoredUrlParams) => Promise<PluginView>;
  /** THE SEEDED-EXAMPLE TWIN (#1740): the same one-click upgrade, from the bundle this build SHIPS rather than a
   *  remembered URL — the only path a DIVERGED showcase install has, since the boot auto-upgrade passes those
   *  over on purpose. Owner-scoped identically (foreign pluginId ⇒ leak-free NOT_FOUND before anything is
   *  packed); a row this build ships no bundle for is a typed `PluginNotShowcaseError`; #615's wall applies
   *  because the bytes go through the SAME {@link upgrade}. */
  readonly upgradeFromShowcase: (params: UpgradeFromShowcaseParams) => Promise<PluginView>;
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
  /** The caller's OWN enabled plugins' registered UI surfaces (plugin-ui-plane #679 U1) — owner-scoped, no
   *  foreign id (a plugin the caller does not own is never in the result). */
  readonly listSurfaces: (params: ListSurfacesParams) => Promise<readonly PluginSurfaceView[]>;
  /** One owned surface's published state (`null` if nothing published). Owner-scoped on `pluginId` (leak-free). */
  readonly getSurfaceState: (params: GetSurfaceStateParams) => Promise<PluginSurfaceState | null>;
  /** One owned plugin's BUNDLE-SHIPPED image map — `ui/assets/<name>` → the CAS id it was unpacked to (#820
   *  seam 11). Owner-scoped on `pluginId` (leak-free NOT_FOUND); the renderer resolves a node's declared
   *  bundle path through it and then rides the same owner-scoped blob resolve every `assetId` already rides. */
  readonly listBundleAssets: (params: ListBundleAssetsParams) => Promise<readonly PluginBundleAssetView[]>;
  /** One owned `frame`-tier surface's DOCUMENT BYTES (plugin-ui-plane #679 U7). Owner-scoped on `pluginId`
   *  (leak-free NOT_FOUND) and re-gated per call on the row's live `ui.frame` grant. `null` for every other arm —
   *  disabled, no resident, unknown surface, wrong tier — so the doorway serves one identical miss. Its ONE
   *  caller is `entry/http/plugin-frame.ts`; nothing projects these bytes to a client. */
  readonly getFrameBody: (params: GetFrameBodyParams) => Promise<PluginFrameBody | null>;
  /** Re-enter a surface's `onAction` under the crash policy (owner-scoped, leak-free). Returns the drained UI
   *  OUTCOME (U5): the host-mediated toasts + at most one dialog-open the guest asked for while it ran. Any STATE
   *  the handler published still rides the `pluginSurfaceStateChanged` bus poke — the outcome carries chrome, not
   *  data. */
  readonly invokeUiAction: (params: InvokeUiActionParams) => Promise<PluginUiOutcome>;
  /** TIER C (U4). The client guest's ONE relay into the membrane: re-gated per call (owner scope → enabled →
   *  `fn ∈ UI_PROXYABLE_HOST_FUNCTIONS` → the STORED grant → membership on any claimed room → per-fn zod → the
   *  per-plugin in-flight belt), then run through the SAME `PluginBridge` a server guest's call rides. Returns
   *  the result as an INERT JSON string (the marshal law at a second boundary). */
  readonly uiHostCall: (params: UiHostCallParams) => Promise<{ readonly resultJson: string }>;
  /** TIER C (U4). One owned plugin's `ui.js` source, re-parsed out of the stored bundle through the ONE unzip
   *  funnel; `null` when the plugin ships no client guest. Owner-scoped twice (the row AND the CAS read). */
  readonly getUiBundle: (params: GetUiBundleParams) => Promise<string | null>;
  /** TIER C (U4, §4.9). The client half of the 3-strike crash policy: a terminated/failed client guest feeds
   *  the SAME `consecutive_crashes` counter a throwing server handler drives. Owner-scoped (leak-free), so the
   *  worst a caller can do with it is disable their own plugin — which `setEnabled` already lets them do. */
  readonly reportUiCrash: (params: ReportUiCrashParams) => Promise<void>;
  /** The caller's OWN enabled plugins' registered COMMANDS (U5) — owner-scoped, no foreign id, the
   *  `listSurfaces` posture exactly. Both the `/plugin` dispatcher and the Plugins chrome menu read it. */
  readonly listCommands: (params: ListCommandsParams) => Promise<readonly PluginCommandView[]>;
  /** Run one registered command under the crash policy (owner-scoped, leak-free) and return the drained UI
   *  outcome. `/plugin <slug> <name> <rest>` and the chrome menu are the two surfaces that reach it. */
  readonly invokeUiCommand: (params: InvokeUiCommandParams) => Promise<PluginUiOutcome>;
  /** The caller's OWN enabled plugins' registered DISPLAY transforms (plugin-ui-plane seam 14, U6) —
   *  owner-scoped, no foreign id. The per-row round-trip's BYTE-IDENTITY gate: an empty answer means the
   *  viewer's transcript makes no `transformForDisplay` calls at all. */
  readonly listDisplayTransforms: (params: ListDisplayTransformsParams) => Promise<readonly PluginDisplayTransformView[]>;
  /** Annotate ONE rendered row through the caller's own plugins' display transforms, in order, each under
   *  `PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS`. A transform that throws or overruns is SKIPPED (D53) — the row
   *  keeps the text it had, so this verb can never blank or block a message. The submitted text is reflected
   *  ONLY to this caller; nothing is persisted and no authority derives from it. */
  readonly transformForDisplay: (params: TransformForDisplayParams) => Promise<{ readonly text: string }>;
}
