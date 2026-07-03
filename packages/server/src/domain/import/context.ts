// domain/import — DI BUNDLE. `ImportContext` is homed in contract/service.ts per §7.4 (one type home,
// never `ReturnType<>`); this file is the conventional context.ts re-export slot so the root + tests use
// the canonical name. Assembled at the entry composition root from the resolved `ownerId` + the injected
// character.create-with-provenance / character-by-importHash / assets.store ops — import sideways-imports
// none of those (domain-no-cross-feature).

export type { ImportContext } from "./contract/service";
