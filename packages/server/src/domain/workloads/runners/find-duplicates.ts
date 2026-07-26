// runner: find-duplicates — the discovery duplicate-pair analytics pass. Wraps
// `ctx.env.discovery.findDuplicates` and projects into the workload-owned `AnalyticsResult`. The CHARACTER
// arm's raw-cosine `threshold` follows the §7.2 precedence: per-run param → the user knob
// (`UserSettings.workloads.dupThreshold`) → the runner floor (resolved inside discovery). Absent ⇒ undefined
// ⇒ discovery's `DEFAULT_DUP_THRESHOLD` (byte-identical to the pre-wire behavior). The chat Jaccard arm keeps
// its OWN floor — a different metric (set-overlap, not cosine), so this cosine knob does not touch it.

import type { Runner } from "../contract/runner";

export const findDuplicatesRunner: Runner<"find-duplicates"> = async (ctx, params, report, signal) => {
  const settings = await ctx.loadUserSettings();
  const threshold = params.threshold ?? settings.workloads.dupThreshold;
  report({ message: "finding duplicate pairs" });
  const result = await ctx.env.discovery.findDuplicates({ ownerId: ctx.ownerId, threshold, signal });
  return { scanned: result.scanned, written: result.written };
};
