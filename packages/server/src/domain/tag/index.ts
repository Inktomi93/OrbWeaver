// domain/tag — FRONT DOOR (the only legal external import). Re-exports the public surface:
//   • the TagService contract + the view types (client consumes them via @orb/contracts/tag deep-import; the
//     service-method signatures are inferred at the tRPC boundary)
//   • the wire axes + create/update inputs (canonical home @orb/contracts/tag; re-exported for ergonomics so
//     the transport router + tests name them off the tag front door)
//   • TagNotFoundError (the one typed domain error)
//   • createTagService (the factory the entry root wires) + the TagContext DI-bundle type
// A sibling domain NEVER runtime-imports tag's internals sideways (domain-no-cross-feature): the corpus /
// import producers that stage `pending` character-tag rows receive an injected `TagService` at the root.

export type {
  CreateTagInput,
  TagFolderType,
  TagSource,
  TagStatus,
  TagTargetType,
  UpdateTagInput,
} from "@orb/contracts/tag";
export type { TagContext } from "./context";
export { TagNotFoundError } from "./contract/errors";
export type { TagService } from "./contract/service";
export type { TagUsage, TagView, TagWithUsage } from "./contract/views";
export { createTagService } from "./service";
