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
export type { TagContext } from "./context.ts";
export { TagNotFoundError } from "./contract/errors.ts";
export type { TagLibraryImportResult } from "./contract/results.ts";
export type { TagService } from "./contract/service.ts";
export type { TagUsage, TagView, TagWithUsage } from "./contract/views.ts";
export { createTagService } from "./service.ts";
export { createExport as createTagLibraryExport } from "./verbs/export.ts";
export { createImport as createTagLibraryImport } from "./verbs/import.ts";
