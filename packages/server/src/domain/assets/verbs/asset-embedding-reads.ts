import type { AssetEmbeddingReads } from "../contract/embedding-reads.ts";
import type { AssetsService } from "../contract/service.ts";

/** Bind the stored CAS facts and absent-row byte contract consumed by trusted embedding work. */
export function createAssetEmbeddingReads(assets: Pick<AssetsService, "assetCasRefById" | "loadAssetBytes">): AssetEmbeddingReads {
  return {
    loadAssetOwner: async (assetId) => (await assets.assetCasRefById(assetId))?.ownerId ?? null,
    loadAssetKind: async (assetId) => (await assets.assetCasRefById(assetId))?.kind ?? null,
    loadAssetMime: async (assetId) => (await assets.assetCasRefById(assetId))?.mime ?? null,
    loadAssetHash: async (assetId) => (await assets.assetCasRefById(assetId))?.hash ?? null,
    loadAssetBytes: async (assetId) => (await assets.loadAssetBytes(assetId)) ?? undefined,
  };
}
