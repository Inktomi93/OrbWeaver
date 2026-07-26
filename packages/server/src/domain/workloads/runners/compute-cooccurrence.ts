// runner: compute-cooccurrence — the discovery keyword-cooccurrence analytics pass. Wraps
// `ctx.env.discovery.computeCooccurrence` and projects into the workload-owned `AnalyticsResult`. The
// maxPairs/hubFraction tunables follow the compute-themes precedence: the triggering user's
// `UserSettings.workloads` knobs → the runner floors (resolved inside discovery). Absent ⇒ undefined ⇒ floor.

import type { Runner } from "../contract/runner";

export const computeCooccurrenceRunner: Runner<"compute-cooccurrence"> = async (ctx, _params, report, signal) => {
  const settings = await ctx.loadUserSettings();
  report({ message: "computing keyword cooccurrence" });
  const result = await ctx.env.discovery.computeCooccurrence({
    signal,
    ...(settings.workloads.maxPairs !== undefined ? { maxPairs: settings.workloads.maxPairs } : {}),
    ...(settings.workloads.hubFraction !== undefined ? { hubFraction: settings.workloads.hubFraction } : {}),
  });
  return { scanned: result.scanned, written: result.written };
};
