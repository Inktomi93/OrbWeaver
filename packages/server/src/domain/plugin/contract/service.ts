// domain/plugin/contract/service — the typed API surface: the infra seam TYPE the domain declares for the
// sandbox runtime (`PluginHostPort` — `domain/plugin` never imports `#infra/plugin-host`; the runtime is wired
// upward at compose), the resident-instance registry the lifecycle owns, the DI bundle (`PluginContext`), and
// the `PluginService` (7 verbs incl. the inline `runSnippet`). Every cross-tier value is a declared type here; the
// runtime is assembled at the composition root (one-directional flow: transport → domain/plugin →
// infra/plugin-host → nothing).

import type { StoredAsset } from "@orb/contracts/assets";
import type { Can, Principal } from "@orb/contracts/identity";
import type { InvocationChat, PluginBridge, PluginBudgetView, PluginCapability, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { AssetId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { PluginHostOps, PluginRegistrationHandle } from "./ops";
import type {
  GetPluginBudgetParams,
  GetPluginLogParams,
  InstallPluginParams,
  ListPluginsParams,
  RunSnippetParams,
  SetPluginBudgetParams,
  SetPluginEnabledParams,
  UninstallPluginParams,
  UpgradePluginParams,
} from "./params";
import type { PluginLogView, PluginView, SnippetResult } from "./results";

/** The caller's leak-free chat authority for the snippet gate (03 §1): `canRead` admits the chat at all,
 *  `canWrite` unlocks the write half of the fixed profile (host authority). An unknown/foreign chat resolves
 *  to `{false,false}` — indistinguishable from a no-access chat (the loadPresentRole compose-gate semantics),
 *  so a snippet against a chat the caller cannot see is refused NOT_FOUND, never given an existence oracle. */
interface ChatAuthority {
  readonly canRead: boolean;
  readonly canWrite: boolean;
}

/** Per-instance DoS budget (structural twin of `infra/plugin-host`'s `SandboxLimits` — the domain never imports
 *  `#infra`; the port defaults these from `budgets.ts` when omitted). A snippet (P5) passes the wider wall. */
export interface PluginBudgets {
  readonly cpuDeadlineMs: number;
  readonly memoryLimitBytes: number;
}

/** The input to `createInstance` (02 §5): the guest source + the confirmed grants + the authority-agnostic
 *  membrane BRIDGE the domain built (per-installer: `substrate/bridge.ts` closes global-vars over the installer
 *  and passes chat ops through) + the activation-run chat scope + the optional budget override. The domain
 *  gated the invocation-chat-context (`can(installer,"read",chat)`) + folded host-authority into `grants` /
 *  `chat.canWrite` BEFORE this call — infra is authority-blind (a plugin can never exceed its installer — 02 §2).
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

/** The outcome of an activation run (03 §2): a healthy resident instance, OR a contained activation failure
 *  (a `main.js` throw, an unserved `orb.host(2)`, a budget blow) surfaced as data — NEVER a partial activation
 *  (registrations from a failed run are discarded). `log` carries the activation-run host.log lines (the
 *  `last_error` context + the log ring's first fill). */
export type CreateInstanceOutcome =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogView[] };

/** The infra seam the sandbox runtime implements (`infra/plugin-host`'s front door — 01 §4). `domain/plugin`
 *  DRIVES it; the port never sees a DB row. TYPED here at P3; the createInstance/invoke bodies (host-fn wiring
 *  over the P1 `Sandbox`) are P4. */
export interface PluginHostPort {
  /** Boot a guest instance, install the realm, run `main.js` under the invocation budget, collect its
   *  registrations. Activation failure is contained → `ok:false` (the host process is never fatal — 03 §4). */
  readonly createInstance: (input: CreateInstanceInput) => Promise<CreateInstanceOutcome>;
  /** Invoke a collected guest handler (a tool/transform/event callback) with JSON-encoded args under the
   *  per-invocation budget (§3). `chat` sets the handler's invocation-chat scope (a resident tool runs in the
   *  chat it was called from — the domain resolves read/host authority before threading it; `null` = no scope). */
  readonly invoke: (instance: PluginInstance, handler: PluginHandlerRef, argsJson: string, chat: InvocationChat | null) => Promise<string>;
  /** Run an inline snippet (03 §1): a FRESH transient instance, run once as the caller under the 5 s wall, then
   *  disposed — no residency. The fixed capability profile + the admitted chat scope are the domain's; the port
   *  returns the drained log + a contained `error` (a snippet crash is data, never a resident-crash counter). */
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
  }) => Promise<SnippetResult>;
  /** A non-destructive snapshot of the instance's per-plugin host.log ring (03 §3). */
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
}

/** Activation result — success (resident + enabled), or a contained failure whose detail is on the errored row. */
export type ActivateOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** The activation factories the lifecycle verbs (upgrade/setEnabled/uninstall) drive — built once per service
 *  over the shared registry and injected (the imagery verb-to-verb dep pattern). */
export interface ActivationDeps {
  readonly activate: (input: ActivateInput) => Promise<ActivateOutcome>;
  readonly deactivate: (pluginId: PluginId) => void;
}

/** The crash-policy surface the P4 invocation loop drives (auto-disable posture, 03 §4). Homed here (not
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
  /** A clean invocation resets the consecutive-crash counter (03 §4). */
  readonly recordCleanRun: (pluginId: PluginId) => Promise<void>;
}

/** One resident enabled plugin: its live instance + the registrar handles (`deactivate`/`uninstall`
 *  `unregister`s each — no ghost registrations, 03 §5). */
interface ResidentPlugin {
  readonly instance: PluginInstance;
  readonly handles: readonly PluginRegistrationHandle[];
}

/** The in-process resident-instance registry the lifecycle owns (`ASSUMES(single-replica)` — the enabled-index
 *  precedent). Created once per service; enable adds, disable/uninstall unregisters + disposes + removes. */
export type PluginRegistry = Map<PluginId, ResidentPlugin>;

/** The injected-op bundle every plugin verb closes over, assembled at the composition root. */
export interface PluginContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPluginId: () => PluginId;
  /** The `can()` privilege seam (install authority = `can(caller,"admin",{kind:"global"})` — owner ∪ admin,
   *  02 §4). Injected (the domain never imports `admin`). */
  readonly can: Can;
  /** The per-user CAS ops the bundle bytes ride: `store` (kind fixed `"plugin"`), the owner-gated `readBytes`
   *  (activation re-reads + re-parses — "re-validated on load"), and `reapOrphans` (uninstall reaps the bundle
   *  asset AFTER the row's FK reference is deleted — the RESTRICT/`reapIfOrphan` posture, 02 §3). */
  readonly assets: {
    readonly store: (caller: Principal, bytes: Uint8Array, mime: string) => Promise<StoredAsset>;
    readonly readBytes: (caller: Principal, assetId: AssetId) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;
    readonly reapOrphans: (assetIds: readonly AssetId[]) => Promise<void>;
  };
  readonly host: PluginHostPort;
  readonly ops: PluginHostOps;
  /** The snippet gate (03 §1): resolve the caller's leak-free read/host authority for a chat. Caller-in-params
   *  (the injected-op-caller-gate rule); a foreign/unknown chat yields `{false,false}` — no existence oracle.
   *  Injected at compose (the domain never imports chat) — `loadPresentRole` under the caller. */
  readonly resolveChatAuthority: (caller: Principal, chatId: ChatId) => Promise<ChatAuthority>;
}

/** The plugin lifecycle surface (02 §4). `runSnippet` (the inline mode) is P5 — its params/result type home
 *  ships now, the verb does not. */
export interface PluginService {
  /** Unzip+validate the bundle → grant ⊆ declared → store bytes in the CAS → `disabled` row (02 §4). */
  readonly install: (params: InstallPluginParams) => Promise<PluginView>;
  /** Replace the bundle for an installed plugin (slug must match; downgrade refused; new caps ⇒ disabled). */
  readonly upgrade: (params: UpgradePluginParams) => Promise<PluginView>;
  /** Activate (run `main.js`, register) or deactivate (dispose + deregister) — idempotent per target state. */
  readonly setEnabled: (params: SetPluginEnabledParams) => Promise<void>;
  /** Deactivate → delete the row (KV cascades) → reap the bundle asset (02 §4). */
  readonly uninstall: (params: UninstallPluginParams) => Promise<void>;
  /** The caller's OWN installed plugins (fetchOwned), newest-installed first. */
  readonly list: (params: ListPluginsParams) => Promise<readonly PluginView[]>;
  /** The host.log ring for an owned plugin (03 §3) — empty for a plugin with no resident instance. */
  readonly getLog: (params: GetPluginLogParams) => Promise<readonly PluginLogView[]>;
  /** The inline mode (03 §1): run `code` once as the caller in `chatId` under the fixed capability profile ∩
   *  the caller's chat authority (read admits, host unlocks writes), disposed after. Refuses NOT_FOUND when the
   *  caller cannot read the chat (leak-free). */
  readonly runSnippet: (params: RunSnippetParams) => Promise<SnippetResult>;
  /** Read an OWNED plugin's per-day spend envelope (PLUGIN-SPEND) — the panel's ceilings + spent-today
   *  accumulator. Owner-scoped (a foreign/missing id ⇒ leak-free NOT_FOUND). */
  readonly getBudget: (params: GetPluginBudgetParams) => Promise<PluginBudgetView>;
  /** Upsert an OWNED plugin's per-day spend ceilings (PLUGIN-SPEND). Owner-scoped (a foreign/missing id ⇒
   *  leak-free NOT_FOUND); the accumulator columns are the gate's (untouched). */
  readonly setBudget: (params: SetPluginBudgetParams) => Promise<void>;
}
