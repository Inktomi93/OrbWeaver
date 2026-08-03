// domain/databank — FRONT DOOR: the only legal external import; re-exports the public surface. The tRPC
// router reaches `DatabankService`; the entry composition root additionally builds `createDatabankIngest`
// (the workload-env ingest product) and injects `resolveActiveDocumentIds` into `search.documents` (DB5).
// The per-turn chat GATHER op + the search lens are later waves (DB5/DB6) — not exported here yet.

export type { DatabankContext } from "./context.ts";
export { DatabankCharacterNotFoundError, DocumentNotFoundError, ScrapeFailedError } from "./contract/errors.ts";
export type {
  DatabankImportOutcome,
  DatabankPortabilityContext,
  ExportDocument,
  ExportedDocumentFile,
  ImportDocument,
  ListOwnedDocumentIds,
} from "./contract/portability.ts";
export type { DatabankIngest, DatabankService, DatabankWorkloadDeps } from "./contract/service.ts";
export type { ActiveChatDocumentView, DocumentAttachmentsView, DocumentDetailView, DocumentView } from "./contract/views.ts";
export { createDatabankIngest } from "./ingest/index.ts";
export { createExportDocument, createImportDocument, createListOwnedDocumentIds } from "./persistence/portability-write.ts";
export { resolveActiveDocumentIds } from "./persistence/scope.ts";
export { createDatabankService } from "./service.ts";
export { createDatabankWorkloadContributions } from "./workload-contributions.ts";
