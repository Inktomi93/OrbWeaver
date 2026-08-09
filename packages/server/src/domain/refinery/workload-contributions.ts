// domain/refinery — the domain's OWN background work, raised as a `WorkloadContribution` (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `refine-score-sweep`.
//
// Everything a run needs is a dep of THIS factory, closed over at `entry/compose` — never a shared
// per-dispatch env hub. The pass itself lives in `verbs/score-sweep.ts` (its header carries the no-session
// stamping ruling and the §20 carve-out); this file is only the queue-facing policy.

import type { RefineryScoreSweepResult } from "@orb/contracts/refinery";
import { refineScoreSweepWorkloadParams } from "@orb/contracts/refinery";
import type { WorkloadContribution } from "#domain/workloads";
import type { RefineryWorkloadDeps } from "./contract/service.ts";
import { createScoreSweep } from "./verbs/score-sweep.ts";

/** The sweep's closing progress line — what landed, and what it declined to score. `skipped` cards are
 *  either already scored (the FILL arm's whole point) or have no card text to critique, so the line names
 *  the lever rather than reporting a bare number the user cannot act on (the distill precedent). */
function sweepProgressMessage(result: RefineryScoreSweepResult, rescoreAll: boolean): string {
  const landed = `scored ${result.scored} of ${result.scanned} characters`;
  if (result.skipped === 0) {
    return landed;
  }
  const why = rescoreAll
    ? "with no card text to score (add a description first)"
    : "already scored or with no card text — re-run with “Re-score everything” to refresh them";
  return `${landed} — skipped ${result.skipped} ${why}`;
}

export function createRefineryWorkloadContributions(deps: RefineryWorkloadDeps): readonly [WorkloadContribution<"refine-score-sweep">] {
  const scoreSweep = createScoreSweep(deps);
  return [
    {
      kind: "refine-score-sweep",
      params: refineScoreSweepWorkloadParams,
      // One model call per card — long by construction, exactly like `distill-characters`.
      lane: "sweep",
      // The stamp is an upsert of one derived scalar: a restarted pass converges on the same scores.
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<RefineryScoreSweepResult> => {
        const rescoreAll = params.rescoreAll ?? false;
        const result = await scoreSweep({ ownerId: ctx.ownerId, rescoreAll, report, signal });
        report({ message: sweepProgressMessage(result, rescoreAll) });
        return result;
      },
    },
  ];
}
