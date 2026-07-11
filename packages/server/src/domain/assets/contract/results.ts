// domain/assets/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `StoredAsset` (the upload POST response) is CROSS-BOUNDARY: the client redeclared it as `UploadedAsset`
// today, so its canonical home is `@orb/contracts/assets`; re-exported here for ergonomics (the front door
// + the verb signatures reference one name). `AssetMetadata` is the blob-serve gate's `{mime,size}` answer
// — server-only (the route reads it to set Content-Type/Content-Length, no client redeclaration), so it
// stays a domain-internal contract type.
//
// The maintenance verbs' params/results (Backfill/Gc/Fsck/Reap/Rebuild) live in `contract/maintenance.ts`
// (grouped with the wave, domain-internal — CLI/workload only). The error slot is deliberately empty: assets
// failures are plain `Error` (magic mismatch, missing-row-after-upsert); ownership denial surfaces as
// `undefined` (→ 404) from `getMetadata`, not a typed error.

import type { UserId } from "@orb/kit/ids";

export type { StoredAsset } from "@orb/contracts/assets";

/** An asset's owner + CAS hash + mime resolved by ROW ID alone (D20 — un-principal, like `loadAssetBytes`).
 *  A pure row lookup: no bytes, no gate. The chat image-resolution seam (`resolveImageRefToUrl`) reads it to
 *  gate a canon `asset:<id>` ref by OWNER (a chat-scoped reference-check — is the owner a present participant
 *  of the referencing chat?) and to build the data-URI `mime`; `hash` is the CAS coordinate its sibling
 *  `loadAssetBytes` keys the per-user store on. `undefined` when no such row. */
export interface AssetCasRef {
  readonly ownerId: UserId;
  readonly hash: string;
  readonly mime: string;
}

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
