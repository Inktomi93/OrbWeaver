// domain/workloads/substrate/reserved-contributions — the RESERVED kinds: registered in the tuple, with no
// owning domain yet. They live here (not in a domain) precisely because they have no owner — and they carry
// ZERO domain knowledge, which is what makes that legal.
//
// A reserved kind exists so the axis is stable: removing it and re-adding it later would churn the db CHECK,
// the golden mirror, and the client's exhaustive Records. It is hidden from the run UI by its
// `WORKLOAD_KIND_MODES` `stub: true` policy — the mode-policy flip rides the SAME change as the real body,
// which by then lands in the OWNING domain's `workload-contributions.ts`, and this file shrinks.

import type { DeferredResult } from "@orb/contracts/workloads";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "../contract/contribution.ts";

/**
 * `reconcile-world-state` — FLAG[PD-18], v2 (Knowledge-Cluster.md §9). The world-state reconciler's owner is
 * minted with the v2 memory scope; until then it is an inert no-op returning `{ deferred: true }`, which is
 * how a caller (and the row's result JSON) tells "reserved, not built" apart from "ran, changed nothing".
 */
export function createReservedWorkloadContributions(): readonly [WorkloadContribution<"reconcile-world-state">] {
  return [
    {
      kind: "reconcile-world-state",
      params: emptyWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      run: (_ctx, _params, report, _signal): Promise<DeferredResult> => {
        report({ message: "world-state reconcile is a v2 stub (no-op)" });
        return Promise.resolve({ deferred: true });
      },
    },
  ];
}
