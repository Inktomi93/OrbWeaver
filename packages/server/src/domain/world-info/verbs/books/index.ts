// verbs/books — the book-CRUD verb group barrel. One verb per file, the factory named for the FILE
// (verb-naming gate); aliased to a book-scoped name here so the composition root reads unambiguously next
// to the same-named entry factories.

export { createCreate as createCreateBook } from "./create.ts";
export { createDuplicate as createDuplicateBook } from "./duplicate.ts";
export { createGet as createGetBook } from "./get.ts";
export { createList as createListBooks } from "./list.ts";
export { createListWithUsage as createListBooksWithUsage } from "./list-with-usage.ts";
export { createRemove as createRemoveBook } from "./remove.ts";
export { createUpdate as createUpdateBook } from "./update.ts";
