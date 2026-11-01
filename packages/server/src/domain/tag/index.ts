// domain/tag — front door (the only legal external import). A sibling domain never runtime-imports tag's
// internals sideways — the corpus/import producers that stage pending character-tag rows receive an
// injected TagService at the root.

export type { TagAssemblyContext, TagService } from "./contract/service.ts";

export { createTagService } from "./service.ts";
export { createReadAttachedEntity } from "./verbs/attached-reader.ts";
export { createTagLibraryExport } from "./verbs/export.ts";
export { createTagLibraryImport } from "./verbs/import.ts";
export { createImportedCardTag } from "./verbs/import-tag.ts";
export { createSeedCardTag } from "./verbs/seed-tag.ts";
