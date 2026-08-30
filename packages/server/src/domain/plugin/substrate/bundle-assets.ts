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
import type { PluginBundleAssetBytes, PluginBundleAssetLink } from "../contract/bundle-assets.ts";

/** Write every bundle image into `caller`'s CAS and return the link rows, in bundle order.
 *
 *  SEQUENTIAL by design, not by oversight: the CAS is content-addressed and de-duplicates within an owner, so
 *  two identical images in one bundle must resolve through the SAME store call ordering to the same id — and
 *  the count is bounded by `PLUGIN_UI_ASSETS_MAX_COUNT` (64), which is far below any level where fan-out
 *  would buy something worth the added failure modes on an install path.
 *
 *  A throw leaves already-stored blobs UNREFERENCED, which is the fail-safe direction: the scheduled sweep
 *  collects them, and no row ever points at bytes that are not there (the `storeFetched` put→link posture,
 *  #802). */
export async function storeBundleAssets(
  store: (caller: Principal, bytes: Uint8Array, mime: string) => Promise<StoredAsset>,
  caller: Principal,
  assets: readonly PluginBundleAssetBytes[],
  at: number,
): Promise<PluginBundleAssetLink[]> {
  const links: PluginBundleAssetLink[] = [];
  for (const asset of assets) {
    const stored = await store(caller, asset.bytes, asset.mime);
    links.push({ assetId: stored.assetId, bundlePath: asset.path, at });
  }
  return links;
}
