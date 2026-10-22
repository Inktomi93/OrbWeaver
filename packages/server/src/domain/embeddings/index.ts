// domain/embeddings — FRONT DOOR: the only legal external import. Re-exports the public surface of the vector
// substrate (the one write path + the event indexer). Cross-boundary provider result types (`EmbedResult` /
// `ImageEmbedResult`) live in `@orb/contracts/providers`; the `RoleClients` bundle in
// `@orb/contracts/role-clients` — callers import those from contracts, not through this door.

export { EmbedFailedError, SpaceMismatchError } from "./contract/errors.ts";

// Consumed by `discovery` + `search` + tests, not just this domain.
export type { VectorTable } from "./contract/params.ts";
export { VECTOR_TABLES } from "./contract/params.ts";
export type { VacuousMemoryReceipt } from "./contract/reindex.ts";
// The entry root wires these; transport/tests reference them directly.
export type {
  EmbeddingConnectionSnapshot,
  EmbeddingsAssemblyContext as EmbeddingsContext,
  EmbeddingsIndexer,
  EmbeddingsService,
  EmbeddingsWorkloadDeps,
  ResolveEmbeddingConnection,
} from "./contract/service.ts";
export { createEmbeddingsIndexer } from "./indexer/index.ts";
export { createEmbeddingsIndexerSubscription } from "./indexer/subscription.ts";
export { createHandoffRestampStatements } from "./persistence/handoff-restamp.ts";
export { createEmbeddingsService } from "./service.ts";
export { precomputedSeedEmbedding } from "./substrate/seed-embedding.ts";
export { createEmbeddingReindexTriggers } from "./verbs/embedding-reindex-triggers.ts";
export { createGetLiveEmbedSpace } from "./verbs/get-live-embed-space.ts";
export { createMemoryEmbeddingOps } from "./verbs/memory-ops.ts";
export { createRecordUsage } from "./verbs/record-usage.ts";
export { createResolveEmbeddingConnection } from "./verbs/runtime-connection.ts";
export { createVacuousMemoryReceipt } from "./verbs/vacuous-memory-receipt.ts";

export { createVectorSweepOps } from "./verbs/vector-sweep-ops.ts";
export { createEmbeddingsWorkloadContributions } from "./workload-contributions.ts";
