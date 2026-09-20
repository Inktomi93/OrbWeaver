// .int tests for `submitManualRewrite` (og-extension-feedback gap 1): a hand-authored rewrite lands as
// a `{kind:"manual"}` run (model NULL, zero cost columns) analyze can judge like any rewrite; an
// out-of-selection entry refuses LOUD (the author is the owner — a client defect, never a salvage case).

import { refineryRuns, refinerySessions } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { RefineryRunId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRefineryService } from "@orb/server/domain/refinery";
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
  // Three ticks: start · the hand edit · the analyze run. The out-of-scope refusal announced nothing —
  // it threw at the fence, before the insert.
  expect(h.userEvents.map((e) => e.event.type)).toEqual(["refineryChanged", "refineryChanged", "refineryChanged"]);
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
  expect(scored.model).toBe("test-summarize-model");
});

test("the run insert and the session status flip are ONE batch (issue #794) — a mid-batch failure leaves neither landed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_smr_atomic" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "smr-card-atomic");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  // Distinguish "flipped by this call" from "startSession also lands active" — mark it a status the verb
  // never writes on its own path.
  await db.update(refinerySessions).set({ status: "completed" }).where(eq(refinerySessions.id, session.id));

  // Force the run insert (the batch's first statement) to fail on a PK conflict: pre-seed a row at the
  // exact id a rigged `newRefineryRunId` will mint next, via a second service instance over the SAME ctx
  // with only that one minter swapped (the composition-root override shape, never a readonly-field mutation).
  const collidingId = castId<RefineryRunId>("refinery_run_collide");
  await db.insert(refineryRuns).values({
    id: collidingId,
    sessionId: session.id,
    stage: "rewrite",
    payloadConfig: { kind: "manual" },
    payload: { fields: [] },
    durationMs: 0,
    createdAt: h.ctx.now(),
  });
  const riggedSvc = createRefineryService({ ...h.ctx, newRefineryRunId: () => collidingId });

  await expect(riggedSvc.submitManualRewrite({ principal: p, sessionId: session.id, fields: [{ field: "personality", cleared: true }] })).rejects.toThrow();

  const [sessionRow] = await db.select().from(refinerySessions).where(eq(refinerySessions.id, session.id));
  // The status update never landed — if the pair weren't batched, the run insert throwing wouldn't stop a
  // SEPARATE session update from committing first (drizzle statements resolve top-to-bottom in a batch,
  // so this also proves the insert is ordered ahead of the status flip within the one round-trip).
  expect(sessionRow?.status).toBe("completed");
});
