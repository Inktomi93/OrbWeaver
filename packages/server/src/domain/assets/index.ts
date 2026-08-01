// FRONT DOOR: the only legal external import; re-exports the public surface. `StoredAsset`/`AssetKind` live
// in `@orb/contracts/assets` instead; maintenance/DR verb param types are domain-internal (contract/maintenance.ts).

export type { AssetsContext } from "./context";
export type {
  AssetMetadata,
  GalleryImportOutcome,
  GalleryPortableFile,
} from "./contract/results";
export type { AssetsService, AssetsWorkloadDeps } from "./contract/service";
export { createAssetsService } from "./service";
// The assets/gallery portability halves — entry root composes these into their PortableEntity descriptors.
// Not on AssetsService — a bundle descriptor, not the core path.
export { createExportAssets } from "./verbs/export-assets";
export { createExportGallery } from "./verbs/export-gallery";
export { createImportAsset } from "./verbs/import-asset";
export { createImportGallery } from "./verbs/import-gallery";
export { createAssetsWorkloadContributions } from "./workload-contributions";
