// domain/persona — DI BUNDLE. The explicit `PersonaContext` interface (the bundle the verbs close over)
// is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This file
// is the conventional 8-slot context slot: it re-exports that type so the feature root + tests reference
// the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (db + the
// injected clock/id determinism seam + `logAudit` pre-bound to db) and handed to `createPersonaService` —
// persona sideways-imports none of those (domain-no-cross-feature). There is NO guard in the bundle: every
// persona surface is ownership-scoped (the gate is `principal.userId`), not admin/owner-gated.

export type { PersonaContext } from "./contract/service";
