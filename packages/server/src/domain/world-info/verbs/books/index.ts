// verbs/books — the book-CRUD verb group barrel. One verb per file; each factory carries its book-scoped name
// so the composition root reads unambiguously next to the entry factories.

export { createCount } from "./count.ts";
export { createCreateBook } from "./create.ts";
export { createDuplicateBook } from "./duplicate.ts";
export { createGetBook } from "./get.ts";
export { createListBooks } from "./list.ts";
export { createListBooksWithUsage } from "./list-with-usage.ts";
export { createRemoveBook } from "./remove.ts";
export { createUpdateBook } from "./update.ts";
