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
// The maintenance/DR verbs (PD-26 + PD-84) are on `AssetsService`, but their param/result types
// (Backfill/Gc/Fsck/Reap/Rebuild) are DOMAIN-INTERNAL (`contract/maintenance.ts`) — CLI/workload consumers
// only, no client — so they are NOT re-exported here (a workload imports the service type; see service.ts).

export type { AssetMetadata } from "./contract/results";
export type { AssetsService } from "./contract/service";
export { createAssetsService } from "./service";
