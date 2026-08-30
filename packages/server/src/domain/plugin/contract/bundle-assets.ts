// domain/plugin/contract/bundle-assets — the two shapes the #820 bundle-image route passes ACROSS slots, and
// therefore the ones that need a contract home rather than a local declaration: what the funnel produces
// (bytes + the mime its magic sniff proved) and what persistence writes (the minted CAS id keyed by the zip
// path). They are two halves of one journey — `ui/assets/<name>` → CAS asset → `plugin_assets` link — and
// keeping them together is what makes the seam legible from either end.
//
// NEITHER carries an owner: the CAS write takes the installer's `Principal` at the call site and the link's
// tenancy is inherited through `plugin_assets`' FK chain to `plugins.owner_id` (D18/D20 — ownership is
// INHERITED, not stamped on every row). A denormalized owner here would be a field nothing reads and one
// more place for it to disagree with the row.

import type { AssetId } from "@orb/kit/ids";

/** ONE already-validated bundle image, as `parseBundle` hands it out (#820 seam 11).
 *
 *  EVERY WALL IS UPSTREAM OF THIS TYPE, which is why it carries no validation of its own: the path shape, the
 *  count/size/aggregate bomb caps and the magic-byte format check all ran in `substrate/manifest` before a
 *  value of this shape could exist. `mime` is therefore the SNIFFED mime — the bytes' own answer, never a
 *  filename extension and never a caller's claim. */
export interface PluginBundleAssetBytes {
  /** The full zip entry path (`ui/assets/<name>`) — the key a UI node names and the junction row stores. */
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/** ONE `plugin_assets` link to write for a bundle-shipped image: the CAS id the store minted, the zip path it
 *  came from, and the stamp. The path is in the table's PRIMARY KEY — see the schema header for why (a bundle
 *  shipping one image at two paths dedups to a single assetId, and the path is the only thing that keeps both
 *  names resolvable). */
export interface PluginBundleAssetLink {
  readonly assetId: AssetId;
  readonly bundlePath: string;
  readonly at: number;
}
