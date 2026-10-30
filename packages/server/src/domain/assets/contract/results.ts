import type { PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";

export type { OwnedAssetBytes } from "@orb/contracts/assets";

// domain/assets/contract/results — verb result shapes that stay server-only. Ownership denial surfaces as
// undefined (→ 404) from getMetadata, not a typed error.

/** The blob-serve gate answer. undefined (not this shape) signals "not found / not yours". */
export interface AssetMetadata {
  readonly mime: string;
  readonly size: number;
  /** The actual CAS owner; present only on roster-avatar exceptions (asset owned by a co-participant). */
  readonly ownerId?: UserId;
}

/** ok:false + error for an unparseable file (never thrown); created reflects whether any row was newly written. */
export type GalleryImportOutcome =
  | (Extract<PortableImportOutcome, { readonly ok: true }> & { readonly created: boolean })
  | Extract<PortableImportOutcome, { readonly ok: false }>;
