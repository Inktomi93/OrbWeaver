// DI bundle. `PresetContext` (what the verbs close over) is homed in `contract/service.ts` per §7.4 —
// one type home, never a `ReturnType<>` inference. This file just re-exports it under the canonical
// name for the feature root + tests. Assembled at the composition root (db + bound `audit` writer +
// injected clock/id seam) and handed to `createPresetService`. Preset sideways-imports nothing: it
// gates by `ownerId === userId`, so there's no cross-feature op and no guard to wire.

export type { PresetContext } from "./contract/service.ts";
