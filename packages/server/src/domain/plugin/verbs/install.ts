// verb: install — the trust edge. Authority = SELF (D147): any authenticated principal installs FOR
// THEMSELVES, and the row is stamped `ownerId: caller.userId`. There is no role gate — a plugin runs under
// its INSTALLER's own ceiling (the bridge closes over `caller.userId`, PL-C resolves the installer's own
// room role, `llm.quiet` spends the installer's own credential), so an install grants the caller authority
// over nothing but their own reach. The SERVER-WIDE install (one row serving every user) is the admin-gated
// variant and is NOT BUILT — see D147.
// Flow: `parseBundle` (unzip+validate the untrusted bytes — throws `ManifestInvalidError` on a bad
// zip/bomb/manifest) → the grant ⊆ declared check → per-owner slug-collision check → store the WHOLE bundle
// in the caller's CAS (kind `"plugin"`) → insert a `disabled` row (enabling is a second explicit act, like
// rules). The row lands `origin:"upload"` (the reserved single-arm — a future catalog fetcher feeds the SAME
// bundle funnel).

import { CapabilityNotGrantedError, PluginAlreadyInstalledError } from "../contract/errors.ts";
import type { InstallPluginParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getByOwnerSlug, insertPlugin, toPluginView } from "../persistence/plugins.ts";
import { normalizeGrant, ungrantableCapabilities } from "../substrate/grants.ts";
import { PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest.ts";

export function createInstall(ctx: PluginContext): PluginService["install"] {
  return async ({ caller, bundle, grant }: InstallPluginParams) => {
    const { manifest } = parseBundle(bundle);

    const ungrantable = ungrantableCapabilities(manifest.capabilities, grant);
    if (ungrantable.length > 0) {
      throw new CapabilityNotGrantedError(ungrantable);
    }

    const existing = await getByOwnerSlug(ctx.db, caller.userId, manifest.id);
    if (existing !== undefined) {
      throw new PluginAlreadyInstalledError(manifest.id);
    }

    const granted = normalizeGrant(manifest.capabilities, grant);
    const stored = await ctx.assets.store(caller, bundle, PLUGIN_BUNDLE_MIME);
    const now = ctx.now();
    // ONE row object, inserted AND projected. It used to be two hand-written literals — the insert shape and a
    // parallel `PluginView` return — which is two homes for one projection: a field added to `toPluginView` was
    // silently absent from a freshly-installed plugin's view. The schema defaults it re-states here
    // (`consecutiveCrashes: 0`, `lastError: null`) are the values `insertPlugin` writes.
    const row = {
      id: ctx.newPluginId(),
      ownerId: caller.userId,
      slug: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifest,
      bundleAssetId: stored.assetId,
      grantedCapabilities: granted,
      status: "disabled" as const,
      origin: "upload" as const,
      // Nothing to re-consent TO: the owner just chose this grant against this manifest — so no refusal is
      // recorded and there is no host delta to mark. This is also the arm that keeps a REINSTALL honest:
      // uninstall deletes the row, so installing the same slug again mints a fresh one, and the delta has to
      // start empty or a "New" badge would resurrect for an update this row never saw.
      pendingReconsent: false,
      widenedNetHosts: [],
      consecutiveCrashes: 0,
      lastError: null,
      installedAt: now,
      updatedAt: now,
    };
    await insertPlugin(ctx.db, row);
    return toPluginView(row);
  };
}
