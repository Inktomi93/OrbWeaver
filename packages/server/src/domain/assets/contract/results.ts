import type { AssetKind } from "@orb/contracts/assets";
import type { PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";

export type { OwnedAssetBytes } from "@orb/contracts/assets";

// domain/assets/contract/results — verb result shapes. StoredAsset is cross-boundary (canonical home
// @orb/contracts/assets, re-exported here); AssetMetadata is server-only. Ownership denial surfaces as
// undefined (→ 404) from getMetadata, not a typed error.

export type { StoredAsset } from "@orb/contracts/assets";

/** An asset's owner + CAS hash + mime resolved by row id alone; undefined when no such row. */
export interface AssetCasRef {
  readonly kind: AssetKind;
  readonly ownerId: UserId;
  readonly hash: string;
  readonly mime: string;
}

/** The blob-serve gate answer. undefined (not this shape) signals "not found / not yours". */
export interface AssetMetadata {
  readonly mime: string;
  readonly size: number;
  /** The actual CAS owner; present only on roster-avatar exceptions (asset owned by a co-participant). */
  readonly ownerId?: UserId;
}

export interface GalleryPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** ok:false + error for an unparseable file (never thrown); created reflects whether any row was newly written. */
export type GalleryImportOutcome =
  | (Extract<PortableImportOutcome, { readonly ok: true }> & { readonly created: boolean })
  | Extract<PortableImportOutcome, { readonly ok: false }>;
