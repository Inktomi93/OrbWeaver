// domain/databank — FRONT DOOR: the only legal external import; re-exports the public surface. The tRPC
// router reaches `DatabankService`; the entry composition root additionally builds `createDatabankIngest`
// (the workload-env ingest product) and injects `resolveActiveDocumentIds` into `search.documents` (DB5).
// The per-turn chat GATHER op + the search lens are later waves (DB5/DB6) — not exported here yet.

export { DatabankCharacterNotFoundError, DocumentNotFoundError, ScrapeFailedError } from "./contract/errors.ts";
export type {
  DatabankPortabilityAssemblyContext as DatabankPortabilityContext,
  ExportDocument,
  ImportDocument,
  ListOwnedDocumentIds,
} from "./contract/portability.ts";
export type { DatabankAssemblyContext as DatabankContext, DatabankIngest, DatabankService, DatabankWorkloadDeps } from "./contract/service.ts";

export { createDatabankIngest } from "./ingest/index.ts";
export { createExportDocument, createImportDocument, createListOwnedDocumentIds } from "./persistence/portability-write.ts";
export { createDatabankRoomReach } from "./persistence/room-reach.ts";
export { resolveActiveDocumentIds, resolveActiveDocumentScope } from "./persistence/scope.ts";
export { createDatabankService } from "./service.ts";
export { createGatherDatabankForTurn } from "./substrate/turn-retrieval.ts";
export { createDatabankWorkloadContributions } from "./workload-contributions.ts";
