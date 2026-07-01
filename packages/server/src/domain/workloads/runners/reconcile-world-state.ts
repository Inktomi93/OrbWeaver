// runner: reconcile-world-state — v2 STUB (FLAG[PD-18], reserved kind, council 2026-06-25). The world-state reconciler is
// v2 (ledger §5, knowledge-cluster.md §9); it ships now as a no-op so the reserved kind keeps RUNNERS /
// `exhaustive-dispatch` green without shipping a half-built feature. Returns a `DeferredResult`.

import type { Runner } from "../contract/runner";

export const reconcileWorldStateRunner: Runner<"reconcile-world-state"> = (
  _ctx,
  _params,
  report,
  _signal,
) => {
  report({ message: "world-state reconcile is a v2 stub (no-op)" });
  return Promise.resolve({ deferred: true });
};
