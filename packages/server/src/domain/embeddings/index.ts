// domain/embeddings — FRONT DOOR: the only legal external import. Re-exports the public surface of the vector
// substrate (the one write path + the event indexer). Cross-boundary provider result types (`EmbedResult` /
// `ImageEmbedResult`) live in `@orb/contracts/providers`; the `RoleClients` bundle in
// `@orb/contracts/role-clients` — callers import those from contracts, not through this door.

// The entry root wires these; transport/tests reference them directly.
export type { EmbeddingsContext } from "./context.ts";
export { EmbedFailedError, SpaceMismatchError } from "./contract/errors.ts";
export type { EmbeddingsHandoffRestampContext, HandoffRestampPair, HandoffRestampStatements } from "./contract/handoff-restamp.ts";
// Consumed by `discovery` + `search` + tests, not just this domain.
export type { VectorTable } from "./contract/params.ts";
export { VECTOR_TABLES } from "./contract/params.ts";
export type {
  EmbeddingsIndexer,
  EmbeddingsIndexerContext,
  EmbeddingsService,
  EmbeddingsWorkloadDeps,
  ListCharacterIds,
  ListImageAssetIds,
  LoadAssetBytes,
  LoadCardText,
} from "./contract/service.ts";
export { createEmbeddingsIndexer } from "./indexer/index.ts";
export { createHandoffRestampStatements } from "./persistence/handoff-restamp.ts";
export { createEmbeddingsService } from "./service.ts";
export { createEmbeddingsWorkloadContributions } from "./workload-contributions.ts";
