// verb: upgrade — replace an installed plugin's bundle (02 §4). Authority = install authority (owner ∪ admin).
// Flow: gate → load the owned row (leak-free NotFound) → `parseBundle` the new bytes → the new manifest's slug
// MUST match the installed slug (a bundle for a different plugin is a `ManifestInvalidError`) → REFUSE a version
// LOWER than installed (`PluginDowngradeRefusedError` — a re-uploaded old bundle must never silently roll back,
// the Marinara-audit rider) → recompute the grant (prior grant ∩ newly-declared) → stop the old resident
// instance → store the new bundle → swap the row → reap the now-orphaned old bundle asset → land `disabled`.
//
// Re-grant on new caps (02 §2): a manifest that declares a capability the prior grant never confirmed lands the
// row `disabled` (the owner re-enables, re-confirming). WITHOUT new caps, a plugin that was ENABLED is
// re-activated on the NEW bundle (the enabled state is preserved — only a superset forces re-confirmation).

import { ManifestInvalidError, PluginDowngradeRefusedError, PluginNotFoundError } from "../contract/errors";
import type { UpgradePluginParams } from "../contract/params";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service";
import { applyUpgrade, getById, toPluginView } from "../persistence/plugins";
import { newlyDeclaredCapabilities, normalizeGrant } from "../substrate/grants";
import { isVersionDowngrade, PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest";

export function createUpgrade(ctx: PluginContext, deps: ActivationDeps): PluginService["upgrade"] {
  return async ({ caller, pluginId, bundle }: UpgradePluginParams) => {
    ctx.can(caller, "admin", { kind: "global" });

    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    const { manifest } = parseBundle(bundle);
    if (manifest.id !== existing.slug) {
      throw new ManifestInvalidError(`bundle slug "${manifest.id}" does not match the installed plugin "${existing.slug}"`);
    }
    if (isVersionDowngrade(manifest.version, existing.version)) {
      throw new PluginDowngradeRefusedError(manifest.version, existing.version);
    }

    const newCaps = newlyDeclaredCapabilities(manifest.capabilities, existing.grantedCapabilities);
    const granted = normalizeGrant(manifest.capabilities, existing.grantedCapabilities);
    const reactivate = existing.status === "enabled" && newCaps.length === 0;

    // Stop the old resident instance (running the OLD code) before the swap.
    deps.deactivate(pluginId);

    const stored = await ctx.assets.store(caller, bundle, PLUGIN_BUNDLE_MIME);
    const now = ctx.now();
    await applyUpgrade(ctx.db, pluginId, {
      name: manifest.name,
      version: manifest.version,
      manifest,
      bundleAssetId: stored.assetId,
      grantedCapabilities: granted,
      status: "disabled",
      updatedAt: now,
    });
    // The old bundle asset is now unreferenced (the row points at the new asset) — reap it. `reapIfOrphan`
    // re-checks references, so a within-user dedup that reused the SAME asset (identical bytes) is never reaped.
    await ctx.assets.reapOrphans([existing.bundleAssetId]);

    if (reactivate) {
      await deps.activate({ caller, pluginId, bundleAssetId: stored.assetId, grants: granted });
    }

    const row = await getById(ctx.db, caller.userId, pluginId);
    if (row === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return toPluginView(row);
  };
}
