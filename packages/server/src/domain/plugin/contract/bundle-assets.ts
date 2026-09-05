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

/** What the image wave reports back. It is a TOTAL outcome rather than a throw because the failure arm has to
 *  carry a VALUE the caller needs: the ids it managed to write before it stopped. A bare throw discards them,
 *  and an id nobody remembers cannot be reaped by the verb that made it.
 *
 *  The blobs are not LOST either way — the weekly `assets-gc` mark-sweep (`entry/boot/seed-cas-schedules.ts`)
 *  reclaims an unreferenced row past its one-hour put→link grace. But this domain's rule is that a verb reaps
 *  THE IDS IT JUST ORPHANED rather than leaving them to the sweep (`schema/plugin.ts`; `upgrade`/`uninstall`
 *  both do it), and the failure path had no way to follow it: up to a week of storage for bytes we can name
 *  right now. The failing verb reaps `stored` and rethrows `error` unchanged, so what a caller sees is still
 *  the original storage failure. */
export type PluginBundleAssetStoreOutcome =
  | { readonly ok: true; readonly links: readonly PluginBundleAssetLink[] }
  | { readonly ok: false; readonly stored: readonly AssetId[]; readonly error: unknown };
