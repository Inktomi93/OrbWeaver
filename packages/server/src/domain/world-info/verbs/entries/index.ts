// verbs/entries — the entry-CRUD verb group barrel. One verb per file; each factory carries its entry-scoped
// name so the composition root reads unambiguously next to the book factories.

export { createBackfillTitles } from "./backfill-titles.ts";
export { createCreateEntry } from "./create.ts";
export { createGetEntry } from "./get.ts";
export { createListEntries } from "./list.ts";
export { createListEntryIndex } from "./list-entry-index.ts";
export { createRemoveEntry } from "./remove.ts";
export { createReorder } from "./reorder.ts";
export { createUpdateEntry } from "./update.ts";
export { createUpsertEntries } from "./upsert-entries.ts";
