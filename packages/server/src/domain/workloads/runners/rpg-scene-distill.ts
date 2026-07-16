// runner: rpg-scene-distill — R1-subset STUB (D58; rpg-design/10 R10). The kind is born into the `0000_baseline`
// kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; the real crew runner
// lands with rpg-design/10 R10. Returns a `DeferredResult` (the D58 reconcile-world-state / crew-*
// stub precedent).

import type { Runner } from "../contract/runner";

export const rpgSceneDistillRunner: Runner<"rpg-scene-distill"> = (_ctx, _params, report, _signal) => {
  report({
    message: "rpg-scene-distill is an R1-subset stub (no-op); the real crew runner lands later",
  });
  return Promise.resolve({ deferred: true });
};
