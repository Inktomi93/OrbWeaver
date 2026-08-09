// verbs/scripts — the library CRUD verb group barrel. One verb per file (verb-naming gate); the composition
// root imports the factories from here.

export { createBulkRemove } from "./bulk-remove.ts";
export { createBulkSetEnabled } from "./bulk-set-enabled.ts";
export { createBulkSetPlacement } from "./bulk-set-placement.ts";
export { createCreate } from "./create.ts";
export { createDuplicate } from "./duplicate.ts";
export { createGet } from "./get.ts";
export { createList } from "./list.ts";
export { createRemove } from "./remove.ts";
export { createUpdate } from "./update.ts";
