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

/** `runSnippet` — the inline mode: a fresh instance, run once as the caller, disposed. TYPE HOME ONLY
 *  here — the verb implementation lives with the other verbs. */
export interface RunSnippetParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly code: string;
}
