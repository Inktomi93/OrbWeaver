// FRONT DOOR: the only legal external import; re-exports the public surface. `StoredAsset`/`AssetKind` live
// in `@orb/contracts/assets` instead; maintenance/DR verb param types are domain-internal (contract/maintenance.ts).

export type { AssetsContext } from "./context.ts";
export type { BackgroundStoreDeps, BackgroundStoreParams, StoreBackground } from "./contract/background-store.ts";
export { AssetContentRejectedError } from "./contract/errors.ts";
export type { GeneratedAssetStore } from "./contract/generated-store.ts";
export type { ImportAssetPort } from "./contract/import-store.ts";
export type { InlineReplyImageDeps, MaterializeBackgroundDeps, StoreInlineReplyImage } from "./contract/materialize.ts";
export type {
  AssetMetadata,
  GalleryImportOutcome,
  GalleryPortableFile,
} from "./contract/results.ts";
export type { SeedArtDeps, SeedAvatarOps, SeedPlateStoreDeps, StoreSeedPlate } from "./contract/seed-art.ts";
export type { AssetsService, AssetsWorkloadDeps } from "./contract/service.ts";
// The asset-ref CLASSIFICATION registry (values only — `AssetRef` itself stays domain-internal). Read by
// the `structure:asset-refs` verify stage's comparator, which reconciles it against the live `@orb/db`
// schema's FK→`assets.id` columns; the exports map is `"./*": "./src/*/index.ts"`, so no deeper path
// resolves and the front door is the ONLY way a reconciler outside this domain can see the registry.
export { ASSET_REFS, DERIVED_ASSET_COLUMNS } from "./persistence/asset-refs.ts";
export { createAssetsService } from "./service.ts";
export { createAssetEmbeddingReads } from "./verbs/asset-embedding-reads.ts";
export { createBackgroundStore } from "./verbs/background-store.ts";
export { createChatAssetOps } from "./verbs/chat-asset-ops.ts";
// The assets/gallery portability halves — entry root composes these into their PortableEntity descriptors.
// Not on AssetsService — a bundle descriptor, not the core path.
export { createExportAssets } from "./verbs/export-assets.ts";
export { createExportGallery } from "./verbs/export-gallery.ts";
export { createGeneratedAssetStore, createStoreGeneratedImage } from "./verbs/generated-store.ts";
export { createImageryGalleryAdd } from "./verbs/imagery-gallery-add.ts";
export { createImportAsset } from "./verbs/import-asset.ts";
export { createImportGallery } from "./verbs/import-gallery.ts";
export { createImportOwnedAsset } from "./verbs/import-owned.ts";
export { createImportAvatarStore } from "./verbs/import-store.ts";
export { createMaterializeBackground } from "./verbs/materialize-background.ts";
export { createPluginAssetReads } from "./verbs/plugin-reads.ts";
export { createSeedAvatarOps, createSeedPlateStore } from "./verbs/seed-art.ts";
export { createStoreInlineReplyImage } from "./verbs/store-inline-reply-image.ts";
export { createAssetsWorkloadContributions } from "./workload-contributions.ts";
