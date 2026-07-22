// domain/databank — DI BUNDLE. The explicit `DatabankContext` interface is homed in `contract/service.ts`
// (§7.4 — one type home; never a `ReturnType<>` inference); this conventional 8-slot context slot re-exports
// it so the feature root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at
// the entry composition root (db + injected clock/id + the injected cross-feature ops) and handed to
// `createDatabankService` / `createDatabankIngest`.

export type { DatabankContext } from "./contract/service";
