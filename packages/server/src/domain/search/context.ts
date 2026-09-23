// domain/search — DI BUNDLE. The explicit `SearchContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). This conventional 8-slot context slot re-exports that type so the feature root
// + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition
// root (db + the required `roleClients` bundle, filled per-role via `connection.resolveRole`) and handed to
// `createSearchService` — search sideways-imports none of those (domain-no-cross-feature). search is
// READ-ONLY: `db` is typed `ReadOnlyDb` (`@orb/db` — `select`/`query` only), so a write call is a `tsc`
// error, not just a behavioral convention (invariant #3).

export type { SearchContext } from "./contract/service.ts";
