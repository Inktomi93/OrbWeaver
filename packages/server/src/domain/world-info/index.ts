// domain/world-info — FRONT DOOR: the only legal external import; re-exports the public surface. The
// per-turn pool builder (chat-assembly) reads these tables directly as a db-layer consumer, NOT through
// this front door (invariant #8).

export { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
export type { WorldInfoContext } from "./context.ts";
export { WorldInfoNotFoundError } from "./contract/errors.ts";
export type { ExportedWorldBook, ExportWorldBook, ListOwnedBookIds, WorldInfoExportContext } from "./contract/export.ts";
export type { CopyHandoffBooks, CountHandoffBooks, HandoffCardPair, WorldInfoHandoffCopyContext } from "./contract/handoff-copy.ts";
export type {
  AttachOwnedBooksByName,
  BulkImportLorebook,
  CopyCharacterBooks,
  HasPrimaryBook,
  ImportStandaloneLorebook,
  ImportWorldBook,
  ImportWorldBookContext,
  ImportWorldBookOutcome,
  LinkCarriedBooks,
  LinkCarriedBooksResult,
  WorldInfoDuplicateCarryContext,
  WorldInfoImportContext,
} from "./contract/import.ts";
export type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
} from "./contract/params.ts";
export type { WorldInfoService } from "./contract/service.ts";
export type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "./contract/views.ts";
export { createCopyCharacterBooks } from "./persistence/duplicate-carry.ts";
export { createCopyHandoffBooks, createCountHandoffBooks } from "./persistence/handoff-copy-write.ts";
export {
  createAttachOwnedBooksByName,
  createBulkImportLorebook,
  createHasPrimaryBook,
  createImportStandaloneLorebook,
} from "./persistence/import-write.ts";
export { createLinkCarriedBooks } from "./persistence/link-carried-books.ts";
export { createWorldInfoService } from "./service.ts";
export { createExport as createExportWorldBook } from "./verbs/export.ts";
export { createImport as createImportWorldBook } from "./verbs/import.ts";
export { createListOwnedBookIds } from "./verbs/list-owned-book-ids.ts";
