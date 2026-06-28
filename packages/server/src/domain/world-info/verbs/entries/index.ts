// verbs/entries — the entry-CRUD verb group barrel. One verb per file, the factory named for the FILE
// (verb-naming gate); aliased to an entry-scoped name here so the composition root reads unambiguously next
// to the same-named book factories.

export { createBackfillTitles } from "./backfill-titles";
export { createCreate as createCreateEntry } from "./create";
export { createGet as createGetEntry } from "./get";
export { createList as createListEntries } from "./list";
export { createRemove as createRemoveEntry } from "./remove";
export { createReorder as createApplyEntryOrder } from "./reorder";
export { createUpdate as createUpdateEntry } from "./update";
