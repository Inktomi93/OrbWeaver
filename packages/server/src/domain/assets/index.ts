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

export type {
  AssetMetadata,
  GalleryImportOutcome,
  GalleryPortableFile,
} from "./contract/results";
export type { AssetsContext, AssetsService } from "./contract/service";
export { createAssetsService } from "./service";
// The assets-portability halves (audit G-1): the entry root composes these into the `assets` PortableEntity
// descriptor (kind:"assets", dir:"assets/") over the assembled AssetsContext. `exportAll` streams every
// blob the owner references (FK registry ∪ chat-inline refs); `importFile` restores one blob under its
// original id (hash-verified). They are NOT on AssetsService — a bundle descriptor, not the core path.
export { createExportAssets } from "./verbs/export-assets";
// The GALLERY-portability halves (export-import-portability.md §1): the entry root composes these into the
// `gallery` PortableEntity descriptor (kind:"gallery", dir:"gallery/") over the assembled AssetsContext.
// `createExportGallery` reads the owner's `gallery_items` curation rows → resolves each subject id to a
// character HANDLE → the gallery serde; `createImportGallery` re-links the handle to the owner's character id
// (or null) and restores the rows under the already-restored `assetId` (Option A). NOT on AssetsService — a
// bundle descriptor, not the core path; carry NO `@orb/contracts/portability` dep (structural mirror shapes).
export { createExportGallery } from "./verbs/export-gallery";
export { createImportAsset } from "./verbs/import-asset";
export { createImportGallery } from "./verbs/import-gallery";
