// verb: install — the trust edge (02 §4). Authority = `can(caller,"admin",{kind:"global"})` (owner ∪ admin in
// v1 — the membrane is new security-load-bearing code; 02 §4). Flow: gate → `parseBundle` (unzip+validate the
// untrusted bytes — throws `ManifestInvalidError` on a bad zip/bomb/manifest) → the grant ⊆ declared check →
// slug-collision check → store the WHOLE bundle in the caller's CAS (kind `"plugin"`) → insert a `disabled`
// row (enabling is a second explicit act, like rules). The row lands `origin:"upload"` (the reserved single-arm
// — a future catalog fetcher feeds the SAME bundle funnel, 02 §4 rider).

import { CapabilityNotGrantedError, PluginAlreadyInstalledError } from "../contract/errors.ts";
import type { InstallPluginParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getByOwnerSlug, insertPlugin } from "../persistence/plugins.ts";
import { normalizeGrant, ungrantableCapabilities } from "../substrate/grants.ts";
import { PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest.ts";

export function createInstall(ctx: PluginContext): PluginService["install"] {
  return async ({ caller, bundle, grant }: InstallPluginParams) => {
    ctx.can(caller, "admin", { kind: "global" });

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
    const id = ctx.newPluginId();
    await insertPlugin(ctx.db, {
      id,
      ownerId: caller.userId,
      slug: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifest,
      bundleAssetId: stored.assetId,
      grantedCapabilities: granted,
      status: "disabled",
      origin: "upload",
      installedAt: now,
      updatedAt: now,
    });

    return {
      id,
      slug: manifest.id,
      name: manifest.name,
      version: manifest.version,
      status: "disabled",
      origin: "upload",
      grantedCapabilities: granted,
      builtAgainst: manifest.builtAgainst ?? null,
      consecutiveCrashes: 0,
      lastError: null,
      installedAt: now,
      updatedAt: now,
    };
  };
}
