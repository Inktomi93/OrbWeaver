// Seed vectors use the production projection and retain the encoder's actual space stamp.
import data from "../embeddings.json" with { type: "json" };

interface SeedVector {
  readonly hash: string;
  readonly model: string;
  readonly kind: string;
  readonly vector: readonly number[];
}
const vectors: readonly SeedVector[] = data;

/** A byte or embedding-space change misses the seed cache and uses normal inference. */
export function findSeedEmbedding(hash: string, space: string, kind: string): { readonly model: string; readonly vector: Float32Array<ArrayBuffer> } | null {
  const row = vectors.find((entry) => entry.hash === hash && entry.model === space && entry.kind === kind);
  return row === undefined ? null : { model: row.model, vector: Float32Array.from(row.vector) };
}
