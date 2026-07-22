// domain/assets/contract/results — verb result shapes. StoredAsset is cross-boundary (canonical home
// @orb/contracts/assets, re-exported here); AssetMetadata is server-only. Ownership denial surfaces as
// undefined (→ 404) from getMetadata, not a typed error.

import type { PoseLibrarySource, PoseOrientation } from "@orb/contracts/poses";
import type { AssetId, PoseLibraryId, UserId } from "@orb/kit/ids";

export type { StoredAsset } from "@orb/contracts/assets";

/** One BYO pose-library entry as the picker (C6d) reads it + the import verb returns it. `thumbnailSrc` is the
 *  owned-blob URL (`/api/blob/<hash>`), the app-gated per-user analogue of the curated set's static public URL. */
export interface OwnedPose {
  readonly id: PoseLibraryId;
  readonly assetId: AssetId;
  readonly hash: string;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly orientation: PoseOrientation;
  readonly source: PoseLibrarySource;
  readonly createdAt: number;
}

/** The honest-partial result of an import: the entries that landed + a per-item failure list (name + reason)
 *  for the images that were dropped (bad magic / undecodable), never a whole-batch throw. */
export interface ImportPosesResult {
  readonly imported: readonly OwnedPose[];
  readonly failures: readonly { readonly name: string; readonly reason: string }[];
}

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
