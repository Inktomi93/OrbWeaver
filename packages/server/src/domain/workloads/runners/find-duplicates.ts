// runner: find-duplicates — the discovery duplicate-pair analytics pass. Wraps
// `ctx.env.discovery.findDuplicates` and projects into the workload-owned `AnalyticsResult`.

import type { Runner } from "../contract/runner";

export const findDuplicatesRunner: Runner<"find-duplicates"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "finding duplicate pairs" });
  const result = await ctx.env.discovery.findDuplicates({ ownerId: ctx.ownerId, signal });
  return { scanned: result.scanned, written: result.written };
};
