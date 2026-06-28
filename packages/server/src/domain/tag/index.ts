// domain/tag — FRONT DOOR (the only legal external import). Re-exports the public surface:
//   • the TagService contract + the view types (client consumes them via @orb/contracts/tag deep-import; the
//     service-method signatures are inferred at the tRPC boundary)
//   • the wire axes + create/update inputs (canonical home @orb/contracts/tag; re-exported for ergonomics so
//     the transport router + tests name them off the tag front door)
//   • TagNotFoundError (the one typed domain error)
//   • createTagService (the factory the entry root wires) + the TagContext DI-bundle type
// A sibling domain NEVER runtime-imports tag's internals sideways (domain-no-cross-feature): the corpus /
// import producers that stage `pending` character-tag rows receive an injected `TagService` at the root.

// The wire axes + create/update inputs (canonical home @orb/contracts/tag; re-exported for ergonomics).
export type {
  CreateTagInput,
  TagFolderType,
  TagSource,
  TagStatus,
  TagTargetType,
  UpdateTagInput,
} from "@orb/contracts/tag";
// The DI bundle the entry root assembles + hands to the factory.
export type { TagContext } from "./context";
// The one typed domain error (mapped to tRPC NOT_FOUND at the transport boundary).
export { TagNotFoundError } from "./contract/errors";
// The 11-verb service contract.
export type { TagService } from "./contract/service";
// The read-models the client receives.
export type { TagUsage, TagView, TagWithUsage } from "./contract/views";
// Factory.
export { createTagService } from "./service";
