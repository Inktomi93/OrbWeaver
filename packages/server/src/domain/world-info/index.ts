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
export type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
} from "./contract/params";
export type { WorldInfoContext, WorldInfoService } from "./contract/service";
export type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "./contract/views";
export { createWorldInfoService } from "./service";
