// domain/world-info — FRONT DOOR: the only legal external import; re-exports the public surface. The
// per-turn pool builder (chat-assembly) reads these tables directly as a db-layer consumer, NOT through
// this front door (invariant #8).

export { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
export type { WorldInfoContext } from "./context";
export { WorldInfoNotFoundError } from "./contract/errors";
export type { ExportedWorldBook, ExportWorldBook, WorldInfoExportContext } from "./contract/export";
export type { CopyHandoffBooks, HandoffCardPair, WorldInfoHandoffCopyContext } from "./contract/handoff-copy";
export type {
  BulkImportLorebook,
  CopyCharacterBooks,
  ImportStandaloneLorebook,
  ImportWorldBook,
  ImportWorldBookContext,
  ImportWorldBookOutcome,
  LinkCarriedBooks,
  LinkCarriedBooksResult,
  WorldInfoDuplicateCarryContext,
  WorldInfoImportContext,
} from "./contract/import";
export type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
} from "./contract/params";
export type { WorldInfoService } from "./contract/service";
export type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "./contract/views";
export { createCopyCharacterBooks } from "./persistence/duplicate-carry";
export { createCopyHandoffBooks } from "./persistence/handoff-copy-write";
export {
  createBulkImportLorebook,
  createImportStandaloneLorebook,
} from "./persistence/import-write";
export { createLinkCarriedBooks } from "./persistence/link-carried-books";
export { createWorldInfoService } from "./service";
export { createExport as createExportWorldBook } from "./verbs/export";
export { createImport as createImportWorldBook } from "./verbs/import";
