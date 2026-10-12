import type { EmbeddingsContext } from "#domain/embeddings";

/** The embedding consumer's stored-asset read contracts, fulfilled by the canon owner. */
export type AssetEmbeddingReads = Pick<EmbeddingsContext, "loadAssetOwner" | "loadAssetKind" | "loadAssetMime" | "loadAssetHash" | "loadAssetBytes">;
