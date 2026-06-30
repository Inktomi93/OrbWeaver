// domain/assets/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `StoredAsset` (the upload POST response) is CROSS-BOUNDARY: the client redeclared it as `UploadedAsset`
// today, so its canonical home is `@orb/contracts/assets`; re-exported here for ergonomics (the front door
// + the verb signatures reference one name). `AssetMetadata` is the blob-serve gate's `{mime,size}` answer
// — server-only (the route reads it to set Content-Type/Content-Length, no client redeclaration), so it
// stays a domain-internal contract type.
//
// The maintenance verbs' results (BackfillResult/GcResult/FsckResult/ReapResult) are NOT here yet —
// FLAG[PD-26] with their verbs to the GC/backfill wave (see contract/service.ts). The error slot is
// deliberately empty: assets failures are plain `Error` (magic mismatch, missing-row-after-upsert);
// ownership denial surfaces as `undefined` (→ 404) from `getMetadata`, not a typed error.

export type { StoredAsset } from "@orb/contracts/assets";

/** The blob-serve gate answer: enough to set response headers for an owned blob. `undefined` (not this
 *  shape) is how `getMetadata` signals "not found / not yours" — see contract/service.ts.
 *  `ownerId` is present ONLY on the roster-avatar exception (PD-28): the asset is owned by a
 *  co-participant, not the caller; the blob route reads from their CAS partition. When absent (the
 *  normal owner path), the route uses `principal.userId` directly. */
export interface AssetMetadata {
  readonly mime: string;
  readonly size: number;
  /** The actual CAS owner. Present only on roster-avatar exceptions (PD-28); absent → caller owns it. */
  readonly ownerId?: string;
}
