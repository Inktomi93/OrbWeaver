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
//
// THE CUSTOM ARM (R3/SF — docs/history/design/refinery-r3-build-plan.md §4): a session whose score/analyze config
// is `{kind:"custom", schemaId}` resolves the OWNED schema row PER CALL (a schema edit governs the next
// run — the D126 discipline; a deleted schema is a leak-free NOT_FOUND), lifts it (`liftJsonSchema` — the
// stored blob is liftable by the save belt's invariant, re-lifted defensively here), and runs the SAME
// engine: the lifted zod is the validator, the projection is the wire grammar, and the run row EMBEDS
// `{schemaId, schemaVersion, schema}` so the append-only log never dereferences a live row (P1-B).
// F6 under custom: score still stamps `overallScore` (the well-known core pins the 1-10 scale); analyze
// does NOT stamp `analysis` — canon's `characters.refinery.analysis` is the TYPED fixed payload, so a
// custom analyze lives in the run ledger only (stated in the Setup tab's copy).
//
// OPERATE-BACK (schema-renderer §16.1): `rewriteRunId` lets an analyze judge an EARLIER rewrite of this
// session — the new analyze row appends with that run as its DAG parent, provenance stays true, nothing
// mutates. Legal only with `stage:"analyze"`.
//
// THE OUTPUT CAP IS PAYLOAD-AWARE, AND IT IS RESOLVED PER ARM (live e2e, 2026-08-09). This engine used to
// request the stage's STATIC `SIDE_GEN_POSTURES` floor, resolved once in `resolveStagePass` before any
// prompt existed. On the default selection of an ordinary card that floor (768 for score) was smaller than
// the payload the stage asks the model to produce, so both the first attempt and the bounded retry came back
// `finish_reason:"length"` and the whole stage 503'd — while the surface's own fit line had already printed
// `out ≈ 980 / 768 tok ⚠`. The budget now comes from `substrate/output-budget`, the same expression
// `preflight` reports, and the fold happens at the ARM because the window clamp needs the assembled prompt.
// The ladder is unchanged: a user's preset `maxOutputTokens` still wins outright.
//
// …AND A GUARANTEED OVERRUN IS NOW REFUSED, NOT ATTEMPTED (owner ruling on the same e2e's open fork 1). The
// payload-aware floor fixed the DEFAULT case; the case left standing was a caller whose own preset caps
// `maxOutputTokens` under their payload — where the arithmetic is equally certain and the outcome equally
// useless (two model calls, `finish_reason:"length"` twice, a 503). `assertStageBudgetFits` decides that
// BEFORE any prompt is assembled or any token is decoded, and refuses with the fit receipt (need · cap ·
// the knob) as a typed BAD_REQUEST the client quotes. Preflight is unchanged and still only WARNS — it is a
// readout, and a readout that refused would be a readout nobody could read.

import type { RefineryRun, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { ResponseFormat, RoleClients, StructuredOptions } from "@orb/contracts/role-clients";
import { refineryRuns, refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ModelId, RefineryRunId } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { estimateTokens } from "@orb/kit/tokens";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { addSpanEvent } from "#foundation/observability";
import type { RefineryContext } from "../context.ts";
import { RefineryOutputBudgetError, RefineryRunFailedError, RefineryStageNotReadyError } from "../contract/errors.ts";
import type { StageEstimateSubject, StagePrompts, StageResolution } from "../contract/prompts.ts";
import type { RefinerySessionView } from "../contract/results.ts";
import type { ExecuteStage, RefineryService, StageEngineDeps } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, loadSessionRewriteRunRow, sessionViewOf } from "../persistence/queries.ts";
import { resolveStageSampling, stageBudgetMisfitOf, stageSubjectOf } from "../substrate/output-budget.ts";
import { buildAnalyzePrompt, buildRewritePrompt, buildScorePrompt, overlayRewrite } from "../substrate/refine-prompt.ts";
import { buildStageParse } from "../substrate/stage-parse.ts";
import { REFINERY_RESPONSE_FORMATS, resolveStageResolution } from "../substrate/stage-resolution.ts";
import { traceStructuredRetry } from "../substrate/structured-retry-trace.ts";
import { summarizerFactsOf } from "../substrate/summarizer.ts";

/** The custom-score stamp pluck — the well-known core the save belt guarantees. A drifted row skips the
 *  stamp OBSERVABLY (banned-silent-fork), never fabricates a score. */
const overallScoreCoreSchema = z.object({ overallScore: z.number() });

/** The service verb — the engine below with `isRefinement:false` (the engine instance arrives via deps
 *  so `iterate` provably runs the SAME one; wired at `service.ts`). */
export function createRunStage(ctx: RefineryContext, deps: StageEngineDeps): RefineryService["runStage"] {
  return async ({ principal, sessionId, stage, rewriteRunId }) => {
    try {
      return await deps.executeStage({ principal, sessionId, stage, isRefinement: false, rewriteRunId });
    } finally {
      // ONE emit per VERB, in a `finally` — the freshness event must be TOTAL over the outcomes, because the
      // run ledger is append-only: a stage that stamped signals and then threw still moved reads. This is
      // exactly the parity the client had before the bus (`createEntityMutation.onSettled` fires on error
      // too). The emit is NOT inside the shared engine: `iterate` runs it twice per round, and three ticks
      // for one round is the double-invalidate storm (an invalidate CANCELS and restarts an in-flight fetch).
      ctx.emitUserEvent(principal.userId, { type: "refineryChanged", sessionId });
    }
  };
}

/** One resolved stage pass — belts done, prose + posture + payload arm resolved, run identity minted.
 *  Carried whole so the per-arm helpers and the bounded retry provably run the SAME pass. */
interface StagePass {
  readonly session: RefinerySessionView;
  /** The owner's role-client bundle — every stage turn is `structured` on it (§7.5-1). */
  readonly rc: RoleClients;
  /** The resolved summarize model's window, read ONCE per pass (`summarizerFactsOf`). */
  readonly contextTokens: number | null;
  /** The wire grammar this pass runs under (fixed contract or the custom schema's projection). */
  readonly responseFormat: ResponseFormat;
  /** The ladder's TOP rung, carried unresolved: the output budget can only be sized once the arm has
   *  assembled its prompt, so the fold happens at the call ({@link sampleOptsFor}), not here. */
  readonly presetParams: SideGenSampling | undefined;
  /** WHAT this pass will ask the model to produce (card + selection + the rewrite mode) — derived ONCE per
   *  pass so the refusal verdict and the wire's cap provably measure the same payload. */
  readonly subject: StageEstimateSubject;
  readonly stage: RefineryStage;
  readonly overrides: Awaited<ReturnType<RefineryContext["resolveUserProse"]>>;
  readonly resolution: StageResolution;
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
  return async ({ principal, sessionId, stage, isRefinement, rewriteRunId }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      // Foreign and absent collapse (leak-free NOT_FOUND — the cross-tenant sweep's required shape).
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const session = sessionViewOf(row);
    if (rewriteRunId !== undefined && stage !== "analyze") {
      throw new RefineryStageNotReadyError("Only the analyze stage can target an earlier rewrite run.");
    }
    const prior = await readPriorRuns(ctx, sessionId);
    // Operate-back: the explicit rewrite REPLACES "latest" for this analyze — same session, same belts.
    if (rewriteRunId !== undefined) {
      const named = await loadSessionRewriteRunRow(ctx.db, sessionId, rewriteRunId);
      const parsed = named === undefined ? null : priorRunOf(named, REFINERY_STAGE_PAYLOADS.rewrite);
      if (parsed === null) {
        throw new DomainNotFoundError("refinery run", rewriteRunId);
      }
      return executeResolved(ctx, { ownerId, stage, isRefinement, prior: { ...prior, rewrite: parsed }, session, sessionId });
    }
    return executeResolved(ctx, { ownerId, stage, isRefinement, prior, session, sessionId });
  };
}

async function executeResolved(
  ctx: RefineryContext,
  args: {
    readonly ownerId: Parameters<ExecuteStage>[0]["principal"]["userId"];
    readonly stage: RefineryStage;
    readonly isRefinement: boolean;
    readonly prior: PriorRuns;
    readonly session: RefinerySessionView;
    readonly sessionId: Parameters<ExecuteStage>[0]["sessionId"];
  },
): Promise<RefineryRun> {
  const { ownerId, stage, isRefinement, prior, session, sessionId } = args;
  assertStageReady(stage, isRefinement, prior);
  const pass = await resolveStagePass(ctx, { ownerId, sessionId, stage, session });
  assertStageBudgetFits(pass);
  const view = await dispatchStage(ctx, { ownerId, stage, isRefinement, prior, pass });

  // A run makes the session live again (status is a roster label, never a lock — design §9.2).
  await ctx.db.update(refinerySessions).set({ status: "active", updatedAt: pass.meta.createdAt }).where(eq(refinerySessions.id, sessionId));
  return view;
}

/** The §7.5 dispatch: one arm per stage, each appending its run and stamping the signals half it owns
 *  (F6: score → `score`, analyze → `analysis`; rewrite stamps nothing — its canon write is `applyFields`). */
function dispatchStage(
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
  if (stage === "score") {
    return dispatchScore(ctx, ownerId, pass);
  }
  if (stage === "rewrite") {
    return dispatchRewrite(ctx, { isRefinement, prior, pass });
  }
  return dispatchAnalyze(ctx, ownerId, pass, prior);
}

async function dispatchScore(ctx: RefineryContext, ownerId: Parameters<ExecuteStage>[0]["principal"]["userId"], pass: StagePass): Promise<RefineryRun> {
  const view = await runScoreArm(ctx, pass);
  const core = overallScoreCoreSchema.safeParse(view.payload);
  if (core.success) {
    await ctx.stampRefinerySignals({ ownerId, characterId: pass.session.characterId, patch: { score: core.data.overallScore } });
  } else {
    // Unreachable for a fixed run; for custom it means the core drifted past the save belt — observable.
    addSpanEvent("refinery.stamp.skipped", { stage: "score", reason: "no-overall-score-core" });
  }
  return view;
}

function dispatchRewrite(
  ctx: RefineryContext,
  args: { readonly isRefinement: boolean; readonly prior: PriorRuns; readonly pass: StagePass },
): Promise<RefineryRun> {
  const { isRefinement, prior, pass } = args;
  const session = pass.session;
  // The DAG parent of a rewrite is the run it WORKED FROM: the analyze it refines against on a
  // refinement round, else the score it addresses. Null on a cold first pass.
  const parent = isRefinement ? prior.analyze : prior.score;
  return runRewriteArm(ctx, pass, {
    working: prior.rewrite === null ? session.originalCard : overlayRewrite(session.originalCard, prior.rewrite.payload),
    score: prior.score?.payload ?? null,
    analyzeFeedback: isRefinement ? (prior.analyze?.payload ?? null) : null,
    sourceRunId: parent === null ? null : parent.id,
  });
}

/** analyze — the precondition guaranteed the rewrite payload; the anchor is the ORIGINAL. The stamp is
 *  FIXED-only (header): canon's `characters.refinery.analysis` is the typed fixed payload, so a custom
 *  analyze lives in the run ledger alone. The re-parse is the type-honest narrow (cheap, one payload). */
async function dispatchAnalyze(
  ctx: RefineryContext,
  ownerId: Parameters<ExecuteStage>[0]["principal"]["userId"],
  pass: StagePass,
  prior: PriorRuns,
): Promise<RefineryRun> {
  const view = await runAnalyzeArm(ctx, pass, prior.rewrite);
  if (view.payloadConfig.kind === "fixed") {
    const fixedAnalyze = REFINERY_STAGE_PAYLOADS.analyze.safeParse(view.payload);
    if (fixedAnalyze.success) {
      await ctx.stampRefinerySignals({ ownerId, characterId: pass.session.characterId, patch: { analysis: fixedAnalyze.data } });
    }
  }
  return view;
}

/** One prior run a stage may consume: its payload AND its identity. The id rides ALONGSIDE the payload,
 *  never separately, so a run can only ever cite a parent it actually READ — a row whose stored payload no
 *  longer parses is absent on both halves at once (the read seam's posture). */
interface PriorRun<T> {
  readonly id: RefineryRunId;
  readonly payload: T;
}

/** The prior-run context every stage reads: the latest VALID run per stage. The score/analyze halves are
 *  context PROSE (rendered into rewrite prompts), so a CUSTOM prior run — whose payload has no fixed
 *  shape — is absent here by construction: the fixed parse below drops it, and the rewrite grounds on the
 *  card + guidance alone. */
interface PriorRuns {
  readonly score: PriorRun<z.infer<(typeof REFINERY_STAGE_PAYLOADS)["score"]>> | null;
  readonly rewrite: PriorRun<z.infer<(typeof REFINERY_STAGE_PAYLOADS)["rewrite"]>> | null;
  readonly analyze: PriorRun<z.infer<(typeof REFINERY_STAGE_PAYLOADS)["analyze"]>> | null;
}

/** Pair a row with its parsed payload, or null when the row is absent OR its payload no longer parses. */
function priorRunOf<T>(row: { id: RefineryRunId; payload: unknown } | undefined, schema: z.ZodType<T>): PriorRun<T> | null {
  if (row === undefined) {
    return null;
  }
  const parsed = schema.safeParse(row.payload);
  return parsed.success ? { id: row.id, payload: parsed.data } : null;
}

async function readPriorRuns(ctx: RefineryContext, sessionId: Parameters<ExecuteStage>[0]["sessionId"]): Promise<PriorRuns> {
  const [score, rewrite, analyze] = await Promise.all([
    latestRunRowOf(ctx.db, sessionId, "score"),
    latestRunRowOf(ctx.db, sessionId, "rewrite"),
    latestRunRowOf(ctx.db, sessionId, "analyze"),
  ]);
  return {
    score: priorRunOf(score, REFINERY_STAGE_PAYLOADS.score),
    rewrite: priorRunOf(rewrite, REFINERY_STAGE_PAYLOADS.rewrite),
    analyze: priorRunOf(analyze, REFINERY_STAGE_PAYLOADS.analyze),
  };
}

/** The RULED budget refusal (see this file's header): a caller whose own preset caps `maxOutputTokens`
 *  below this stage's predicted payload is refused with the fit receipt, before any prompt assembly and
 *  before any decode. Runs AFTER the ownership belt and the stage-order precondition — a refusal that
 *  mentioned a session's token mass ahead of the belt would be an existence oracle. */
function assertStageBudgetFits(pass: StagePass): void {
  const misfit = stageBudgetMisfitOf({ subject: pass.subject, presetParams: pass.presetParams });
  if (misfit !== null) {
    throw new RefineryOutputBudgetError(pass.stage, misfit);
  }
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
 *  always applies) + the payload arm + mint the run identity. Carried whole (StagePass) so the arms and
 *  the bounded retry provably run the SAME pass. */
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
  const resolution = await resolveStageResolution(ctx, { ownerId, stage, session });
  const rc = await ctx.roleClientsFor(ownerId);
  const facts = await summarizerFactsOf(rc);
  return {
    session,
    rc,
    contextTokens: facts.contextTokens,
    stage,
    subject: stageSubjectOf(stage, session),
    overrides,
    resolution,
    presetParams,
    responseFormat: resolution.kind === "custom" ? resolution.responseFormat : REFINERY_RESPONSE_FORMATS[stage],
    meta: {
      id: ctx.newRefineryRunId(),
      sessionId,
      iteration: session.iterationCount,
      model: facts.model,
      createdAt: ctx.now(),
    },
  };
}

/** This call's summarize options: the wire grammar plus the ladder folded against THIS pass's assembled
 *  prompt, so the output cap is sized for the payload the stage is about to ask for rather than a static
 *  floor (`substrate/output-budget` — the ONE expression `preflight` also evaluates, which is why the fit
 *  line and the wire now carry the same number). Resolved per arm because the budget's window clamp needs
 *  the prompt, and only the arm has it. */
function sampleOptsFor(pass: StagePass, prompts: StagePrompts): StructuredOptions {
  const sampling = resolveStageSampling({
    subject: pass.subject,
    presetParams: pass.presetParams,
    contextTokens: pass.contextTokens,
    inputEstimate: estimateTokens(`${prompts.system}\n${prompts.user}`),
  });
  return { responseFormat: pass.responseFormat, ...sampling };
}

/** The three ECONOMIC columns of a finished run, resolved identically for every stage: the provider's own
 *  usage (null only when the backend reports none) and the pass's wall time. Measured from `meta.createdAt`
 *  — the moment the pass was resolved — so the number covers prompt assembly and the bounded structured
 *  retry, which is what a user comparing two runs actually waited. */
function runCost(
  ctx: RefineryContext,
  pass: StagePass,
  turn: { readonly promptTokens: number | null; readonly outputTokens: number | null },
): { promptTokens: number | null; outputTokens: number | null; durationMs: number } {
  return { promptTokens: turn.promptTokens, outputTokens: turn.outputTokens, durationMs: ctx.now() - pass.meta.createdAt };
}

async function runScoreArm(ctx: RefineryContext, pass: StagePass): Promise<RefineryRun> {
  const { session, resolution } = pass;
  const prompts = buildScorePrompt({
    card: session.originalCard,
    selection: session.selection,
    mode: resolution.kind === "custom" ? null : sessionScoreMode(session),
    guidance: session.guidance,
    overrides: pass.overrides,
    customInstruction: resolution.kind === "custom" ? resolution.instruction : undefined,
    shapeText: resolution.kind === "custom" ? resolution.shapeText : undefined,
  });
  if (resolution.kind === "custom") {
    const turn = await runOne({
      rc: pass.rc,
      prompts,
      sampleOpts: sampleOptsFor(pass, prompts),
      lane: "refine-score",
      payloadSchema: resolution.payloadSchema,
    });
    const view = {
      ...pass.meta,
      ...runCost(ctx, pass, turn),
      sourceRunId: null,
      stage: "score" as const,
      payloadConfig: resolution.runConfig,
      payload: turn.payload as Record<string, unknown>,
      strippedKeys: [...turn.strippedKeys],
    };
    await ctx.db.insert(refineryRuns).values(view);
    return view;
  }
  const turn = await runOne({
    rc: pass.rc,
    prompts,
    sampleOpts: sampleOptsFor(pass, prompts),
    lane: "refine-score",
    payloadSchema: REFINERY_STAGE_PAYLOADS.score,
  });
  const view = {
    ...pass.meta,
    ...runCost(ctx, pass, turn),
    // A score critiques the ORIGINAL card and consumes no prior run — a DAG root, always.
    sourceRunId: null,
    stage: "score" as const,
    payloadConfig: { kind: "fixed" as const, mode: sessionScoreMode(session) },
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

/** The session's fixed score mode — the config parse guaranteed the arm when the resolution is fixed. */
function sessionScoreMode(session: RefinerySessionView): Extract<RefinerySessionView["stageConfig"]["score"], { kind: "fixed" }>["mode"] {
  const config = session.stageConfig.score;
  return config.kind === "fixed" ? config.mode : "full";
}

function sessionAnalyzeMode(session: RefinerySessionView): Extract<RefinerySessionView["stageConfig"]["analyze"], { kind: "fixed" }>["mode"] {
  const config = session.stageConfig.analyze;
  return config.kind === "fixed" ? config.mode : "full";
}

interface RewriteArmContext {
  readonly working: RefinerySessionView["originalCard"];
  readonly score: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["score"]> | null;
  readonly analyzeFeedback: z.infer<(typeof REFINERY_STAGE_PAYLOADS)["analyze"]> | null;
  /** The run this rewrite worked FROM (the DAG parent) — resolved by the dispatch, never re-derived here. */
  readonly sourceRunId: RefineryRunId | null;
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
  const turn = await runOne({
    rc: pass.rc,
    prompts,
    sampleOpts: sampleOptsFor(pass, prompts),
    lane: "refine-rewrite",
    payloadSchema: REFINERY_STAGE_PAYLOADS.rewrite,
  });
  const view = {
    ...pass.meta,
    ...runCost(ctx, pass, turn),
    sourceRunId: arm.sourceRunId,
    stage: "rewrite" as const,
    payloadConfig: session.stageConfig.rewrite,
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

async function runAnalyzeArm(ctx: RefineryContext, pass: StagePass, rewrite: PriorRuns["rewrite"]): Promise<RefineryRun> {
  const { session, resolution } = pass;
  const prompts = buildAnalyzePrompt({
    originalCard: session.originalCard,
    selection: session.selection,
    mode: resolution.kind === "custom" ? null : sessionAnalyzeMode(session),
    guidance: session.guidance,
    overrides: pass.overrides,
    rewrite: rewrite?.payload ?? { fields: [] },
    customInstruction: resolution.kind === "custom" ? resolution.instruction : undefined,
    shapeText: resolution.kind === "custom" ? resolution.shapeText : undefined,
  });
  if (resolution.kind === "custom") {
    const turn = await runOne({
      rc: pass.rc,
      prompts,
      sampleOpts: sampleOptsFor(pass, prompts),
      lane: "refine-analyze",
      payloadSchema: resolution.payloadSchema,
    });
    const view = {
      ...pass.meta,
      ...runCost(ctx, pass, turn),
      sourceRunId: rewrite?.id ?? null,
      stage: "analyze" as const,
      payloadConfig: resolution.runConfig,
      payload: turn.payload as Record<string, unknown>,
      strippedKeys: [...turn.strippedKeys],
    };
    await ctx.db.insert(refineryRuns).values(view);
    return view;
  }
  const turn = await runOne({
    rc: pass.rc,
    prompts,
    sampleOpts: sampleOptsFor(pass, prompts),
    lane: "refine-analyze",
    payloadSchema: REFINERY_STAGE_PAYLOADS.analyze,
  });
  const view = {
    ...pass.meta,
    ...runCost(ctx, pass, turn),
    // The DAG parent of an analyze is the rewrite it JUDGED — the edge that makes "which rewrite was this
    // verdict about?" answerable once step-back exists.
    sourceRunId: rewrite?.id ?? null,
    stage: "analyze" as const,
    payloadConfig: { kind: "fixed" as const, mode: sessionAnalyzeMode(session) },
    payload: turn.payload,
    strippedKeys: [...turn.strippedKeys],
  };
  await ctx.db.insert(refineryRuns).values(view);
  return view;
}

interface RunOneArgs<T> {
  readonly rc: RoleClients;
  readonly prompts: StagePrompts;
  readonly sampleOpts: StructuredOptions;
  readonly lane: Parameters<typeof traceStructuredRetry>[0];
  readonly payloadSchema: z.ZodType<T>;
}

/** One structured turn under the resolved pass: null-drop + capture parse (`buildStageParse`, fresh per
 *  call), `runStructuredTurn`'s ONE bounded retry (the correction appended to the SAME user prompt), the
 *  refinery retry trace. A double failure maps to the typed retryable error (original attached as
 *  `cause`); provider faults propagate. Returns the LAST attempt's provider usage for the run row. */
async function runOne<T>(
  args: RunOneArgs<T>,
): Promise<{ payload: T; strippedKeys: readonly string[]; promptTokens: number | null; outputTokens: number | null }> {
  const parse = buildStageParse<T>(args.payloadSchema);
  let promptTokens: number | null = null;
  let outputTokens: number | null = null;
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? args.prompts.user : `${args.prompts.user}\n\n${correction}`;
    const res = await args.rc.structured([{ systemPrompt: args.prompts.system, userPrompt }], args.sampleOpts);
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
