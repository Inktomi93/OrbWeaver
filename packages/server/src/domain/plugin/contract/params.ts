// domain/plugin/contract/params — every verb's *Params, declared ONCE (§7.4 one type home). Each carries the
// acting `caller: Principal` — minted at the entry seam (the constitution: only entry constructs a Principal),
// never in-domain (the imagery precedent). The bundle bytes arrive as a `Uint8Array` (the transport already
// size-capped the upload); `substrate/manifest.ts#parseBundle` is the untrusted-input boundary. `RunSnippet`
// is the inline-mode input — TYPE HOME ONLY here; the verb implementation lives with the other verbs.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability, PluginCommandArgValue, PluginOrigin } from "@orb/contracts/plugin";
import type { ChatId, MessageId, PluginId } from "@orb/kit/ids";

/** WHERE an install got its bytes — the honest origin + the URL to remember (plugin-ui-plane #679 U8 2b). The
 *  install verb is source-agnostic (`substrate/manifest.ts`); the CALLING verb states the source, never the
 *  client. Absent ⇒ a file upload (`origin:"upload"`, no `sourceUrl`); `installFromUrl` passes
 *  `{ origin:"url", sourceUrl:url }` so the row records the honest origin AND the URL the update-check re-fetches.
 *  The `origin ⟺ sourceUrl` pairing is enforced at the db CHECK, so this type carries both together rather than
 *  letting a caller set one without the other. */
interface PluginInstallSource {
  readonly origin: PluginOrigin;
  readonly sourceUrl: string | null;
}

/** `installPlugin` — unzip+validate the bundle, store its bytes in the CAS, insert a `disabled` row.
 *  `grant` is the confirmed capability subset (⊆ the manifest's declared set — `CapabilityNotGrantedError`
 *  otherwise). Install authority is SELF (D147): any authenticated principal, and the row is stamped
 *  `ownerId: caller.userId` — which is also what every later verb gates on. */
export interface InstallPluginParams {
  readonly caller: Principal;
  readonly bundle: Uint8Array;
  readonly grant: readonly PluginCapability[];
  /** Where the bytes came from (U8 2b). Absent ⇒ a file upload (`origin:"upload"`, no `sourceUrl`) — the shape
   *  the transport `install` proc and the admin fan-out both take. `installFromUrl` sets it so the row records a
   *  `url` origin + the remembered URL. See {@link PluginInstallSource}. */
  readonly source?: PluginInstallSource;
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

/** `previewFromUrl` — fetch a bundle at a caller-supplied URL through the egress guard and return its MANIFEST
 *  for the consent screen (plugin-ui-plane #679 U8, seam 15). READ-ONLY: nothing persists, no owned id. It is
 *  the primitive behind both "show the same consent screen a file install shows" and the update-version check
 *  (the client compares the previewed `version` to the installed one). SELF-authority: any authenticated
 *  principal — the fetch spends the server's egress, so it is authed, but it touches no owned row. */
export interface PreviewFromUrlParams {
  readonly caller: Principal;
  readonly url: string;
}

/** `installFromUrl` — fetch a bundle at a caller-supplied URL through the egress guard, then run it through the
 *  EXACT SAME funnel + consent/grant checks a file install takes (plugin-ui-plane #679 U8, seam 15). The
 *  distinct-from-runtime-loading arm: this is an INSTALL ACT under the user's eyes (they picked the URL and
 *  confirmed the grant), not code loaded at runtime (row 23, refused). Origin stays `"upload"` — the bundle
 *  funnel is source-agnostic (a URL is just another byte source; `substrate/manifest.ts`'s own header). */
export interface InstallFromUrlParams {
  readonly caller: Principal;
  readonly url: string;
  readonly grant: readonly PluginCapability[];
}

/** `upgradeFromUrl` — fetch a NEW bundle at a caller-supplied URL through the egress guard, then upgrade the
 *  owned plugin through the EXISTING `upgrade` verb, so #615's re-consent wall applies UNCHANGED: an upgrade
 *  that WIDENS reach (a new capability / a new `netHosts` entry) lands the row DISABLED pending re-consent, and
 *  a narrowing carries forward silently. NEVER a silent auto-update. Owner-scoped: the plugin's OWN row is
 *  loaded (foreign/missing pluginId ⇒ leak-free NOT_FOUND) BEFORE any fetch — a stranger never causes the
 *  server to fetch on their behalf, and the cross-tenant sweep probes exactly that ordering. */
export interface UpgradeFromUrlParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly url: string;
}

/** `checkForUpdates` — the auto update-check (plugin-ui-plane #679 U8 2b, the thing ST's loader does: check every
 *  URL-installed extension's version). BATCH + SELF-scoped: no id, like `list`/`listSurfaces` — it walks the
 *  caller's OWN plugins, checks only the `url`-origin ones (a file install has no source to check, so it is
 *  simply absent from the result, never a dishonest "unreachable"), and re-fetches each remote manifest through
 *  the SAME egress guard the install rode (`ctx.fetchBundle`). No foreign id ⇒ sweep-EXEMPT. */
export interface CheckForUpdatesParams {
  readonly caller: Principal;
}

/** `upgradeFromStoredUrl` — the TRUE one-click upgrade (plugin-ui-plane #679 U8 2b): re-fetch from the URL the
 *  plugin was installed from (`plugins.source_url`) and run it through the EXISTING `upgrade` verb, so #615's
 *  reach-widening→disabled re-consent wall applies UNCHANGED — never a silent auto-update. Owner-scoped: the
 *  plugin's OWN row is loaded (foreign/missing ⇒ leak-free NOT_FOUND) BEFORE any fetch, exactly like
 *  {@link UpgradeFromUrlParams}; the difference is the URL is the REMEMBERED one, not a caller echo, so the
 *  affordance needs no re-paste. A file-install row (no `sourceUrl`) is a typed `PluginNoSourceUrlError`. */
export interface UpgradeFromStoredUrlParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
}

/** `upgradeFromShowcase` — the same one-click upgrade for a SEEDED showcase install (#1740). The byte source is
 *  the bundle this build SHIPS (`@orb/showcase-plugins`, injected as `ctx.showcase.bundle`) rather than a
 *  remembered URL, and everything else is the stored-url verb's shape exactly: owner-scoped row load FIRST
 *  (foreign/missing ⇒ leak-free NOT_FOUND), then delegate to the REAL `upgrade` verb so #615's
 *  reach-widening→disabled re-consent wall applies unchanged. A row this build ships no bundle for is a typed
 *  `PluginNotShowcaseError`.
 *
 *  WHY IT EXISTS AT ALL, given the boot seeder auto-upgrades: the seeder deliberately passes over an install
 *  whose version DIVERGED from what it last wrote (the owner took the plugin over —
 *  `entry/boot/seed-example-plugins.ts`, the same oracle `verbs/uninstall-for-all-users.ts` uses). That refusal
 *  is right, and it left the owner with no way to take a newer shipped bundle on purpose. This verb is that
 *  way, and it is an explicit ACT — never automatic. */
export interface UpgradeFromShowcaseParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
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
/** `listBundleAssets` — the owned plugin whose bundle-shipped image map to read (#820 seam 11). `pluginId` is
 *  the ONLY input and it is not authority: the verb's owner-scoped row load is the gate. */
export interface ListBundleAssetsParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
}

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
  /** The ROOM the action was taken in (row 777). Absent ⇒ the handler runs with no chat scope and receives
   *  `chat: null` (the U1 settings-panel shape, unchanged). Present ⇒ a CLIENT CLAIM that is MEMBERSHIP-VERIFIED
   *  before it becomes an invocation scope: the verb resolves the caller's own chat authority (leak-free
   *  NOT_FOUND when they cannot read it) and hands the guest the host-minted opaque handle for exactly that
   *  room, with `canWrite` set from the caller's HOST authority — so a room-anchored action reaches the room a
   *  person is actually looking at, and only that one. */
  readonly chatId?: ChatId;
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
  /** The TYPED arg bag (#791) the surfaces collected against the command's declared `args` — `{}` (or absent, the
   *  U5 raw-remainder callers) for a command that declared none. The verb RE-VALIDATES these against the RESIDENT
   *  command's own specs at the membrane (a client is untrusted): a bag missing a required arg, mistyping one, or
   *  naming an off-enum value is a typed refusal BEFORE the guest runs, never a malformed value handed to `onRun`.
   *  Optional so a raw-remainder caller (`args` only) needs no empty-bag ceremony; the verb normalizes absent to `{}`. */
  readonly values?: Record<string, PluginCommandArgValue>;
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
