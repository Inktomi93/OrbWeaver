// runner: crew-card-evolution — CW1 STUB (D59; chat-crew-design/08 CW1). The kind is born into the
// `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; CW3
// lands the real auditor (roster-card slice → structured audit → character.proposeCardEvolution).
// Returns a `DeferredResult` (the D58 reconcile-world-state stub precedent).

import type { Runner } from "../contract/runner";

export const crewCardEvolutionRunner: Runner<"crew-card-evolution"> = (
  _ctx,
  _params,
  report,
  _signal,
) => {
  report({ message: "crew-card-evolution is a CW1 stub (no-op); CW3 lands the real runner" });
  return Promise.resolve({ deferred: true });
};
