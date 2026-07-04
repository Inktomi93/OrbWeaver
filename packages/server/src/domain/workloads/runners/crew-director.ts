// runner: crew-director — CW1 STUB (D59; chat-crew-design/08 CW1). The kind is born into the
// `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; CW4
// lands the real director (recent-K + crew_plots → structured pass → applyDirectorPass) AFTER the
// mandated brief play-test. Returns a `DeferredResult` (the D58 reconcile-world-state stub precedent).

import type { Runner } from "../contract/runner";

export const crewDirectorRunner: Runner<"crew-director"> = (_ctx, _params, report, _signal) => {
  report({ message: "crew-director is a CW1 stub (no-op); CW4 lands the real runner" });
  return Promise.resolve({ deferred: true });
};
