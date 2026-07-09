// runner: databank-ingest — DB2-tables STUB (D49 #5; databank-design/02). The kind is born into the
// `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; DB2
// proper lands the real chunk/extract/embed ingest pass. Returns a `DeferredResult` (the D58
// reconcile-world-state / crew-* stub precedent).

import type { Runner } from "../contract/runner";

export const databankIngestRunner: Runner<"databank-ingest"> = (_ctx, _params, report, _signal) => {
  report({ message: "databank-ingest is a DB2-tables stub (no-op); DB2 proper lands the runner" });
  return Promise.resolve({ deferred: true });
};
