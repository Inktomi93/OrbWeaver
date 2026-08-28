// domain/plugin/contract/params — every verb's *Params, declared ONCE (§7.4 one type home). Each carries the
// acting `caller: Principal` — minted at the entry seam (the constitution: only entry constructs a Principal),
// never in-domain (the imagery precedent). The bundle bytes arrive as a `Uint8Array` (the transport already
// size-capped the upload); `substrate/manifest.ts#parseBundle` is the untrusted-input boundary. `RunSnippet`
// is the inline-mode input — TYPE HOME ONLY here; the verb implementation lives with the other verbs.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { ChatId, MessageId, PluginId } from "@orb/kit/ids";

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
}

/** `getFrameBody` — the DOCUMENT BYTES of one owned `frame`-tier surface (plugin-ui-plane #679 U7, §6.2). Owner-
 *  scoped on `pluginId` (leak-free NOT_FOUND) AND re-gated per call on the row's live `ui.frame` grant, because a
 *  resident instance outlives a re-grant and a consent that cannot be withdrawn is not a consent. Its ONE caller
 *  is the plugin-frame doorway; the bytes never reach a projected wire shape. */
export interface GetFrameBodyParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly surfaceId: string;
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
}

/** `listCommands` — the CALLER's OWN enabled plugins' registered commands (plugin-ui-plane #679 U5). No id, no
 *  foreign scope: the `listSurfaces` posture exactly — the owner-scoped read of the caller's rows IS the gate. */
export interface ListCommandsParams {
  readonly caller: Principal;
}

/** `invokeUiCommand` — run one registered command (U5, §4.5). Owner-scoped on `pluginId` (leak-free NOT_FOUND);
 *  re-enters `onRun` under the crash policy + the per-instance invoke queue, exactly like a UI action.
 *
 *  `args` is the RAW remainder after `/plugin <slug> <name>` (trimmed) — a command owns its own argument grammar
 *  (the `SlashCommandRunner` contract, applied across the membrane). `chatId` is the room the person ran it in,
 *  or `null` when there is none (the chrome menu outside a chat): it is gated as a real invocation chat scope,
 *  so a command that reads the room needs the same authority any other guest read of that room does — a command
 *  is not a back door around the chat-read admission. */
export interface InvokeUiCommandParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly name: string;
  readonly args: string;
  readonly chatId: ChatId | null;
}

/** `listDisplayTransforms` — the caller's OWN enabled plugins' registered DISPLAY transforms (plugin-ui-plane
 *  seam 14, U6). Same shape and same gate as `listSurfaces`: no id, owner-scoped read. Its ONE job is the
 *  BYTE-IDENTITY gate — a viewer with no display transforms learns so in one query and their transcript makes
 *  no per-row calls at all. */
export interface ListDisplayTransformsParams {
  readonly caller: Principal;
}

/** `transformForDisplay` — the per-row display round-trip (plugin-ui-plane seam 14, U6).
 *
 *  THE TRUST POSTURE, IN ONE LINE: `text` is CLIENT-SUPPLIED and is reflected ONLY to the same caller — no
 *  authority, no persistence and no other viewer's render derives from it, so the server neither re-derives it
 *  nor needs to. That is what makes the round-trip narrower than the `chat.read` grant the plugin already
 *  holds: a guest can only ever see text the installer's own client already had on screen.
 *
 *  `chatId`/`messageId` are passed to the guest as its `env` (a display transform routinely keys off which row
 *  it is annotating); they are ids the caller already holds, and nothing is READ with them. */
export interface TransformForDisplayParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  /** The row as this viewer's client has ALREADY rendered it (macros → DISPLAY regex → this). Capped at
   *  `PLUGIN_DISPLAY_TEXT_MAX_CHARS` at the transport boundary. */
  readonly text: string;
}
