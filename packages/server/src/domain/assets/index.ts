// domain/assets — FRONT DOOR: the only legal external import; re-exports the public surface.
//   • the AssetsService contract (the transport + entry consume it; client infers via tRPC where relevant)
//   • AssetMetadata (the blob-serve gate's `{mime,size}` answer — the entry/http blob route reads it)
//   • createAssetsService (the factory the entry root wires over the assembled AssetsContext)
//
// `StoredAsset` + `AssetKind` are NOT re-exported here — their canonical home is `@orb/contracts/assets`
// (the wire), imported down directly by the client + transport. `BLOB_ROUTE`/`blobUrl` are
// `@orb/contracts/assets`; `isAssetHash` is `@orb/kit/assets`; `BLOB_WIDTHS`/`snapBlobWidth` are
// domain-internal POLICY (`substrate/variant-policy`, imported down by the entry blob route) — none re-exported.
//
// FLAG[PD-26]: the maintenance verbs' result/param types (Backfill/Gc/Fsck/Reap) join this surface
// with their verbs in the GC/backfill wave (see service.ts).

export type { AssetMetadata } from "./contract/results";
export type { AssetsService } from "./contract/service";
export { createAssetsService } from "./service";
