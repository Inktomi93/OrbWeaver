// verb: runStage (+ the shared stage ENGINE `iterate` reuses). One stage pass: ownership belt →
// stage-order precondition → prompt assembly (substrate, belt-5-by-construction) → ONE `summarize` call
// under the stage's posture + ResponseFormat → the null-drop/capture parse through the ONE dispatch home →
// append the run row (with its stripped-keys itemization + provenance config) → stamp the signals half
// this stage produces (F6: score runs stamp `score`, analyze runs stamp `analysis` — via the injected
// character op, never a direct write) → touch the session. A double schema failure is the typed
// RETRYABLE error — NEVER a fallback write (security pass §4.7).
//
// WHICH CARD EACH STAGE READS (the anti-drift geometry, study §1.2): SCORE always critiques the ORIGINAL
// (the "before" that seeds rewrites); REWRITE works on the WORKING card (original overlaid with the
// latest rewrite, so refinement rounds converge) with the latest score as context; ANALYZE always judges
// the latest rewrite against the ORIGINAL — never rewrite-vs-rewrite (a steered rewrite must not
// bootstrap itself across iterations).

import type { SideGenKind } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { RefineryRun, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { ResponseFormat, SummarizeOptions } from "@orb/contracts/role-clients";
import { refineryRuns, refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { RefineryContext } from "../context.ts";
import { RefineryRunFailedError, RefineryStageNotReadyError } from "../contract/errors.ts";
import type { StagePrompts } from "../contract/prompts.ts";
import type { RefinerySessionView } from "../contract/results.ts";
import type { ExecuteStage, RefineryService, StageEngineDeps } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";
import { buildAnalyzePrompt, buildRewritePrompt, buildScorePrompt, overlayRewrite } from "../substrate/refine-prompt.ts";
import { buildStageParse } from "../substrate/stage-parse.ts";
import { traceStructuredRetry } from "../substrate/structured-retry-trace.ts";

// The wire grammar per stage — the SAME schemas the parse validates (D79's one-representation law).
// Module-const like distill's: the D126 shaping is the backend's request-build concern, not ours.
const RESPONSE_FORMATS: Record<RefineryStage, ResponseFormat> = {
  score: { name: "refinery_score", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.score) },
  rewrite: { name: "refinery_rewrite", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.rewrite) },
  analyze: { name: "refinery_analyze", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze) },
};

const POSTURE_BY_STAGE: Record<RefineryStage, SideGenKind> = {
  score: "refine_score",
  rewrite: "refine_rewrite",
  analyze: "refine_analyze",
};

/** The service verb — the engine below with `isRefinement:false` (the engine instance arrives via deps
 *  so `iterate` provably runs the SAME one; wired at `service.ts`). */
export function createRunStage(_ctx: RefineryContext, deps: StageEngineDeps): RefineryService["runStage"] {
  return ({ principal, sessionId, stage }) => deps.executeStage({ principal, sessionId, stage, isRefinement: false });
}

/** One resolved stage pass — belts done, prose + posture resolved, run identity minted. Carried whole so
 *  the per-arm helpers and the bounded retry provably run the SAME pass. */
interface StagePass {
  readonly session: RefinerySessionView;
  readonly sampleOpts: SummarizeOptions;
  readonly overrides: Awaited<ReturnType<RefineryContext["resolveUserProse"]>>;
  readonly meta: {
    readonly id: ReturnType<RefineryContext["newRefineryRunId"]>;
    readonly sessionId: Parameters<ExecuteStage>[0]["sessionId"];
    readonly iteration: number;
    readonly model: ModelId;
    readonly createdAt: number;
  };
}

/** Build the stage engine (`contract/service.ts` `ExecuteStage`) — `runStage` IS this with
 *  `isRefinement:false`; `iterate` runs it twice per round. Reloads the session per call so an iterate
 *  round's analyze sees the rewrite that just landed. */
export function createExecuteStage(ctx: RefineryContext): ExecuteStage {
  return async ({ principal, sessionId, stage, isRefinement }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      // Foreign and absent collapse (leak-free NOT_FOUND — the cross-tenant sweep's required shape).
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const session = sessionViewOf(row);
    const prior = await readPriorRuns(ctx, sessionId);
    assertStageReady(stage, isRefinement, prior);
    const pass = await resolveStagePass(ctx, { ownerId, sessionId, stage, session });
    const view = await dispatchStage(ctx, { ownerId, stage, isRefinement, prior, pass });

    // A run makes the session live again (status is a roster label, never a lock — design §9.2).
    await ctx.db.update(refinerySessions).set({ status: "active", updatedAt: pass.meta.createdAt }).where(eq(refinerySessions.id, sessionId));
    return view;
  };
}

/** The §7.5 dispatch: one arm per stage, each appending its run and stamping the signals half it owns
 *  (F6: score → `score`, analyze → `analysis`; rewrite stamps nothing — its canon write is `applyFields`). */
async function dispatchStage(
  ctx: RefineryContext,
  args: {
    readonly ownerId: Parameters<ExecuteStage>[0]["principal"]["userId"];
    readonly stage: RefineryStage;
    readonly isRefinement: boolean;
    readonly prior: PriorRuns;
    readonly pass: StagePass;
  },
): Promise<RefineryRun> {
  const { ownerId, stage, isRefinement, prior, pass } = args;
  const session = pass.session;
  if (stage === "score") {
    const view = await runScoreArm(ctx, pass);
    if (view.stage === "score") {
      await ctx.stampRefinerySignals({ ownerId, characterId: session.characterId, patch: { score: view.payload.overallScore } });
    }
    return view;
  }
  if (stage === "rewrite") {
    return runRewriteArm(ctx, pass, {
      working: prior.rewrite === null ? session.originalCard : overlayRewrite(session.originalCard, prior.rewrite),
      score: prior.score,
      analyzeFeedback: isRefinement ? prior.analyze : null,
    });
  }
  // analyze — the precondition guaranteed the rewrite payload; the anchor is the ORIGINAL.
  const view = await runAnalyzeArm(ctx, pass, prior.rewrite ?? { fields: [] });
  if (view.stage === "analyze") {
    await ctx.stampRefinerySignals({ ownerId, characterId: session.characterId, patch: { analysis: view.payload } });
  }
  return view;
}

/** The prior-run context every stage reads: the latest VALID payload per stage (an unparseable stored
 *  payload reads as absent — the read seam's posture). */
interface PriorRuns {
  readonly score: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["score"]> | null;
  readonly rewrite: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["rewrite"]> | null;
  readonly analyze: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["analyze"]> | null;
}

async function readPriorRuns(ctx: RefineryContext, sessionId: Parameters<ExecuteStage>[0]["sessionId"]): Promise<PriorRuns> {
  const [score, rewrite, analyze] = await Promise.all([
    latestRunRowOf(ctx.db, sessionId, "score"),
    latestRunRowOf(ctx.db, sessionId, "rewrite"),
    latestRunRowOf(ctx.db, sessionId, "analyze"),
  ]);
  const scoreParsed = score === undefined ? null : REFINERY_STAGE_PAYLOADS.score.safeParse(score.payload);
  const rewriteParsed = rewrite === undefined ? null : REFINERY_STAGE_PAYLOADS.rewrite.safeParse(rewrite.payload);
  const analyzeParsed = analyze === undefined ? null : REFINERY_STAGE_PAYLOADS.analyze.safeParse(analyze.payload);
  return {
    score: scoreParsed !== null && scoreParsed.success ? scoreParsed.data : null,
    rewrite: rewriteParsed !== null && rewriteParsed.success ? rewriteParsed.data : null,
    analyze: analyzeParsed !== null && analyzeParsed.success ? analyzeParsed.data : null,
  };
}

/** Stage-order preconditions (AFTER the ownership belt — statements about the session's state). */
function assertStageReady(stage: RefineryStage, isRefinement: boolean, prior: PriorRuns): void {
  if (stage === "analyze" && prior.rewrite === null) {
    throw new RefineryStageNotReadyError("There is no rewrite to analyze yet — run the rewrite stage first.");
  }
  if (isRefinement && stage === "rewrite" && prior.analyze === null) {
    throw new RefineryStageNotReadyError("There is no analysis to refine against yet — run analyze first.");
  }
}

/** Resolve one pass (owner prose + the posture ladder — the caller IS the card owner, so the preset rung
 *  always applies) + mint the run identity. Carried whole (StagePass) so the arms and the bounded retry
 *  provably run the SAME pass. */
async function resolveStagePass(
  ctx: RefineryContext,
  args: {
    readonly ownerId: Parameters<ExecuteStage>[0]["principal"]["userId"];
    readonly sessionId: Parameters<ExecuteStage>[0]["sessionId"];
    readonly stage: RefineryStage;
    readonly session: RefinerySessionView;
  },
): Promise<StagePass> {
  const { ownerId, sessionId, stage, session } = args;
  const overrides = await ctx.resolveUserProse(ownerId);
  const presetParams = await ctx.resolveUserPresetParams(ownerId);
  return {
    session,
    overrides,
    sampleOpts: {
      responseFormat: RESPONSE_FORMATS[stage],
      ...toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES[POSTURE_BY_STAGE[stage]], presetParams)),
    },
    meta: {
      id: ctx.newRefineryRunId(),
      sessionId,
      iteration: session.iterationCount,
      model: castId<ModelId>(ctx.summarizerModel),
      createdAt: ctx.now(),
    },
  };
}

async function runScoreArm(ctx: RefineryContext, pass: StagePass): Promise<RefineryRun> {
  const { session } = pass;
  const prompts = buildScorePrompt({
    card: session.originalCard,
    selection: session.selection,
    mode: session.stageConfig.score.mode,
    guidance: session.guidance,
    overrides: pass.overrides,
  });
  const turn = await runOne(ctx, { prompts, sampleOpts: pass.sampleOpts, lane: "refine-score", payloadSchema: REFINERY_STAGE_PAYLOADS.score });
  const view = {
    ...pass.meta,
    promptTokens: turn.promptTokens,
    outputTokens: turn.outputTokens,
    stage: "score" as const,
    payloadConfig: session.stageConfig.score,
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

interface RewriteArmContext {
  readonly working: RefinerySessionView["originalCard"];
  readonly score: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["score"]> | null;
  readonly analyzeFeedback: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["analyze"]> | null;
}

async function runRewriteArm(ctx: RefineryContext, pass: StagePass, arm: RewriteArmContext): Promise<RefineryRun> {
  const { session } = pass;
  const prompts = buildRewritePrompt({
    card: arm.working,
    selection: session.selection,
    mode: session.stageConfig.rewrite.mode,
    guidance: session.guidance,
    overrides: pass.overrides,
    score: arm.score,
    analyzeFeedback: arm.analyzeFeedback,
  });
  const turn = await runOne(ctx, { prompts, sampleOpts: pass.sampleOpts, lane: "refine-rewrite", payloadSchema: REFINERY_STAGE_PAYLOADS.rewrite });
  const view = {
    ...pass.meta,
    promptTokens: turn.promptTokens,
    outputTokens: turn.outputTokens,
    stage: "rewrite" as const,
    payloadConfig: session.stageConfig.rewrite,
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

async function runAnalyzeArm(ctx: RefineryContext, pass: StagePass, rewrite: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["rewrite"]>): Promise<RefineryRun> {
  const { session } = pass;
  const prompts = buildAnalyzePrompt({
    originalCard: session.originalCard,
    selection: session.selection,
    mode: session.stageConfig.analyze.mode,
    guidance: session.guidance,
    overrides: pass.overrides,
    rewrite,
  });
  const turn = await runOne(ctx, { prompts, sampleOpts: pass.sampleOpts, lane: "refine-analyze", payloadSchema: REFINERY_STAGE_PAYLOADS.analyze });
  const view = {
    ...pass.meta,
    promptTokens: turn.promptTokens,
    outputTokens: turn.outputTokens,
    stage: "analyze" as const,
    payloadConfig: session.stageConfig.analyze,
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

interface RunOneArgs<T> {
  readonly prompts: StagePrompts;
  readonly sampleOpts: SummarizeOptions;
  readonly lane: Parameters<typeof traceStructuredRetry>[0];
  readonly payloadSchema: z.ZodType<T>;
}

/** One structured turn under the resolved pass: null-drop + capture parse (`buildStageParse`, fresh per
 *  call), `runStructuredTurn`'s ONE bounded retry (the correction appended to the SAME user prompt), the
 *  refinery retry trace. A double failure maps to the typed retryable error (original attached as
 *  `cause`); provider faults propagate. Returns the LAST attempt's provider usage for the run row. */
async function runOne<T>(
  ctx: RefineryContext,
  args: RunOneArgs<T>,
): Promise<{ payload: T; strippedKeys: readonly string[]; promptTokens: number | null; outputTokens: number | null }> {
  const parse = buildStageParse<T>(args.payloadSchema);
  let promptTokens: number | null = null;
  let outputTokens: number | null = null;
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? args.prompts.user : `${args.prompts.user}\n\n${correction}`;
    const res = await ctx.summarize([{ systemPrompt: args.prompts.system, userPrompt }], args.sampleOpts);
    const item = res.items[0];
    promptTokens = item?.usage.tokensIn ?? null;
    outputTokens = item?.usage.tokensOut ?? null;
    return item?.text ?? "";
  };
  try {
    const payload = await runStructuredTurn({ payloadSchema: parse.schema, run, onRetry: traceStructuredRetry(args.lane) });
    return { payload, strippedKeys: parse.strippedKeysOf(payload), promptTokens, outputTokens };
  } catch (err) {
    if (err instanceof StructuredOutputError) {
      throw new RefineryRunFailedError("The model returned nothing usable for that stage. Try again.", { cause: err });
    }
    throw err;
  }
}
