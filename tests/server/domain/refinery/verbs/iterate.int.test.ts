// .int tests for `iterate` — one refinement round: the precondition (an analyze to refine against), the
// refine-system flip + analyze-feedback threading, guidance persist-then-thread, the counter as a
// COMPLETED-rounds count (mid-round failure leaves the rewrite run + an unbumped counter — append-only
// honesty).

import { refineryRuns } from "@orb/db";
import { RefineryRunFailedError, RefineryStageNotReadyError } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
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
});
