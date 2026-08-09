// .int tests for the stage ENGINE (createExecuteStage via runStage): the belts of design §9.4 — the
// leak-free ownership collapse, stage-order preconditions, the belt-5 by-construction prompt pin AT THE
// INTEGRATION TIER (card {{macros}} reach the scripted summarize verbatim, un-neutralized), the posture +
// ResponseFormat wire opts, the null-drop parse (strict-compatible survival), the stripped-key
// itemization on the run row, the independent signal-stamp halves, and the typed double-failure refusal
// (no fallback write). Real freshDb + the REAL character service; the model is the ONE faked edge.

import { characters, refineryRuns } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { RefineryRunFailedError, RefineryStageNotReadyError } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  analyzeReply,
  makeRefineryHarness,
  principal,
  rewriteReply,
  SCORE_PAYLOAD,
  scoreReply,
  seedOwnedCharacter,
  seedUser,
  TEST_SUMMARIZER_MODEL,
} from "../_support.ts";

test("a score run: prompt carries card {{macros}} VERBATIM (belt 5 both directions), posture+format ride the wire, the run row lands, the score half stamps", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  h.queueReply(scoreReply());
  const run = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });

  // ── belt 5, integration tier: the seeded description's {{char}}/{{user}} reach the model UNRESOLVED
  //    and UN-NEUTRALIZED (no ZWSP anywhere in the prompt) — the one assertion that breaks if anyone
  //    later adds either a neutralize step or macro resolution. ──
  const call = h.summarizeCalls[0];
  if (call === undefined) {
    throw new Error("expected the scripted summarize call");
  }
  expect(call.user).toContain("says {{char}} likes {{user}}");
  expect(call.user.includes("\u200b")).toBe(false);
  expect(call.system.includes("\u200b")).toBe(false);
  // The wire opts: the stage ResponseFormat + the refine_score posture floor (temp 0.2 / 768 out).
  expect(call.opts?.responseFormat?.name).toBe("refinery_score");
  expect(call.opts?.temperature).toBe(0.2);
  expect(call.opts?.maxTokens).toBe(768);

  // The run view + row: typed payload, provenance config, usage from the scripted item, shape-clean.
  expect(run.stage).toBe("score");
  expect(run.model).toBe(TEST_SUMMARIZER_MODEL);
  expect(run.promptTokens).toBe(11);
  expect(run.outputTokens).toBe(7);
  expect(run.strippedKeys).toEqual([]);
  expect(run.payloadConfig).toEqual({ kind: "fixed", mode: "full" });
  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.payload).toEqual(run.payload);
  // The Runs-ledger cargo the R3 mock promises (`… 4 210 in / 512 out · 6.1s`) has to EXIST on the row,
  // not just in the view: provider usage lands, and the run's wall time has its own column. The injected
  // clock is frozen, so the honest duration under test is 0 — the pin is that the column is WRITTEN
  // (a null here is the "documented but never threaded" failure the ledger column class keeps hitting).
  expect(rows[0]?.promptTokens).toBe(11);
  expect(rows[0]?.outputTokens).toBe(7);
  expect(rows[0]?.durationMs).toBe(0);
  expect(run.durationMs).toBe(0);
  // A score run consumes no prior run — it is a DAG root.
  expect(rows[0]?.sourceRunId).toBeNull();
  expect(run.sourceRunId).toBeNull();

  // F6: the SCORE half stamped, the analysis half untouched.
  const charRows = await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId));
  expect(charRows[0]?.refinery).toEqual({ score: 6.5, analysis: null });
});

test("analyze before any rewrite is the typed stage-order refusal (after the ownership belt)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-b");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  await expect(h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "analyze" })).rejects.toBeInstanceOf(RefineryStageNotReadyError);
});

test("rewrite→analyze stamps the ANALYSIS half and preserves the stamped score (independent halves)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-c");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  h.queueReply(scoreReply());
  const score = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });
  h.advance(10);
  h.queueReply(rewriteReply());
  const rewrite = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  h.advance(10);
  h.queueReply(analyzeReply());
  const analyze = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "analyze" });

  expect(analyze.stage).toBe("analyze");
  // The DAG parent edges (schema-renderer §21 edge 1): a timestamp-ordered list answers "which rewrite did
  // this analyze judge?" only by "the latest at the time", which stops being true the moment step-back
  // lands. Each row records the run it actually CONSUMED.
  expect(score.sourceRunId).toBeNull();
  expect(rewrite.sourceRunId).toBe(score.id);
  expect(analyze.sourceRunId).toBe(rewrite.id);
  const runRows = await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id));
  expect(runRows.find((r) => r.stage === "analyze")?.sourceRunId).toBe(rewrite.id);
  // The analyze prompt anchors the ORIGINAL (anti-drift): original description text present under ORIGINAL.
  const analyzeCall = h.summarizeCalls.at(-1);
  expect(analyzeCall?.user).toContain("# ORIGINAL");
  expect(analyzeCall?.user).toContain("# REWRITTEN");
  expect(analyzeCall?.user).toContain("says {{char}} likes {{user}}");
  expect(analyzeCall?.user).toContain("files every memory of {{user}}");

  const charRows = await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId));
  expect(charRows[0]?.refinery?.score).toBe(6.5);
  expect(charRows[0]?.refinery?.analysis?.verdict).toBe("NEEDS_REFINEMENT");
});

test("a foreign session and an absent session collapse to the SAME NOT_FOUND (no existence oracle)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_d" });
  const stranger = await seedUser(db, { id: "user_rs_e", handle: castId<Handle>("rs-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-d");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  // Same ERROR CLASS for foreign and absent — a stranger's rejection is indistinguishable from a miss
  // (the transport maps both to the identical NOT_FOUND; the cross-tenant sweep re-proves it end-to-end).
  const foreign = await h.svc.runStage({ principal: principal(stranger), sessionId: session.id, stage: "score" }).catch((e: unknown) => e);
  const absent = await h.svc
    .runStage({ principal: principal(stranger), sessionId: castId<RefinerySessionId>("refinery_session_phantom"), stage: "score" })
    .catch((e: unknown) => e);
  expect(foreign).toBeInstanceOf(DomainNotFoundError);
  expect(absent).toBeInstanceOf(DomainNotFoundError);
});

test("an invented payload key is STRIPPED and itemized on the run row (paths, never content)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_f" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-f");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  h.queueReply(JSON.stringify({ ...SCORE_PAYLOAD, hacked: { exfil: "nope" } }));
  const run = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });
  expect(run.strippedKeys).toEqual(["hacked"]);
  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.id, run.id));
  expect(rows[0]?.strippedKeys).toEqual(["hacked"]);
});

test("an explicit null on an optional field survives the parse (the strict-compatible null-drop belt)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_g" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-g");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  // The §3.B end-to-end shape: `greetingIndex: null` where the schema says optional-int — a conforming
  // strict-compatible reply that would FAIL without dropNullValues.
  h.queueReply(JSON.stringify({ fields: [{ field: "description", greetingIndex: null, text: "richer records" }] }));
  const run = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  expect(run.stage).toBe("rewrite");
  expect(run.payload).toEqual({ fields: [{ field: "description", text: "richer records" }] });
  // The dropped null is protocol-normal (strict-compatible's encoding of ABSENT) — NOT itemized, so the
  // stripped-key tamper signal stays clean on such deployments (capture-after-drop, deliberate).
  expect(run.strippedKeys).toEqual([]);
});

test("a double schema failure is the typed RETRYABLE refusal — no run row, no stamp (never a fallback write)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rs_h" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "rs-card-h");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  h.queueReply("not json at all");
  h.queueReply('{"still": "wrong"}');
  await expect(h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" })).rejects.toBeInstanceOf(RefineryRunFailedError);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id))).toHaveLength(0);
  const charRows = await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, characterId));
  expect(charRows[0]?.refinery).toBeNull();
});
