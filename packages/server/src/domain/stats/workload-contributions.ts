// domain/stats — the domain's OWN background work, raised as a `WorkloadContribution` (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `reconcile-stats`.
//
// NOTE the honest duality: the SAME `reconcileStats` pass also runs awaited, in-request, off the import
// post-settle. The queue ride buys the all-owners BULK sweep its single-active lock + run history; the
// singular arm is queue-optional by construction, and that is fine — the op has one home either way.

import type { ReconcileStatsWorkloadResult } from "@orb/contracts/stats";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { StatsWorkloadDeps } from "./contract/service";
import { reconcileStats } from "./write/rebuild-from-canon";

/** `reconcile-stats` — rebuild the rollups from canon. `ownerId` scopes to ONE owner (SINGULAR: rebuild
 *  MY rollups); `null` sweeps every owner (BULK). */
export function createStatsWorkloadContributions(deps: StatsWorkloadDeps): readonly [WorkloadContribution<"reconcile-stats">] {
  return [
    {
      kind: "reconcile-stats",
      params: emptyWorkloadParams,
      lane: "sweep",
      // A full rebuild from canon — re-running it converges on the same rollups.
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<ReconcileStatsWorkloadResult> => {
        report({ message: "reconciling stats from canon" });
        const result = await reconcileStats(deps.db, {
          now: deps.now,
          signal,
          ...(ctx.ownerId !== null ? { ownerId: ctx.ownerId } : {}),
        });
        return { owners: result.owners, characters: result.characters };
      },
    },
  ];
}
