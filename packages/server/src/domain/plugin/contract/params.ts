// domain/plugin/contract/params — every verb's *Params, declared ONCE (§7.4 one type home). Each carries the
// acting `caller: Principal` — minted at the entry seam (the constitution: only entry constructs a Principal),
// never in-domain (the imagery precedent). The bundle bytes arrive as a `Uint8Array` (the transport already
// size-capped the upload); `substrate/manifest.ts#parseBundle` is the untrusted-input boundary. `RunSnippet`
// is the inline-mode input — TYPE HOME ONLY here; the verb implementation lives with the other verbs.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";

/** `installPlugin` — unzip+validate the bundle, store its bytes in the CAS, insert a `disabled` row.
 *  `grant` is the confirmed capability subset (⊆ the manifest's declared set — `CapabilityNotGrantedError`
 *  otherwise). Install authority is SELF (D147): any authenticated principal, and the row is stamped
 *  `ownerId: caller.userId` — which is also what every later verb gates on. */
export interface InstallPluginParams {
  readonly caller: Principal;
  readonly bundle: Uint8Array;
  readonly grant: readonly PluginCapability[];
}

/** `upgradePlugin` — replace an installed plugin's bundle. The new manifest's `id` MUST match the
 *  installed slug; a version LOWER than installed is refused (`PluginDowngradeRefusedError`). The prior grant
 *  carries forward intersected with the newly-declared set; a manifest that declares a capability the prior
 *  grant never confirmed lands the row `disabled` pending re-grant. */
export interface UpgradePluginParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly bundle: Uint8Array;
}

/** `setPluginGrant` — the RE-CONSENT act, and the half the upgrade path was missing. `upgrade` intersects the
 *  prior grant with the newly-declared set, so a newly-declared capability lands NOT granted, and `setEnabled`
 *  activates with the STORED grant and never recomputes one — so before this verb the only way to allow a
 *  newly-declared capability was uninstall + reinstall (which also drops the plugin's `storage.kv` rows).
 *
 *  IT IS AN EXPLICIT ACT AND IT IS NOT ENABLING. Re-grant must never be a side effect of turning a plugin on
 *  (that is the same defect in the opposite direction — an enable would silently widen authority), so
 *  `setEnabled` still reads the stored grant, and this verb never enables a disabled plugin. `grant` is the
 *  WHOLE new subset, not a delta: a consent surface shows the complete asked-vs-allowed picture and the caller
 *  sends back exactly what it displayed. `acknowledgedNetHosts` is the anti-TOCTOU echo — see
 *  {@link PluginNetHostsUnacknowledgedError} for why `net.fetch` alone needs one. */
export interface SetPluginGrantParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly grant: readonly PluginCapability[];
  /** The exact `netHosts` list the caller displayed to the owner (echo `PluginView.netHosts ?? []`). Only
   *  consulted when `grant` includes `net.fetch`; a manifest host absent from it is a typed refusal. */
  readonly acknowledgedNetHosts: readonly string[];
}

/** `setPluginEnabled` — activate (enabled ⇒ run `main.js` in the host, collect registrations) or deactivate
 *  (disable ⇒ dispose the instance + deregister tools/transforms/subs). Idempotent per target state. */
export interface SetPluginEnabledParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly enabled: boolean;
}

/** `uninstallPlugin` — deactivate → delete the row (KV cascades) → delete the bundle asset. */
export interface UninstallPluginParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
}

/** `listPlugins` — the caller's OWN installed plugins (fetchOwned), newest-installed first. */
export interface ListPluginsParams {
  readonly caller: Principal;
}

/** `getPluginLog` — the host.log ring for an owned plugin, newest-last, capped by `limit`. */
export interface GetPluginLogParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly limit?: number;
}

/** `installForAllUsers` — the ONE admin-gated verb in this domain (D147 clause (d), resolved 2026-08-24).
 *  PUBLISH `bundle` to the deployment: record it in the distribution set, then FAN OUT one ordinary per-user
 *  install to every existing user. `caller` is the publishing admin — their `can(caller,"admin",{kind:"global"})`
 *  is checked before anything is validated or written, and their CAS holds the published bytes.
 *
 *  There is deliberately no `grant`: a fan-out mints rows the recipients never asked for, so every copy lands
 *  with an EMPTY grant and a standing consent ask, exactly like the example seeder. Enabling stays each
 *  recipient's own act and cannot be performed for them (D147 clause (b) — enabling RUNS guest code as the
 *  enabler, so no role is senior enough to do it on someone's behalf). */
export interface InstallForAllUsersParams {
  readonly caller: Principal;
  readonly bundle: Uint8Array;
}

/** `uninstallForAllUsers` — withdraw a published plugin: drop the distribution record, then fan out one
 *  ordinary per-user uninstall. Admin-gated like its twin.
 *
 *  THE DIVERGENCE POLICY IS SLUG **AND VERSION** (decided at build, D147): a recipient whose row is at a
 *  different version than the distributed one has taken the plugin over — they upgraded it themselves, or
 *  they installed their own copy before the distribution ever reached them — and an admin withdrawal must not
 *  delete the thing they chose. Those rows are SKIPPED and reported, never silently left behind. */
export interface UninstallForAllUsersParams {
  readonly caller: Principal;
  readonly slug: string;
}

/** `listDistributedPlugins` — the published set, for the admin's distribute surface. Admin-gated: it is
 *  DEPLOYMENT policy, not a per-user read, and a plain member's own copies already show up in `list`. */
export interface ListDistributedPluginsParams {
  readonly caller: Principal;
}

/** `applyDistributedPlugins` — SELF-scoped (no admin, no foreign id): install any published plugin the CALLER
 *  does not already hold, under the caller's own Principal. This is the NEW-USER half of the fan-out — a user
 *  created after a distribution was published never appeared in its recipient list, so the entry hook drives
 *  this once per user (the `ensureSeeded` precedent, latched in `UserSettings.onboarding`). Idempotent: a slug
 *  the caller already has at ANY version is skipped. */
export interface ApplyDistributedPluginsParams {
  readonly caller: Principal;
}

/** `runSnippet` — the inline mode: a fresh instance, run once as the caller, disposed. TYPE HOME ONLY
 *  here — the verb implementation lives with the other verbs. */
export interface RunSnippetParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly code: string;
}

/** `listSurfaces` — the CALLER's OWN enabled plugins' registered UI surfaces (plugin-ui-plane #679 U1). No id,
 *  no foreign scope: like `list`, the owner-scoped read of the caller's rows IS the gate — a foreign plugin's
 *  surfaces are simply never in the result. */
export interface ListSurfacesParams {
  readonly caller: Principal;
}

/** `getSurfaceState` — one surface's published state, for a plugin the caller OWNS. Owner-scoped on `pluginId`
 *  (leak-free NOT_FOUND); the v1 invariant is viewer == installer, so the state's one legitimate reader is
 *  exactly this owner. */
export interface GetSurfaceStateParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  /** The ROOM the read is scoped to (row 777). Absent ⇒ the plugin-wide row. Present ⇒ a CLIENT CLAIM, and it
   *  is verified: the verb resolves the caller's own chat authority and refuses NOT_FOUND when they cannot read
   *  the room, so a claimed chatId can never turn this into a probe for rooms the caller is not in. */
  readonly chatId?: ChatId;
}

/** `uiHostCall` — the Tier-C client guest's ONE relay to the membrane (plugin-ui-plane #679 U4, §4.6). A
 *  scripted `ui.js` running in the browser worker has NO network of its own; when it needs host data it names a
 *  proxyable host function and this verb performs it SERVER-side through the same `PluginBridge` every
 *  server-guest call rides, under the installer.
 *
 *  NOTHING THE CLIENT SENDS IS TRUSTED, and the gate order is the security story:
 *   1. OWNER SCOPE — the owner-scoped `getById` load; a foreign pluginId is a leak-free NOT_FOUND.
 *   2. PROXYABILITY — `fn ∈ UI_PROXYABLE_HOST_FUNCTIONS` (the closed contracts tuple), so a client cannot name
 *      a resident registrar or an authority write however it spells the string.
 *   3. GRANT — `HOST_FUNCTION_CAPABILITY[fn] ∈ the STORED grant on the caller's own row`. Re-read per call from
 *      the row, never from anything the client sent: the client's view of its grants is display-only.
 *   4. ARGS — a per-fn zod parse of the decoded `argsJson` (the membrane's own per-fn validation, reused).
 *   5. ROOM — a chat-scoped fn's `chatId` is membership-verified exactly like `getSurfaceState`'s. */
export interface UiHostCallParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  /** The host-function reference, as the client spelled it — validated against the closed proxyable tuple. */
  readonly fn: string;
  /** The call's arguments as an INERT JSON string (the marshal discipline: nothing live, and a string is what
   *  makes the byte cap exact — see `PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES`). */
  readonly argsJson: string;
  /** The room a chat-scoped fn runs against — a CLIENT CLAIM, membership-verified before use. */
  readonly chatId?: ChatId;
}

/** `reportUiCrash` — the client half of the 3-strike crash policy (plugin-ui-plane §4.9). A Tier-C guest that
 *  hangs past its wall-clock deadline, fails to boot, or publishes an unparseable tree is TERMINATED in the
 *  browser and the surface collapses to null; this verb feeds that fact into the SAME `consecutive_crashes`
 *  counter a throwing server handler drives, so a UI half that dies every mount auto-disables like a server half
 *  that throws. Owner-scoped on `pluginId` (leak-free NOT_FOUND) — the counter is on the caller's own row, so a
 *  stranger can neither read nor advance it. */
/** `getUiBundle` — the `ui.js` SOURCE for a plugin the caller OWNS (plugin-ui-plane #679 U4, seam 8), re-parsed
 *  out of the stored bundle so the bytes always come through the ONE unzip funnel. `null` when the plugin ships
 *  no client guest, which is a normal answer (every Tier-S plugin), not an error. Owner-scoped on `pluginId`
 *  (leak-free NOT_FOUND) AND owner-scoped again at the CAS read — a bundle is a user's own uploaded file. */
export interface GetUiBundleParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
}

export interface ReportUiCrashParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  /** Which surface died — the caller's own plugin, so a plain refusal on a miss reveals nothing foreign. */
  readonly surfaceId: string;
  /** A bounded, operator-facing reason for the plugin log ("wall-clock deadline", "invalid tree"). */
  readonly reason: string;
}

/** `invokeUiAction` — the guest-action round-trip (plugin-ui-plane #679 U1). Owner-scoped on `pluginId`
 *  (leak-free NOT_FOUND); re-enters the surface's `onAction` handler under the crash policy + the per-instance
 *  invoke queue. `values` is the collected form-field bag (all strings on the wire); the guest may publish new
 *  state via `host.ui.setState`, whose bus poke refreshes the caller's own client. Returns void — the effect is
 *  the state update, never a direct result. */
export interface InvokeUiActionParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly actionId: string;
  readonly values: Record<string, string>;
  /** The ROOM the action was taken in (row 777). Absent ⇒ the handler runs with no chat scope and receives
   *  `chat: null` (the U1 settings-panel shape, unchanged). Present ⇒ a CLIENT CLAIM that is MEMBERSHIP-VERIFIED
   *  before it becomes an invocation scope: the verb resolves the caller's own chat authority (leak-free
   *  NOT_FOUND when they cannot read it) and hands the guest the host-minted opaque handle for exactly that
   *  room, with `canWrite` set from the caller's HOST authority — so a room-anchored action reaches the room a
   *  person is actually looking at, and only that one. */
  readonly chatId?: ChatId;
}
