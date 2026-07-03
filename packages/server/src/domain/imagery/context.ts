// DI bundle. `ImageryContext` is declared in contract/service.ts (§7.4 one-type-home, never `ReturnType<>`);
// re-exported here so verbs/tests import the DI bundle by this canonical path.

export type { ImageryContext } from "./contract/service";
