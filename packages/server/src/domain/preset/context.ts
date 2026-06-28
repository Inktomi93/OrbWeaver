// domain/preset — DI BUNDLE. The explicit `PresetContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This file is
// the conventional 8-slot context slot: it re-exports that type so the feature root + tests reference the
// DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (db + the bound
// `audit` writer + the injected clock/id seam) and handed to `createPresetService` — preset sideways-
// imports nothing (it gates by `ownerId === userId`, so there is no cross-feature op and no guard to wire).

export type { PresetContext } from "./contract/service";
