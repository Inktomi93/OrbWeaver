// domain/tag — front door (the only legal external import). A sibling domain never runtime-imports tag's
// internals sideways — the corpus/import producers that stage pending character-tag rows receive an
// injected TagService at the root.

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
export type { TagLibraryImportResult } from "./contract/results";
export type { TagService } from "./contract/service";
export type { TagUsage, TagView, TagWithUsage } from "./contract/views";
export { createTagService } from "./service";
export { createExport as createTagLibraryExport } from "./verbs/export";
export { createImport as createTagLibraryImport } from "./verbs/import";
