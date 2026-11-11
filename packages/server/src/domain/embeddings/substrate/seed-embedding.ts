// Seed vectors substitute only for their matching local-light encoder; generation validation remains in store.
// The packaged lookup arrives from the composition root (D160): no domain module imports the content package.

import type { FindSeedEmbeddingOp, PrecomputedEmbeddingOp } from "../contract/service.ts";

/** Resolve a packaged seed vector on an encoder that takes seeds, or leave encoding to the live provider. */
export function createPrecomputedSeedEmbedding(findSeedEmbedding: FindSeedEmbeddingOp): PrecomputedEmbeddingOp {
  return (hash, space, kind, connection) => (connection.execution.seedVectors ? findSeedEmbedding(hash, space, kind) : null);
}
