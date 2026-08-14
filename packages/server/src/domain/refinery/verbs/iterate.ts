// verb: iterate — ONE refinement round (the extension's quick-iterate loop, study §1.1.2): a refinement
// REWRITE (the `refinery.refine.system` slot + the latest analyze feedback in-prompt) then an ANALYZE of
// that fresh rewrite against the ORIGINAL, then `iterationCount`++. Requires an analyze run to refine
// against (the loop refines, it does not start — score/rewrite/analyze via `runStage` first).
//
// MID-ROUND FAILURE IS HONEST BY CONSTRUCTION: the run log is append-only truth. If the analyze half
// throws after the rewrite landed, the rewrite run EXISTS (the next `runStage("analyze")` or `iterate`
// picks it up) and the counter is NOT bumped — `iterationCount` counts COMPLETED rounds, the runs' own
// `iteration` stamps stay 0-based per round.

import { refineryGuidanceSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import { RefineryStageNotReadyError } from "../contract/errors.ts";
import type { RefineryService, StageEngineDeps } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow } from "../persistence/queries.ts";

export function createIterate(ctx: RefineryContext, deps: StageEngineDeps): RefineryService["iterate"] {
  return async ({ principal, sessionId, guidance }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    // The loop precondition (AFTER the ownership belt): a round refines AGAINST an analysis.
    const latestAnalyze = await latestRunRowOf(ctx.db, sessionId, "analyze");
    if (latestAnalyze === undefined) {
      throw new RefineryStageNotReadyError("There is no analysis to refine against yet — run analyze first.");
    }
    // New guidance persists BEFORE the stages so both halves' prompts read it (the internal-boundary
    // re-parse posture — the wire parse does not cover this seam).
    if (guidance !== undefined) {
      const parsed = refineryGuidanceSchema.parse(guidance);
      await ctx.db.update(refinerySessions).set({ guidance: parsed, updatedAt: ctx.now() }).where(eq(refinerySessions.id, sessionId));
    }

    try {
      const rewrite = await deps.executeStage({ principal, sessionId, stage: "rewrite", isRefinement: true });
      const analyze = await deps.executeStage({ principal, sessionId, stage: "analyze", isRefinement: true });

      const iterationCount = row.iterationCount + 1;
      await ctx.db.update(refinerySessions).set({ iterationCount, updatedAt: ctx.now() }).where(eq(refinerySessions.id, sessionId));
      return { rewrite, analyze, iterationCount };
    } finally {
      // ONE tick per ROUND (never per stage), and TOTAL over the mid-round failure arm named in this file's
      // header: when the analyze half throws, the rewrite run ALREADY LANDED, so the ledger moved and every
      // device — including the acting one, which is now bus-driven — has to hear about it.
      ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    }
  };
}
