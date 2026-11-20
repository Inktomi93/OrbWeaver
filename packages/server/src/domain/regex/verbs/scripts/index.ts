// verbs/scripts — the library CRUD verb group barrel. One verb per file; the composition
// root imports the factories from here.

export { createBulkRemove } from "./bulk-remove.ts";
export { createBulkSetAxes } from "./bulk-set-axes.ts";
export { createBulkSetEnabled } from "./bulk-set-enabled.ts";
export { createCount } from "./count.ts";
export { createCreate } from "./create.ts";
export { createDuplicate } from "./duplicate.ts";
export { createList } from "./list.ts";
export { createListUnattached } from "./list-unattached.ts";
export { createRemove } from "./remove.ts";
export { createRemoveUnattachedScripts } from "./remove-unattached.ts";
export { createUpdate } from "./update.ts";
