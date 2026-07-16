// runner: expressions-sprite-sheet — E1 STUB (D49 #4; expressions-design/05 E1). The kind is born into
// the `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; E4
// lands the real sheet-generation pass (imagery + infra/image + assets ops). Returns a `DeferredResult`
// (the D58 reconcile-world-state / crew-* stub precedent).

import type { Runner } from "../contract/runner";

export const expressionsSpriteSheetRunner: Runner<"expressions-sprite-sheet"> = (_ctx, _params, report, _signal) => {
  report({ message: "expressions-sprite-sheet is an E1 stub (no-op); E4 lands the real runner" });
  return Promise.resolve({ deferred: true });
};
