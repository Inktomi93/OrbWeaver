// .int tests for `iterate` — one refinement round: the precondition (an analyze to refine against), the
// refine-system flip + analyze-feedback threading, guidance persist-then-thread, the counter as a
// COMPLETED-rounds count (mid-round failure leaves the rewrite run + an unbumped counter — append-only
// honesty), and the LEASED round claim that serializes rounds (#1568) — refuse-while-claimed BEFORE any
// spend, release on both the success and the failure arm, and a lapsed claim that lets the next round run.

import type { Db } from "@orb/db";
import { refineryRuns, refinerySessions } from "@orb/db";
import type { RefinerySessionId } from "@orb/kit/ids";
import { RefineryRoundInFlightError, RefineryRunFailedError, RefineryStageNotReadyError } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { REFINERY_ROUND_LEASE_MS } from "../../../../../packages/server/src/domain/refinery/substrate/round-claim.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { analyzeReply, makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

async function seedFirstPass(
  h: ReturnType<typeof makeRefineryHarness>,
  owner: Awaited<ReturnType<typeof seedUser>>,
  key: string,
): ReturnType<typeof h.svc.startSession> {
  const characterId = await seedOwnedCharacter(h, owner, key);
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(scoreReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });
  h.advance(10);
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  h.advance(10);
  h.queueReply(analyzeReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "analyze" });
  h.advance(10);
  return session;
}

/** The session's live round claim (`null` = free) — read straight off the column, never through a verb. */
async function inflightUntilOf(db: Db, sessionId: RefinerySessionId): Promise<number | null> {
  const rows = await db.select({ at: refinerySessions.inflightUntil }).from(refinerySessions).where(eq(refinerySessions.id, sessionId));
  return rows[0]?.at ?? null;
}

test("iterate before any analyze is the typed stage-order refusal", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "it-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  await expect(h.svc.iterate({ principal: principal(owner), sessionId: session.id })).rejects.toBeInstanceOf(RefineryStageNotReadyError);
});

test("one round: refine system + analyze feedback thread the rewrite half; the counter counts the completed round", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_b" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-b");

  h.queueReply(rewriteReply());
  h.queueReply(analyzeReply({ verdict: "ACCEPT", issues: [] }));
  const round = await h.svc.iterate({ principal: principal(owner), sessionId: session.id, guidance: "keep her dry-humoured" });

  expect(round.iterationCount).toBe(1);
  expect(round.rewrite.stage).toBe("rewrite");
  expect(round.analyze.stage).toBe("analyze");
  // The refinement rewrite ran under the REFINE system slot with the analyze feedback + the fresh
  // guidance in the user prompt (the extension's refinement discipline, study §1.2).
  const refineCall = h.summarizeCalls.at(-2);
  expect(refineCall?.system).toContain("refining a character card based on analysis feedback");
  expect(refineCall?.user).toContain("Previous analysis verdict: NEEDS_REFINEMENT");
  expect(refineCall?.user).toContain("keep her dry-humoured");
  // The refinement-round runs stamp the PRE-increment counter (0-based rounds; the view carries it).
  expect(round.rewrite.iteration).toBe(0);
  const updated = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(updated.iterationCount).toBe(1);
  expect(updated.guidance).toBe("keep her dry-humoured");
  // ONE tick for the whole ROUND, not one per stage: the round ran two stages through the shared engine,
  // and three invalidates of the same path inside one round is the storm (an invalidate CANCELS and
  // restarts an in-flight fetch). `seedFirstPass` emitted four before it (start + three runStages).
  const roundTicks = h.userEvents.slice(4);
  expect(roundTicks).toEqual([{ userId: owner, event: { type: "refineryChanged", sessionId: session.id } }]);
});

test("a mid-round analyze failure leaves the rewrite run and an UNBUMPED counter (append-only honesty)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_c" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-c");

  h.queueReply(rewriteReply());
  h.queueReply("garbage");
  h.queueReply("more garbage");
  await expect(h.svc.iterate({ principal: principal(owner), sessionId: session.id })).rejects.toBeInstanceOf(RefineryRunFailedError);

  const runs = await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id));
  // First pass (3) + the round's landed rewrite (1); the failed analyze wrote nothing.
  expect(runs).toHaveLength(4);
  const updated = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(updated.iterationCount).toBe(0);
  // …AND IT STILL ANNOUNCED. The emit is TOTAL over the round's outcomes (a `finally` in the verb): the
  // rewrite run LANDED before the analyze half threw, so the ledger moved and every device — including the
  // acting one, which is bus-driven now — must hear it. This is the parity `onSettled` used to give the
  // client for free (it runs on error too); drop the totality and the failed round leaves a stale ledger
  // everywhere. The failing analyze wrote nothing, so the tick is still exactly ONE.
  expect(h.userEvents.slice(4)).toEqual([{ userId: owner, event: { type: "refineryChanged", sessionId: session.id } }]);
});

// The #1445 pin that used to live here asserted the UNSERIALIZED arm (two concurrent rounds both completing,
// with distinct round numbers). That was never a preference — its own header called the missing claim "the
// open half, deliberate" and named the leased claim as the work that would close it. #1568 IS that work, so
// the arm below replaces it: the SQL-side increment is still what makes the tally honest, but a second
// concurrent round no longer reaches it.
test("two CONCURRENT rounds: one runs, the other is refused BEFORE it spends (#1568)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_race" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-race");
  const spendBefore = h.summarizeCalls.length;

  // Only the WINNER's two halves are scripted. That is the assertion, not a shortcut: an under-scripted tape
  // throws LOUD at the call site, so if the loser reached a model call at all this test fails on the tape
  // rather than on the count — the "refused before it spends" claim has its own tripwire.
  h.queueReply(rewriteReply());
  h.queueReply(analyzeReply());
  const settled = await Promise.allSettled([
    h.svc.iterate({ principal: principal(owner), sessionId: session.id }),
    h.svc.iterate({ principal: principal(owner), sessionId: session.id }),
  ]);

  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r) => r.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBeInstanceOf(RefineryRoundInFlightError);
  // ONE round completed, so the tally is 1 — and the loser's refusal did not consume a round number.
  expect(fulfilled[0]?.value.iterationCount).toBe(1);
  const updated = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(updated.iterationCount).toBe(1);
  // The loser spent NOTHING: exactly the winner's two model calls happened.
  expect(h.summarizeCalls.length - spendBefore).toBe(2);
  // …and the winner released on its way out, so the session is immediately iterable again.
  expect(await inflightUntilOf(db, session.id)).toBeNull();
});

test("a round REFUSED while claimed leaves the session byte-identical (no guidance write, no run, no tick)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_claimed" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-claimed");

  // A round is in flight: stamp a LIVE claim the way a running round would have.
  const held = h.ctx.now() + REFINERY_ROUND_LEASE_MS;
  await db.update(refinerySessions).set({ inflightUntil: held }).where(eq(refinerySessions.id, session.id));
  const runsBefore = await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id));
  const ticksBefore = h.userEvents.length;

  await expect(h.svc.iterate({ principal: principal(owner), sessionId: session.id, guidance: "this must not persist" })).rejects.toBeInstanceOf(
    RefineryRoundInFlightError,
  );

  // NOTHING moved: not the guidance (which would mutate the prompt the RUNNING round is about to read), not
  // the run log, not the counter, not the claim, and not the event stream (a refusal is not a change).
  const after = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(after.guidance).toBeNull();
  expect(after.iterationCount).toBe(0);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id))).toHaveLength(runsBefore.length);
  expect(await inflightUntilOf(db, session.id)).toBe(held);
  expect(h.userEvents).toHaveLength(ticksBefore);
});

test("an EXPIRED claim does not wedge the session — the next round takes it and completes (#1568)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_expired" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-expired");

  // A round that CRASHED: its claim is on the row and nothing released it. Nothing sweeps it either — the
  // deadline is the whole mechanism, so a claim in the past must simply be takeable.
  await db
    .update(refinerySessions)
    .set({ inflightUntil: h.ctx.now() - 1 })
    .where(eq(refinerySessions.id, session.id));

  h.queueReply(rewriteReply());
  h.queueReply(analyzeReply());
  const round = await h.svc.iterate({ principal: principal(owner), sessionId: session.id });
  expect(round.iterationCount).toBe(1);
  expect(await inflightUntilOf(db, session.id)).toBeNull();
});

test("a mid-round FAILURE releases the claim — the session is iterable again immediately, not after the lease", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_it_failrelease" });
  const h = makeRefineryHarness(db);
  const session = await seedFirstPass(h, owner, "it-card-failrelease");

  h.queueReply(rewriteReply());
  h.queueReply("garbage");
  h.queueReply("more garbage");
  await expect(h.svc.iterate({ principal: principal(owner), sessionId: session.id })).rejects.toBeInstanceOf(RefineryRunFailedError);
  // The `finally` released on the failure arm: waiting out a 15-minute lease after a failed round would be
  // the claim making the product worse than the gap it closed.
  expect(await inflightUntilOf(db, session.id)).toBeNull();

  // Proven by USE, not just by the column: the very next round runs.
  h.queueReply(rewriteReply());
  h.queueReply(analyzeReply());
  expect((await h.svc.iterate({ principal: principal(owner), sessionId: session.id })).iterationCount).toBe(1);
});
