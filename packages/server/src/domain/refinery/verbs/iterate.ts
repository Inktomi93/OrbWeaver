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
// WHAT THE COUNTER IS NOT: THE IN-FLIGHT CLAIM — and it never became one (#1445 → #1568). A round is
// SERIALIZED by a separate LEASED claim on the session (`substrate/round-claim.ts`), taken here BEFORE the
// first model call and released on both the commit and the failure arm; a second concurrent round cannot take
// it and is refused `RefineryRoundInFlightError` having spent nothing. The three alternatives that were
// weighed and rejected are recorded because each looks reasonable until it is priced:
//   · Pre-bumping THIS counter converts it from completed rounds to STARTED rounds — it would contradict the
//     paragraph above and its pin (`tests/…/iterate.int.test.ts` "a mid-round analyze failure leaves the
//     rewrite run and an UNBUMPED counter"), and a failed round would inflate it permanently, since
//     `db.transaction` is banned in product code and a compensating decrement can itself fail.
//   · A CAS at COMMIT time refuses the loser only AFTER both rounds have paid the model calls, which buys a
//     typed refusal for spend nobody saved.
//   · A plain in-flight BOOLEAN wedges the session forever when the holding process dies.
// So the counter stays the ledger it says it is, and the claim is a self-clearing lease deadline beside it.

import { refineryGuidanceSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq, sql } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { RefineryContext } from "../context.ts";
import { RefineryRoundInFlightError, RefineryStageNotReadyError } from "../contract/errors.ts";
import type { RefineryService, StageEngineDeps } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow } from "../persistence/queries.ts";
import { releaseRoundClaim, takeRoundClaim } from "../substrate/round-claim.ts";

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
    // THE CLAIM, taken before ANY spend and before the guidance write — a refused round must leave the
    // session byte-identical, and persisting a loser's guidance would mutate the prompt the RUNNING round is
    // about to read. A live claim held by another round refuses here, free.
    const claim = await takeRoundClaim(ctx.db, sessionId, ctx.now());
    if (claim === undefined) {
      throw new RefineryRoundInFlightError();
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
      // RELEASE ON BOTH ARMS — the whole point of taking the claim early is that a FAILED round frees the
      // session immediately rather than parking it for a lease. Best-effort by construction: the release is
      // one guarded UPDATE, and if it cannot land, the lease expiry is the backstop that frees the session
      // anyway. It must never replace the round's own outcome, so its failure is logged, not thrown — a
      // successful round whose release blipped is still a successful round.
      try {
        await releaseRoundClaim(ctx.db, sessionId, claim);
      } catch (err) {
        getLog().warn({ err, sessionId }, "refinery iterate: round-claim release failed — the lease expiry will free the session");
      }
      // ONE tick per ROUND (never per stage), and TOTAL over the mid-round failure arm named in this file's
      // header: when the analyze half throws, the rewrite run ALREADY LANDED, so the ledger moved and every
      // device — including the acting one, which is now bus-driven — has to hear about it.
      ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    }
  };
}
