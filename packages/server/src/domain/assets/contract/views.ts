// domain/assets/contract/views — the read-view shapes for the gallery surfaces (gallery-design §1.2/§1.3).
// Both are CROSS-BOUNDARY (the client gallery reads them off tRPC), so their canonical home is
// `@orb/contracts/assets` (the wire) — re-exported here TYPE-ONLY so the verb signatures + the front door
// reference one name (mirroring how `results.ts` re-exports `StoredAsset`). Both carry `animated` (G2, the
// stored `assets.animated` byte-fact the grid reads to skip `?w=` variants) — see `@orb/contracts/assets`.

export type { AssetBlobRef, AssetListItem, GalleryItemView } from "@orb/contracts/assets";
