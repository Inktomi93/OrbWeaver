// runner: import-st — the ST bulk import loop + the post-import stats settle. Wraps `ctx.env.import.importAll`
// (collect → import each, idempotent via importHash); on a real (non-dry) run that changed rows it then
// reconciles the stats rollups from the freshly-imported canon (workloads.md runner table — "post-import
// reconcile"). Projects into the workload-owned `MaintenanceResult`.

import type { Runner } from "../contract/runner";

export const importStRunner: Runner<"import-st"> = async (ctx, params, report, signal) => {
  const dryRun = params.dryRun ?? false;
  report({ message: dryRun ? "import ST (dry run)" : "importing ST profiles" });
  const result = await ctx.env.import.importAll({ dryRun, signal });
  if (!dryRun && result.changed > 0) {
    report({ message: "reconciling stats post-import" });
    await ctx.env.stats.reconcileStats({ signal });
  }
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
