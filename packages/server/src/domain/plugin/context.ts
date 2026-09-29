// domain/plugin — DI BUNDLE. The explicit `PluginContext` interface is homed in `contract/service.ts` (§7.4
// one type home; never a `ReturnType<>` inference); this conventional 8-slot context slot re-exports it so the
// feature root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry
// composition root (db + injected clock/id seams + the CAS ops + the `PluginHostPort` runtime + the
// `PluginHostOps` op bundle + the belts) and handed to `createPluginService`. Ordinary plugin authority is
// OWNERSHIP (D147). The development-only filesystem door reads the already-resolved peer-gated `via` signal;
// it adds no privilege seam to this context.

export type { PluginContext } from "./contract/service.ts";
