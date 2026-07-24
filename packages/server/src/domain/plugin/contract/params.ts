// domain/plugin/contract/params — every verb's *Params, declared ONCE (§7.4 one type home). Each carries the
// acting `caller: Principal` — minted at the entry seam (the constitution: only entry constructs a Principal),
// never in-domain (the imagery precedent). The bundle bytes arrive as a `Uint8Array` (the transport already
// size-capped the upload); `substrate/manifest.ts#parseBundle` is the untrusted-input boundary. `RunSnippet`
// is the inline-mode input — TYPE HOME ONLY at P3 (03 §1; the verb is P5).

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";

/** `installPlugin` — unzip+validate the bundle, store its bytes in the CAS, insert a `disabled` row (02 §4).
 *  `grant` is the confirmed capability subset (⊆ the manifest's declared set — `CapabilityNotGrantedError`
 *  otherwise). Install authority is `can(caller,"admin",{kind:"global"})` — owner ∪ admin in v1 (02 §4). */
export interface InstallPluginParams {
  readonly caller: Principal;
  readonly bundle: Uint8Array;
  readonly grant: readonly PluginCapability[];
}

/** `upgradePlugin` — replace an installed plugin's bundle (02 §4). The new manifest's `id` MUST match the
 *  installed slug; a version LOWER than installed is refused (`PluginDowngradeRefusedError`). The prior grant
 *  carries forward intersected with the newly-declared set; a manifest that declares a capability the prior
 *  grant never confirmed lands the row `disabled` pending re-grant (02 §2). */
export interface UpgradePluginParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly bundle: Uint8Array;
}

/** `setPluginEnabled` — activate (enabled ⇒ run `main.js` in the host, collect registrations) or deactivate
 *  (disable ⇒ dispose the instance + deregister tools/transforms/subs). Idempotent per target state. */
export interface SetPluginEnabledParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly enabled: boolean;
}

/** `uninstallPlugin` — deactivate → delete the row (KV cascades) → delete the bundle asset (02 §4). */
export interface UninstallPluginParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
}

/** `listPlugins` — the caller's OWN installed plugins (fetchOwned), newest-installed first. */
export interface ListPluginsParams {
  readonly caller: Principal;
}

/** `getPluginLog` — the host.log ring for an owned plugin (03 §3), newest-last, capped by `limit`. */
export interface GetPluginLogParams {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly limit?: number;
}

/** `runSnippet` — the inline mode (03 §1): a fresh instance, run once as the caller, disposed. TYPE HOME ONLY
 *  at P3 — the verb implementation is P5. */
export interface RunSnippetParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly code: string;
}
