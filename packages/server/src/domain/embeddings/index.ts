// domain/embeddings — FRONT DOOR: the only legal external import. Re-exports the public surface of the vector
// substrate (the one write path + the event indexer). Cross-boundary provider result types (`EmbedResult` /
// `ImageEmbedResult`) live in `@orb/contracts/providers`; the `RoleClients` bundle in
// `@orb/contracts/role-clients` — callers import those from contracts, not through this door.

// The entry root wires these; transport/tests reference them directly.
export type { EmbeddingsContext } from "./context";
export { EmbedFailedError, SpaceMismatchError } from "./contract/errors";
// Consumed by `discovery` + `search` + tests, not just this domain.
export type { VectorTable } from "./contract/params";
export { VECTOR_TABLES } from "./contract/params";
export type {
  EmbeddingsIndexer,
  EmbeddingsIndexerContext,
  EmbeddingsService,
  EmbeddingsServiceDeps,
  ListCharacterIds,
  ListImageAssetIds,
  LoadAssetBytes,
  LoadCardText,
} from "./contract/service";

export { createEmbeddingsIndexer } from "./indexer";
export { createEmbeddingsService } from "./service";
