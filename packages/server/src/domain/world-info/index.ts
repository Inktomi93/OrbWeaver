// domain/world-info — FRONT DOOR: the only legal external import; re-exports the public surface.
//   • the WorldInfoService contract + WorldInfoContext DI bundle (the entry root assembles + wires it)
//   • the view types (BookView · EntryView · BookAttachmentView) + the role axis (WorldBookRole +
//     WORLD_BOOK_ROLES — the runtime const, re-exported here from the exempt front door; verbs/views import
//     the type, the tRPC router + client read the value)
//   • the wire INPUT types (canonical home @orb/contracts/world-info; re-exported for ergonomics)
//   • WorldInfoNotFoundError (so the transport + tests discriminate it past the base DomainNotFoundError)
//   • createWorldInfoService (the factory the entry root wires over the assembled WorldInfoContext)
//
// The chat attachment scope (PD-30 cleared — contract/service.ts header): attach/detach/list are
// membership-scoped through the injected chat guards and emit `WiBusEvent` via the injected chat-bus emit.
// The per-turn POOL builder (the GATHER that unions all scopes + drives the kit keyword/placement
// resolvers) is a chat-assembly concern and reads these tables as a db-layer consumer — it does NOT go
// through this front door (invariant #8).

export { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
export { WorldInfoNotFoundError } from "./contract/errors";
// The STANDALONE (`worlds/*.json`) portability EXPORT op DI bundle + result (W-worldinfo;
// export-import-portability.md §1) — the entry root composes it into the delivery-core registry descriptor.
export type { ExportedWorldBook, ExportWorldBook, WorldInfoExportContext } from "./contract/export";
// The world-info-OWNED lorebook bulk-import WRITE op (Option B; PD-77) + its DI bundle — the entry root
// constructs `WorldInfoImportContext` and wires `createBulkImportLorebook` into `import`'s `importLorebook`.
// The STANDALONE import op types (the `worlds/*.json` unattached path) ride alongside.
export type {
  BulkImportLorebook,
  ImportStandaloneLorebook,
  ImportWorldBook,
  ImportWorldBookContext,
  ImportWorldBookOutcome,
  WorldInfoImportContext,
} from "./contract/import";
export type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
} from "./contract/params";
export type { WorldInfoContext, WorldInfoService } from "./contract/service";
export type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "./contract/views";
// The STANDALONE unattached WRITE op (`worlds/*.json` import target; dedup on `(ownerId, name)`, R6).
export {
  createBulkImportLorebook,
  createImportStandaloneLorebook,
} from "./persistence/import-write";
export { createWorldInfoService } from "./service";
// The STANDALONE portability verbs (W-worldinfo) — aliased for an unambiguous public name; the entry root
// wires `createExportWorldBook` over `WorldInfoExportContext` and `createImportWorldBook` over the injected
// `createImportStandaloneLorebook`, then composes both into the delivery-core registry descriptor.
export { createExport as createExportWorldBook } from "./verbs/export";
export { createImport as createImportWorldBook } from "./verbs/import";
