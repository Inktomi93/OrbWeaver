// domain/embeddings — FRONT DOOR: the only legal external import. Re-exports the public surface of the vector
// substrate (the one write path + the event indexer). Cross-boundary provider result types (`EmbedResult` /
// `ImageEmbedResult`) live in `@orb/contracts/providers`; the `RoleClients` bundle in
// `@orb/contracts/role-clients` — callers import those from contracts, not through this door.

// Typed errors
export { EmbedFailedError, SpaceMismatchError } from "./contract/errors";

// The vector-table registry (consumed by `discovery` + `search` + tests)
export type { VectorTable } from "./contract/params";
export { VECTOR_TABLES } from "./contract/params";

// Service + indexer types (the entry root wires these; transport/tests reference them)
export type {
  EmbeddingsContext,
  EmbeddingsIndexer,
  EmbeddingsIndexerContext,
  EmbeddingsService,
  EmbeddingsServiceDeps,
  LoadAssetBytes,
  LoadCardText,
} from "./contract/service";

// Factories
export { createEmbeddingsIndexer } from "./indexer";
export { createEmbeddingsService } from "./service";
