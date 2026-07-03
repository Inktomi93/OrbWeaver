// domain/assets/contract/views — the read-view shapes for the gallery surfaces (gallery-design §1.2/§1.3).
// Both are CROSS-BOUNDARY (the client gallery reads them off tRPC), so their canonical home is
// `@orb/contracts/assets` (the wire) — re-exported here TYPE-ONLY so the verb signatures + the front door
// reference one name (mirroring how `results.ts` re-exports `StoredAsset`). NO `animated` on either: it's
// deferred to G2 (the Phase-6 grid's animated bailout) — see the schemas in `@orb/contracts/assets`.

export type { AssetListItem, GalleryItemView } from "@orb/contracts/assets";
