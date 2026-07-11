// runner: distill-characters — the discovery character-summary pass. Wraps `ctx.env.discovery
// .distillCharacters` and projects its scan/write counts into the workload-owned `AnalyticsResult`.

import type { Runner } from "../contract/runner";

export const distillCharactersRunner: Runner<"distill-characters"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "distilling character summaries" });
  const result = await ctx.env.discovery.distillCharacters({ ownerId: ctx.ownerId, signal });
  return { scanned: result.scanned, written: result.written };
};
