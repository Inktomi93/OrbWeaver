// domain/databank — FRONT DOOR: the only legal external import; re-exports the public surface. The tRPC
// router reaches `DatabankService`; the entry composition root additionally builds `createDatabankIngest`
// (the workload-env ingest product) and injects `resolveActiveDocumentIds` into `search.documents` (DB5).
// The per-turn chat GATHER op + the search lens are later waves (DB5/DB6) — not exported here yet.

export type { DatabankContext } from "./context";
export { DatabankCharacterNotFoundError, DocumentNotFoundError, ScrapeFailedError } from "./contract/errors";
export type { DatabankIngest, DatabankService } from "./contract/service";
export type { ActiveChatDocumentView, DocumentAttachmentsView, DocumentDetailView, DocumentView } from "./contract/views";
export { createDatabankIngest } from "./ingest";
export { resolveActiveDocumentIds } from "./persistence/scope";
export { createDatabankService } from "./service";
