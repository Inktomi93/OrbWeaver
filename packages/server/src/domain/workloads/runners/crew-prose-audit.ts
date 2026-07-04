// runner: crew-prose-audit — CW1 STUB (D59; chat-crew-design/08 CW1). The kind is born into the
// `0000_baseline` kind CHECK with a no-op runner so `RUNNERS`/`exhaustive-dispatch` stay green; CW5
// lands the real auditor (variant + window → structured audit → crew_edit_proposals insert).
// Returns a `DeferredResult` (the D58 reconcile-world-state stub precedent).

import type { Runner } from "../contract/runner";

export const crewProseAuditRunner: Runner<"crew-prose-audit"> = (
  _ctx,
  _params,
  report,
  _signal,
) => {
  report({ message: "crew-prose-audit is a CW1 stub (no-op); CW5 lands the real runner" });
  return Promise.resolve({ deferred: true });
};
