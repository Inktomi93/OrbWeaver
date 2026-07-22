// domain/assets/contract/results — verb result shapes. StoredAsset is cross-boundary (canonical home
// @orb/contracts/assets, re-exported here); AssetMetadata is server-only. Ownership denial surfaces as
// undefined (→ 404) from getMetadata, not a typed error.

import type { AssetId, UserId } from "@orb/kit/ids";

export type { StoredAsset } from "@orb/contracts/assets";


/** An asset's owner + CAS hash + mime resolved by row id alone; undefined when no such row. */
export interface AssetCasRef {
  readonly ownerId: UserId;
  readonly hash: string;
  readonly mime: string;
}

/** The owner-gated byte read's answer (EC-B) — the CAS bytes + the stored mime of the caller's OWN asset.
 *  Distinct from `loadAssetBytes`' bare `Uint8Array | null` (the un-principal indexer read, D20). */
export interface OwnedAssetBytes {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/** The blob-serve gate answer. undefined (not this shape) signals "not found / not yours". */
export interface AssetMetadata {
  readonly mime: string;
  readonly size: number;
  /** The actual CAS owner; present only on roster-avatar exceptions (asset owned by a co-participant). */
  readonly ownerId?: string;
}

// Structurally mirrors @orb/contracts/portability's PortableFile/PortableImportOutcome so the entry root can
// wire these into a PortableEntity descriptor without this domain importing the portability contract.

export interface GalleryPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** ok:false + error for an unparseable file (never thrown); created reflects whether any row was newly written. */
export interface GalleryImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}
