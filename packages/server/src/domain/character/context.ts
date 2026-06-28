// domain/character — DI BUNDLE. The explicit `CharacterContext` interface (the bundle the verbs close over)
// is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). This file is the conventional 8-slot context slot: it re-exports that type so
// the feature root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the
// entry composition root (db + the injected clock/id determinism seam + db-bound `logAudit` + the
// cross-feature ops: the domain-event `emit`, the assets `reapAssets`, the tag `attachCardTag`) and handed
// to `createCharacterService` — character sideways-imports none of those (domain-no-cross-feature). There is
// NO guard in the bundle: every character surface is ownership-scoped (the gate is `principal.userId`), not
// admin/owner-gated (the persona precedent).

export type { CharacterContext } from "./contract/service";
