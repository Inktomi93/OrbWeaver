// domain/refinery — DI BUNDLE. The explicit `RefineryContext` interface is homed in `contract/service.ts`
// (§7.4 / no-context-returntype); this conventional 8-slot context slot re-exports it so the feature root
// + tests reference the DI bundle by the canonical name (mirroring every domain). Assembled at
// `entry/compose/refinery.ts` (db + clock/id minters + the bound `summarize` thunk + the owner
// prose/preset resolvers + the four injected CHARACTER ops — refinery sideways-imports none of those).

export type { RefineryContext } from "./contract/service.ts";
