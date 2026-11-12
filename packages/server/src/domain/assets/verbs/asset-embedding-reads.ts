import type { AssetEmbeddingReads } from "@orb/contracts/assets";
import type { AssetsService } from "../contract/service.ts";

/** Bind the stored CAS facts and absent-row byte contract consumed by trusted embedding work. */
export function createAssetEmbeddingReads(assets: Pick<AssetsService, "assetCasRefById" | "loadAssetBytes">): AssetEmbeddingReads {
  return {
    loadAssetOwner: async (assetId) => (await assets.assetCasRefById(assetId))?.ownerId ?? null,
    loadAssetKinds: async (assetId) => (await assets.assetCasRefById(assetId))?.kinds ?? null,
    loadAssetMime: async (assetId) => (await assets.assetCasRefById(assetId))?.mime ?? null,
    loadAssetHash: async (assetId) => (await assets.assetCasRefById(assetId))?.hash ?? null,
    loadAssetBytes: async (assetId) => (await assets.loadAssetBytes(assetId)) ?? undefined,
  };
}
