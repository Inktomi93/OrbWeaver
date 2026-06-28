// runner: assets-backfill — the avatar re-pair maintenance pass that RUNS AS A WORKLOAD (PD-26). Wraps
// `ctx.env.assets.backfillAvatars`; `dryRun` reports what it WOULD change without mutating. Projects the
// counts (+ the `dryRun` echo) into the workload-owned `MaintenanceResult`. The assets GC/fsck/collectGarbage
// passes get their own kinds in the GC wave; this is the backfill arm the PD-26 seam declares now.

import type { Runner } from "../contract/runner";

export const assetsBackfillRunner: Runner<"assets-backfill"> = async (
  ctx,
  params,
  report,
  signal,
) => {
  const dryRun = params.dryRun ?? false;
  report({ message: dryRun ? "assets backfill (dry run)" : "backfilling avatars" });
  const result = await ctx.env.assets.backfillAvatars({ dryRun, signal });
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
