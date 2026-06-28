// runner: csls — the hub_score write-back. discovery COMPUTES the CSLS hub scores then calls
// `embeddings.writeHubScores` (the column owner) internally; workloads sees ONE op
// (`ctx.env.discovery.computeHubScores`) and never writes the embeddings rows directly (db.md column
// ownership). Projects into the workload-owned `AnalyticsResult`.

import type { Runner } from "../contract/runner";

export const cslsRunner: Runner<"csls"> = async (ctx, _params, report, signal) => {
  report({ message: "computing hub scores (CSLS)" });
  const result = await ctx.env.discovery.computeHubScores({ signal });
  return { scanned: result.scanned, written: result.written };
};
