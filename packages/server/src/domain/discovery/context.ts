// domain/discovery — DI BUNDLE. The explicit `DiscoveryContext` interface is homed in `contract/service.ts`
// (§7.4 / no-context-returntype — never a `ReturnType<>`); this conventional 8-slot context slot re-exports
// it so the feature root + tests reference the DI bundle by the canonical name (mirroring every domain). The
// bundle is ASSEMBLED at the entry composition root (db + the injected clock/id determinism seam + the bound
// `summarize` thunk + the injected `embeddings.writeHubScores` seam) and handed to `createDiscoveryService`;
// discovery sideways-imports none of those (domain-no-cross-feature — they arrive type-only).

export type { DiscoveryContext } from "./contract/service.ts";
