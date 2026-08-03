// domain/connection — DI BUNDLE. The explicit `ConnectionContext` interface (the bundle the verbs close
// over) is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). This conventional 8-slot context slot re-exports that type so the feature root
// + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition
// root (db + the injected clock + credentials.resolve + providers.fetchOrCatalog + settings.loadUserSettings)
// and handed to `createConnectionService` — connection sideways-imports none of those (domain-no-cross-feature;
// the cross-feature/infra edges are type-only on the contract).

export type { ConnectionContext } from "./contract/service.ts";
