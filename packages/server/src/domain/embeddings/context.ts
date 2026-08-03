// domain/embeddings — DI BUNDLE. The explicit `EmbeddingsContext` interface is homed in `contract/service.ts`
// (§7.4 / no-context-returntype — never a `ReturnType<>`); this conventional 8-slot context slot re-exports
// it so the feature root + tests reference the DI bundle by the canonical name (mirroring every domain). The
// bundle is ASSEMBLED at the entry composition root (db + the bound `roleClients` + the injected clock/id
// determinism seam) and handed to `createEmbeddingsService`; embeddings sideways-imports none of those
// (domain-no-cross-feature — they arrive type-only).

export type { EmbeddingsContext } from "./contract/service.ts";
