// runner: assets-gc — the mark-sweep garbage collection pass that RUNS AS A WORKLOAD (PD-26). Wraps
// `ctx.env.assets.collectGarbage` (the grace-windowed whole-CAS sweep vs the asset-ref registry); `dryRun`
// reports what it WOULD reclaim without deleting a blob. Projects the counts (+ the `dryRun` echo) into the
// workload-owned `MaintenanceResult` (`scanned` = blobs walked, `changed` = blobs reclaimed).

import type { Runner } from "../contract/runner";

export const assetsGcRunner: Runner<"assets-gc"> = async (ctx, params, report, signal) => {
  const dryRun = params.dryRun ?? false;
  report({ message: dryRun ? "assets GC (dry run)" : "collecting garbage" });
  const result = await ctx.env.assets.collectGarbage({ dryRun, signal });
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
