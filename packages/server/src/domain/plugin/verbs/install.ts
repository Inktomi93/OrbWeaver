// verb: install — the trust edge. Authority = SELF (D147): any authenticated principal installs FOR
// THEMSELVES, and the row is stamped `ownerId: caller.userId`. There is no role gate — a plugin runs under
// its INSTALLER's own ceiling (the bridge closes over `caller.userId`, PL-C resolves the installer's own
// room role, `llm.quiet` spends the installer's own credential), so an install grants the caller authority
// over nothing but their own reach. The SERVER-WIDE install (one row serving every user) is the admin-gated
// variant and is NOT BUILT — see D147.
// Flow: `parseBundle` (unzip+validate the untrusted bytes — throws `ManifestInvalidError` on a bad
// zip/bomb/manifest) → the grant ⊆ declared check → per-owner slug-collision check → store the WHOLE bundle
// in the caller's CAS (kind `"plugin"`) → store each `ui/assets/` image the bundle shipped as its own CAS
// asset (#820 seam 11) → insert a `disabled` row AND its `plugin_assets` links in ONE batch (enabling is a
// second explicit act, like rules). The bundle funnel is SOURCE-AGNOSTIC: the CALLING verb states where the bytes came from (`source`,
// U8 2b) and this verb records it verbatim — absent ⇒ a file upload (`origin:"upload"`, no `sourceUrl`);
// `installFromUrl` passes `{ origin:"url", sourceUrl }` so a URL install records an HONEST origin + the URL the
// update-check re-fetches. The db CHECK enforces the `origin ⟺ sourceUrl` pairing.

import { CapabilityNotGrantedError, PluginAlreadyInstalledError } from "../contract/errors.ts";
import type { InstallPluginParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getByOwnerSlug, insertPlugin, toPluginView } from "../persistence/plugins.ts";
import { storeBundleAssets } from "../substrate/bundle-assets.ts";
import { normalizeGrant, ungrantableCapabilities } from "../substrate/grants.ts";
import { PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest.ts";

export function createInstall(ctx: PluginContext): PluginService["install"] {
  return async ({ caller, bundle, grant, source }: InstallPluginParams) => {
    // Where the bytes came from. Absent ⇒ a file upload (the transport `install` proc + the admin fan-out);
    // `installFromUrl` passes `{ origin:"url", sourceUrl:url }`. The pairing is the db CHECK's to enforce.
    const { origin, sourceUrl } = source ?? { origin: "upload" as const, sourceUrl: null };
    const { manifest, uiAssets } = parseBundle(bundle);

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
    // #820 seam 11 — the bundle's own `ui/assets/` images, each written into the INSTALLER's CAS as its own
    // asset under the caller's Principal (the shared `storeBundleAssets` writer, so install and upgrade
    // cannot drift). Ordering is load-bearing in two directions: the CAS writes precede the row so every
    // `plugin_assets` FK has a target, and the links ride the row's OWN batch below so a row can never exist
    // with half its images resolvable. A FAILURE mid-wave reaps everything this attempt wrote, the bundle zip
    // included, and rethrows — the same "reap the ids you just orphaned" rule `upgrade`/`uninstall` follow
    // rather than leaving them to the WEEKLY `assets-gc` sweep. Nothing references them yet (the row is not
    // written), so the reap can never orphan a live path, and `reapIfOrphan` re-checks each id anyway, so
    // bytes another plugin's within-owner dedup already shares are left alone.
    const bundleAssets = await storeBundleAssets(ctx.assets.store, caller, uiAssets, now);
    if (!bundleAssets.ok) {
      await ctx.assets.reapOrphans([stored.assetId, ...bundleAssets.stored]);
      throw bundleAssets.error;
    }

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
      origin,
      sourceUrl,
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
    await insertPlugin(ctx.db, row, bundleAssets.links);
    return toPluginView(row, ctx.showcase.slugs);
  };
}
