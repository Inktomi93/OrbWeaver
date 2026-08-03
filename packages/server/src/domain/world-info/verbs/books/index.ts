// verbs/books — the book-CRUD verb group barrel. One verb per file, the factory named for the FILE
// (verb-naming gate); aliased to a book-scoped name here so the composition root reads unambiguously next
// to the same-named entry factories.

export { createCreate as createCreateBook } from "./create";
export { createDuplicate as createDuplicateBook } from "./duplicate";
export { createGet as createGetBook } from "./get";
export { createList as createListBooks } from "./list";
export { createListWithUsage as createListBooksWithUsage } from "./list-with-usage";
export { createRemove as createRemoveBook } from "./remove";
export { createUpdate as createUpdateBook } from "./update";
