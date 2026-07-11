// runner: assets-backfill — the avatar re-pair maintenance pass that RUNS AS A WORKLOAD (PD-26). Wraps
// `ctx.env.assets.backfillAvatars`; `dryRun` reports what it WOULD change without mutating. Projects the
// counts (+ the `dryRun` echo) into the workload-owned `MaintenanceResult`. The GC + fsck passes have their
// own kinds now (`assets-gc` / `assets-fsck`); this is the backfill arm of the same PD-26 wave.

import type { Runner } from "../contract/runner";

export const assetsBackfillRunner: Runner<"assets-backfill"> = async (
  ctx,
  params,
  report,
  signal,
) => {
  const dryRun = params.dryRun ?? false;
  report({ message: dryRun ? "assets backfill (dry run)" : "backfilling avatars" });
  const result = await ctx.env.assets.backfillAvatars({ ownerId: ctx.ownerId, dryRun, signal });
  return { scanned: result.scanned, changed: result.changed, dryRun };
};
