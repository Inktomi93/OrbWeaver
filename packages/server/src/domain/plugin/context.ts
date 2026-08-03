// domain/plugin — DI BUNDLE. The explicit `PluginContext` interface is homed in `contract/service.ts` (§7.4
// one type home; never a `ReturnType<>` inference); this conventional 8-slot context slot re-exports it so the
// feature root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry
// composition root (db + injected clock/id seams + the `can()` seam + the CAS ops + the `PluginHostPort` runtime
// + the `PluginHostOps` op bundle) and handed to `createPluginService`.

export type { PluginContext } from "./contract/service.ts";
