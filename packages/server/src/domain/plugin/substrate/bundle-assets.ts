// domain/plugin/substrate/bundle-assets — the ONE writer that turns a parsed bundle's `ui/assets/` images
// into CAS assets in the INSTALLER's own store, plus the link rows install/upgrade batch with their
// `plugins` row (#820 seam 11). It lives here rather than inside either verb because both verbs need
// byte-identical semantics: install and upgrade must store under the SAME Principal, with the SAME
// magic-sniffed mime, in the SAME order — and a second spelling is how one of them quietly starts trusting
// the filename extension.
//
// IT PERFORMS NO VALIDATION AND MUST NOT START. Every wall is at the trust edge in `substrate/manifest.ts`:
// the path shape, the count/size/aggregate bomb caps, and the magic-byte format check all ran before a
// `PluginBundleAsset` existed. Re-checking here would put a SECOND copy of the admitted-format set in the
// tree, and the copy that drifts is always the one nobody is looking at. This function's whole job is the
// write, and the `mime` it passes is the one the SNIFF produced — never a claim.
//
// Not `substrate/manifest.ts`: that file is stated pure + Principal-free (bytes in, typed bundle out), and a
// CAS write under a caller is neither.

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { PluginBundleAssetBytes, PluginBundleAssetLink, PluginBundleAssetStoreOutcome } from "../contract/bundle-assets.ts";

/** Write every bundle image into `caller`'s CAS and return the link rows, in bundle order.
 *
 *  SEQUENTIAL by design, not by oversight: the CAS is content-addressed and de-duplicates within an owner, so
 *  two identical images in one bundle must resolve through the SAME store call ordering to the same id — and
 *  the count is bounded by `PLUGIN_UI_ASSETS_MAX_COUNT` (64), which is far below any level where fan-out
 *  would buy something worth the added failure modes on an install path.
 *
 *  A FAILURE MID-WAVE REPORTS WHAT IT ALREADY WROTE ({@link PluginBundleAssetStoreOutcome}) instead of
 *  throwing it away. The direction was always fail-safe (unreferenced bytes, never a link to bytes that are
 *  not there — the `storeFetched` put→link posture, #802) and the weekly `assets-gc` sweep does eventually
 *  reclaim them; what was missing is that the caller could not follow this domain's OWN rule — reap the ids
 *  you just orphaned instead of leaving them to the sweep — because the ids died with the throw. */
export async function storeBundleAssets(
  store: (caller: Principal, bytes: Uint8Array, mime: string) => Promise<StoredAsset>,
  caller: Principal,
  assets: readonly PluginBundleAssetBytes[],
  at: number,
): Promise<PluginBundleAssetStoreOutcome> {
  const links: PluginBundleAssetLink[] = [];
  for (const asset of assets) {
    try {
      const stored = await store(caller, asset.bytes, asset.mime);
      links.push({ assetId: stored.assetId, bundlePath: asset.path, at });
    } catch (error) {
      return { ok: false, stored: links.map((link) => link.assetId), error };
    }
  }
  return { ok: true, links };
}
