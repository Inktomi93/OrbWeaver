// runner: crew-lorebook-keeper — CW1 STUB (D59; chat-crew-design/08 CW1). The kind is born into the
// `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; CW2
// lands the real keeper (readRunInputs → buildMessages → runStructuredAgentTurn → applyKeeperResult).
// Returns a `DeferredResult` (the D58 reconcile-world-state stub precedent).

import type { Runner } from "../contract/runner";

export const crewLorebookKeeperRunner: Runner<"crew-lorebook-keeper"> = (_ctx, _params, report, _signal) => {
  report({ message: "crew-lorebook-keeper is a CW1 stub (no-op); CW2 lands the real runner" });
  return Promise.resolve({ deferred: true });
};
