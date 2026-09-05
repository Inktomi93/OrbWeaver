// verb: iterate — ONE refinement round (the extension's quick-iterate loop, study §1.1.2): a refinement
// REWRITE (the `refinery.refine.system` slot + the latest analyze feedback in-prompt) then an ANALYZE of
// that fresh rewrite against the ORIGINAL, then `iterationCount`++. Requires an analyze run to refine
// against (the loop refines, it does not start — score/rewrite/analyze via `runStage` first).
//
// MID-ROUND FAILURE IS HONEST BY CONSTRUCTION: the run log is append-only truth. If the analyze half
// throws after the rewrite landed, the rewrite run EXISTS (the next `runStage("analyze")` or `iterate`
// picks it up) and the counter is NOT bumped — `iterationCount` counts COMPLETED rounds, the runs' own
// `iteration` stamps stay 0-based per round.
//
// WHAT THE COUNTER IS NOT: AN IN-FLIGHT CLAIM (#1445, the open half — deliberate, not an oversight).
// Two concurrent rounds on one session now get DISTINCT round numbers and leave a tally equal to the
// rounds that completed (the SQL-side increment below), but they still both refine off the same latest
// analysis and both pay for their model calls. SERIALIZING them means claiming the round BEFORE the model
// work, and every reachable way to do that with what exists here is worse than the gap:
//   · Pre-bumping THIS counter converts it from completed rounds to STARTED rounds — it would contradict
//     the paragraph above and its pin (`tests/…/iterate.int.test.ts` "a mid-round analyze failure leaves
//     the rewrite run and an UNBUMPED counter"), and a failed round would inflate it permanently, since
//     `db.transaction` is banned in product code and a compensating decrement can itself fail.
//   · A CAS at COMMIT time refuses the loser only AFTER both rounds have paid the model calls, which buys
//     a typed refusal for spend nobody saved.
//   · The honest instrument is an in-flight marker with a LEASE (a crashed process must not wedge the
//     session forever) — a durable claim + expiry + release, i.e. a small subsystem the refinery does not
//     have today and one this verb must not improvise.
// So the counter stays the ledger it says it is, and the serializing claim is its own piece of work.

import { refineryGuidanceSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq, sql } from "drizzle-orm";
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

      // THE COUNTER IS INCREMENTED IN SQL, NEVER FROM THE LOADED SNAPSHOT (#1445). `row` was read before
      // two long model calls, so `row.iterationCount + 1` is a stale basis: two rounds running concurrently
      // on one session would both write the SAME number, both RETURN it, and leave the counter one behind
      // the rounds that actually completed. A read-modify-write over a monotonic tally has no honest
      // snapshot to write from — the statement itself does the addition and RETURNS what it wrote, so each
      // round gets its own round number and the tally equals the number of completed rounds.
      const [bumped] = await ctx.db
        .update(refinerySessions)
        .set({ iterationCount: sql`${refinerySessions.iterationCount} + 1`, updatedAt: ctx.now() })
        .where(eq(refinerySessions.id, sessionId))
        .returning({ iterationCount: refinerySessions.iterationCount });
      // The session was proven owned above and nothing deletes it mid-round but a cascade from the card;
      // if that raced us there is no round number to report, so fall back to the snapshot's successor.
      const iterationCount = bumped?.iterationCount ?? row.iterationCount + 1;
      return { rewrite, analyze, iterationCount };
    } finally {
      // ONE tick per ROUND (never per stage), and TOTAL over the mid-round failure arm named in this file's
      // header: when the analyze half throws, the rewrite run ALREADY LANDED, so the ledger moved and every
      // device — including the acting one, which is now bus-driven — has to hear about it.
      ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    }
  };
}
