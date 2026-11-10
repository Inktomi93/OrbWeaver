// Seed vectors use the production projection and retain the encoder's actual space stamp.
import data from "../embeddings.json" with { type: "json" };
import type { SeedEmbeddingResult, SeedVectorKind } from "./contract/index.ts";
import { SEED_VECTOR_KINDS } from "./contract/index.ts";

type SeedVector = (typeof data)[number] & { readonly kind: SeedVectorKind };
const vectors = data.filter((row): row is SeedVector => SEED_VECTOR_KINDS.includes(row.kind));

/** A byte or embedding-space change misses the seed cache and uses normal inference. */
export function findSeedEmbedding(hash: string, space: string, kind: string): SeedEmbeddingResult | null {
  const row = vectors.find((entry) => entry.hash === hash && entry.model === space && entry.kind === kind);
  return row === undefined ? null : { model: row.model, vector: Float32Array.from(row.vector) };
}
