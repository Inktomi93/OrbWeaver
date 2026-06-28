// runner: reconcile-stats — the full stats rollup rebuild from canon. Wraps `ctx.env.stats.reconcileStats`
// and projects into the workload-owned `ReconcileStatsWorkloadResult`.

import type { Runner } from "../contract/runner";

export const reconcileStatsRunner: Runner<"reconcile-stats"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "reconciling stats from canon" });
  const result = await ctx.env.stats.reconcileStats({ signal });
  return { owners: result.owners, characters: result.characters };
};
