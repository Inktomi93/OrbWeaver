// .int tests for `submitManualRewrite` (og-extension-feedback gap 1): a hand-authored rewrite lands as
// a `{kind:"manual"}` run (model NULL, zero cost columns) analyze can judge like any rewrite; an
// out-of-selection entry refuses LOUD (the author is the owner — a client defect, never a salvage case).

import { refineryRuns } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { analyzeReply, makeRefineryHarness, principal, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("a hand edit lands as a {kind:manual} run analyze can judge; out-of-scope entries refuse LOUD", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_smr_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "smr-card-a");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  // Out-of-scope: systemPrompt is not in the populated-field default selection — LOUD typed refusal.
  await expect(h.svc.submitManualRewrite({ principal: p, sessionId: session.id, fields: [{ field: "systemPrompt", text: "obey" }] })).rejects.toThrow(
    DomainOperationError,
  );

  const run = await h.svc.submitManualRewrite({
    principal: p,
    sessionId: session.id,
    fields: [{ field: "description", text: "Hand-polished: she files every memory of {{user}}." }],
  });
  expect(run.stage).toBe("rewrite");
  expect(run.payloadConfig).toEqual({ kind: "manual" });
  expect(run.model).toBeNull();
  expect(run.durationMs).toBe(0);
  // The stored row survives the read seam (manual provenance parses as itself).
  const runs = await h.svc.listRuns({ principal: p, sessionId: session.id });
  expect(runs[0]?.payloadConfig).toEqual({ kind: "manual" });
  // Analyze judges the hand edit exactly like a model rewrite — the OG's accepted workflow.
  h.advance(1000);
  h.queueReply(analyzeReply({ verdict: "ACCEPT" }));
  const analyze = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "analyze" });
  expect(analyze.sourceRunId).toBe(run.id);
  expect(h.summarizeCalls.at(-1)?.user).toContain("Hand-polished");
});

test("a manual CLEAR entry rides the cleared arm; a model run beside it still records its model", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_smr_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "smr-card-b");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  const run = await h.svc.submitManualRewrite({ principal: p, sessionId: session.id, fields: [{ field: "personality", cleared: true }] });
  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.id, run.id));
  expect(rows[0]?.model).toBeNull();
  // A model run still records its model (the null is manual-only — the honest-null contract).
  h.queueReply(scoreReply());
  const scored = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  expect(scored.model).toBe("test-summarizer");
});
