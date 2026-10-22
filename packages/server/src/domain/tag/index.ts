// domain/tag — front door (the only legal external import). A sibling domain never runtime-imports tag's
// internals sideways — the corpus/import producers that stage pending character-tag rows receive an
// injected TagService at the root.

export type { ImportTagPort } from "./contract/import-tag.ts";
export type { TagLibraryImportResult } from "./contract/results.ts";

export type { TagAssemblyContext as TagContext, TagService } from "./contract/service.ts";

export { createTagService } from "./service.ts";
export { createReadAttachedEntity } from "./verbs/attached-reader.ts";
export { createExport as createTagLibraryExport } from "./verbs/export.ts";
export { createImport as createTagLibraryImport } from "./verbs/import.ts";
export { createImportedCardTag } from "./verbs/import-tag.ts";
export { createSeedCardTag } from "./verbs/seed-tag.ts";
