// domain/import — DI BUNDLE. The explicit `ImportContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This file is
// the conventional 8-slot context slot: it re-exports that type so the feature root + tests reference the
// DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (the resolved
// `ownerId` + the injected character.create-with-provenance / character-by-importHash / assets.store ops)
// and handed to `createImportService` — import sideways-imports none of those (domain-no-cross-feature).

export type { ImportContext } from "./contract/service";
