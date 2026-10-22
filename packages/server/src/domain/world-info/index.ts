// domain/world-info — FRONT DOOR: the only legal external import; re-exports the public surface. The
// per-turn pool builder (chat-assembly) reads these tables directly as a db-layer consumer, NOT through
// this front door (invariant #8).

export type { ExportWorldBook, ListOwnedBookIds, WorldInfoExportAssemblyContext as WorldInfoExportContext } from "./contract/export.ts";

export type {
  AttachOwnedBooksByName,
  BulkImportLorebook,
  HasPrimaryBook,
  ImportStandaloneLorebook,
  ImportWorldInfoPort,
} from "./contract/import.ts";

export type { WorldInfoService } from "./contract/service.ts";

export { createCopyCharacterBooks } from "./persistence/duplicate-carry.ts";
export { createCopyHandoffBooks, createCountHandoffBooks } from "./persistence/handoff-copy-write.ts";
export {
  createAttachOwnedBooksByName,
  createBulkImportLorebook,
  createHasPrimaryBook,
  createImportStandaloneLorebook,
} from "./persistence/import-write.ts";
export { createLinkCarriedBooks } from "./persistence/link-carried-books.ts";
export { createWorldInfoRoomReach } from "./persistence/room-reach.ts";
export { createWorldInfoService } from "./service.ts";
export { createExport as createExportWorldBook } from "./verbs/export.ts";
export { createImport as createImportWorldBook } from "./verbs/import.ts";
export { createListOwnedBookIds } from "./verbs/list-owned-book-ids.ts";
export { createPluginWorldInfoReads } from "./verbs/plugin-reads.ts";
