// verbs/entries — the entry-CRUD verb group barrel. One verb per file, the factory named for the FILE
// (verb-naming gate); aliased to an entry-scoped name here so the composition root reads unambiguously next
// to the same-named book factories.

export { createBackfillTitles } from "./backfill-titles.ts";
export { createCreate as createCreateEntry } from "./create.ts";
export { createGet as createGetEntry } from "./get.ts";
export { createList as createListEntries } from "./list.ts";
export { createListConstantCanon } from "./list-constant-canon.ts";
export { createListEntryIndex } from "./list-entry-index.ts";
export { createRemove as createRemoveEntry } from "./remove.ts";
export { createReorder } from "./reorder.ts";
export { createUpdate as createUpdateEntry } from "./update.ts";
export { createUpsertEntries } from "./upsert-entries.ts";
