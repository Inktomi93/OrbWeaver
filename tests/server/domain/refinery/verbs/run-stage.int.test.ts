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
  validScoreSchema,
} from "../_support.ts";

const OPERATE_BACK_REFUSAL = /Only the analyze stage/u;

function validAnalyzeSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ACCEPT", "NEEDS_REFINEMENT", "REGRESSION"], "x-orb-ui": { role: "verdict" } },
      driftNotes: { type: "array", items: { type: "string" } },
    },
    required: ["verdict"],
  };
}

// ── the CUSTOM payload arm (R3/SF): per-call schema resolve, the P1-B provenance EMBED, the F6 stamp
//    semantics under custom, the roster verdict fallback, the read-seam re-parse against the embed, and
//    the §16.1 operate-back knob. ──────────────────────────────────────────────────────────────────────

test("a custom SCORE run: resolves the schema per call, EMBEDS provenance, validates via the lift, stamps the core", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_cs_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "cs-card-a");
  const p = principal(owner);
  const row = await h.svc.createSchema({ principal: p, name: "vibe_scorer", description: "score the vibe", stage: "score", schema: validScoreSchema() });
  const session = await h.svc.startSession({ principal: p, characterId });
  await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, score: { kind: "custom", schemaId: row.id } } },
  });

  h.queueReply(JSON.stringify({ overallScore: 8, vibe: "COZY", notes: ["warm"], invented: "junk" }));
  const run = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  expect(run.stage).toBe("score");
  // The provenance EMBEDS the schema + version (P1-B) — never a bare pointer.
  expect(run.payloadConfig).toEqual({ kind: "custom", schemaId: row.id, schemaVersion: 1, schema: validScoreSchema() });
  // Strip-mode itemization still works over a lifted schema — the invented key is recorded, not swallowed.
  expect(run.strippedKeys).toEqual(["invented"]);
  // The custom instruction is the schema's own description; the wire grammar is the projected draft.
  const call = h.summarizeCalls.at(-1);
  expect(call?.user).toContain("score the vibe");
  expect(call?.opts?.responseFormat?.name).toBe("vibe_scorer");
  // The {{shape}} splice is the projected SCHEMA, not the fixed example.
  expect(call?.system).toContain("JSON Schema");
  // F6: the well-known core stamped the card's score readout.
  const detail = await h.character.get({ principal: p, characterId });
  expect(detail.refinery?.score).toBe(8);
});

test("a custom ANALYZE run stamps NOTHING into canon, but the roster badge still reads its verdict core", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_cs_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "cs-card-b");
  const p = principal(owner);
  const row = await h.svc.createSchema({ principal: p, name: "drift_check", description: "drift?", stage: "analyze", schema: validAnalyzeSchema() });
  const session = await h.svc.startSession({ principal: p, characterId });
  await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, analyze: { kind: "custom", schemaId: row.id } } },
  });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  h.advance(1000);
  h.queueReply(JSON.stringify({ verdict: "REGRESSION", driftNotes: ["colder"] }));
  const run = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "analyze" });
  expect(run.payloadConfig.kind).toBe("custom");
  // Canon: the typed `analysis` column is fixed-shape — a custom analyze must NOT have stamped it.
  const detail = await h.character.get({ principal: p, characterId });
  expect(detail.refinery?.analysis ?? null).toBeNull();
  // The roster badge still works — the well-known verdict core plucks from the custom payload.
  const roster = await h.svc.listSessions({ principal: p });
  expect(roster[0]?.latestVerdict).toBe("REGRESSION");
});

test("the read seam re-parses an old custom run against its EMBED — a later schema edit cannot rewrite history", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_cs_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "cs-card-c");
  const p = principal(owner);
  const row = await h.svc.createSchema({ principal: p, name: "vibe_scorer", description: "v1", stage: "score", schema: validScoreSchema() });
  const session = await h.svc.startSession({ principal: p, characterId });
  await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, score: { kind: "custom", schemaId: row.id } } },
  });
  h.queueReply(JSON.stringify({ overallScore: 7, vibe: "SHARP" }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  // Edit the schema INCOMPATIBLY (vibe becomes a number axis) — the old run must still read as v1.
  await h.svc.updateSchema({
    principal: p,
    schemaId: row.id,
    patch: {
      schema: {
        type: "object",
        properties: { overallScore: { type: "number", minimum: 1, maximum: 10 }, vibe: { type: "number", minimum: 0, maximum: 5 } },
        required: ["overallScore"],
      },
    },
  });
  const runs = await h.svc.listRuns({ principal: p, sessionId: session.id });
  expect(runs).toHaveLength(1);
  expect(runs[0]?.payload).toEqual({ overallScore: 7, vibe: "SHARP" });
  expect(runs[0]?.payloadConfig).toMatchObject({ kind: "custom", schemaVersion: 1 });
  // A DELETED schema doesn't orphan history either — the embed is the whole provenance…
  await h.svc.deleteSchema({ principal: p, schemaId: row.id });
  expect(await h.svc.listRuns({ principal: p, sessionId: session.id })).toHaveLength(1);
  // …but the NEXT run under the dangling pointer is a leak-free NOT_FOUND (the Setup tab re-points).
  await expect(h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" })).rejects.toThrow(DomainNotFoundError);
});

test("operate-back: analyze judges the NAMED earlier rewrite, not the latest; foreign run ids collapse", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_cs_e" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "cs-card-e");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "ROUND ONE description." }] }));
  const first = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  h.advance(1000);
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "ROUND TWO description." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  h.advance(1000);
  // The named run wins over "latest": the analyze prompt carries ROUND ONE and the DAG edge names it.
  h.queueReply(analyzeReply());
  const analyze = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "analyze", rewriteRunId: first.id });
  expect(analyze.sourceRunId).toBe(first.id);
  const call = h.summarizeCalls.at(-1);
  expect(call?.user).toContain("ROUND ONE");
  expect(call?.user).not.toContain("ROUND TWO");
  // Guard arms: a non-analyze stage refuses the knob; a fabricated run id is NOT_FOUND.
  await expect(h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite", rewriteRunId: first.id })).rejects.toThrow(OPERATE_BACK_REFUSAL);
  const foreignSession = await h.svc.startSession({ principal: p, characterId });
  await expect(h.svc.runStage({ principal: p, sessionId: foreignSession.id, stage: "analyze", rewriteRunId: first.id })).rejects.toThrow(DomainNotFoundError);
});

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
