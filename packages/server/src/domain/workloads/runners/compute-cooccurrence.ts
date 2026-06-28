// runner: compute-cooccurrence — the discovery keyword-cooccurrence analytics pass. Wraps
// `ctx.env.discovery.computeCooccurrence` and projects into the workload-owned `AnalyticsResult`.

import type { Runner } from "../contract/runner";

export const computeCooccurrenceRunner: Runner<"compute-cooccurrence"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "computing keyword cooccurrence" });
  const result = await ctx.env.discovery.computeCooccurrence({ signal });
  return { scanned: result.scanned, written: result.written };
};
