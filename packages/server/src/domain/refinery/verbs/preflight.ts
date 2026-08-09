// verb: preflight — the OUTPUT-BUDGET readout (owner directive 2; schema-renderer §8). Re-resolves the
// whole posture ladder PER CALL (floor + the owner's preset params — a preset edit shows up on the next
// read, the D126 discipline), assembles the REAL stage prompts through the same substrate the engine
// runs, and measures both directions: input (assembled prompt vs the summarize role's context window)
// and output (the §8 per-stage arithmetic vs the resolved max-output budget).
//
// ADVISORY BY DESIGN: QuadChars is an estimate and the copy says "likely", never a hard number
// (`@orb/kit/tokens`' own doctrine); preflight WARNS, never blocks. That is unchanged by the 2026-08-09
// ruling that the RUN refuses a caller-capped overrun (`verbs/run-stage.ts` → `RefineryOutputBudgetError`):
// the readout's job is to show the fit BEFORE anyone commits, and a readout that refused would be a readout
// nobody could read. The two agree by construction — the refusal's predicate is this line's own predicate
// over this line's own numbers. The reasoning-wire caveat (max_completion_tokens covers THINKING+TEXT on
// reasoning models) is surface copy, not arithmetic.
//
// THE ARITHMETIC IS NOT PRIVATE TO THIS VERB (live e2e, 2026-08-09). It used to be, and the engine never
// read it — so this readout could tell the user `out ≈ 980 / 768 tok ⚠` while `runStage` went ahead and
// requested 768, truncated on both attempts and failed the stage. Both halves now derive from
// `substrate/output-budget.ts`: `maxOutputTokens` below is the budget the NEXT RUN WILL ACTUALLY REQUEST,
// not a static floor the run has no obligation to honour.

import type { RefineryRewritePayload, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS, REFINERY_STAGES } from "@orb/contracts/refinery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import type { RefineryContext } from "../context.ts";
import type { StagePrompts } from "../contract/prompts.ts";
import type { PreflightResult, RefinerySessionView, StagePreflight } from "../contract/results.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";
import { outputEstimateOf, resolveStageSampling, stageSubjectOf } from "../substrate/output-budget.ts";
import { buildAnalyzePrompt, buildRewritePrompt, buildScorePrompt, overlayRewrite } from "../substrate/refine-prompt.ts";
import { resolveStageResolution } from "../substrate/stage-resolution.ts";

function inputEstimateOf(prompts: StagePrompts): number {
  return estimateTokens(`${prompts.system}\n${prompts.user}`);
}

interface PromptContext {
  readonly session: RefinerySessionView;
  readonly working: RefinerySessionView["originalCard"];
  readonly rewritePayload: RefineryRewritePayload;
  readonly overrides: Awaited<ReturnType<RefineryContext["resolveUserProse"]>>;
}

/** Assemble the REAL stage prompts (the same substrate the engine runs) for one stage's estimate. */
function stagePromptsOf(stage: RefineryStage, resolution: Awaited<ReturnType<typeof resolveStageResolution>>, p: PromptContext): StagePrompts {
  const { session, working, rewritePayload, overrides } = p;
  const common = {
    selection: session.selection,
    guidance: session.guidance,
    overrides,
    customInstruction: resolution.kind === "custom" ? resolution.instruction : undefined,
    shapeText: resolution.kind === "custom" ? resolution.shapeText : undefined,
  };
  if (stage === "score") {
    return buildScorePrompt({ ...common, card: session.originalCard, mode: resolution.kind === "custom" ? null : fixedScoreMode(session) });
  }
  if (stage === "rewrite") {
    return buildRewritePrompt({
      card: working,
      selection: session.selection,
      mode: session.stageConfig.rewrite.mode,
      guidance: session.guidance,
      overrides,
      score: null,
      analyzeFeedback: null,
    });
  }
  return buildAnalyzePrompt({
    ...common,
    originalCard: session.originalCard,
    mode: resolution.kind === "custom" ? null : fixedAnalyzeMode(session),
    rewrite: rewritePayload,
  });
}

export function createPreflight(ctx: RefineryContext): RefineryService["preflight"] {
  return async ({ principal, sessionId }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const session = sessionViewOf(row);
    const [overrides, presetParams, priorRewriteRow] = await Promise.all([
      ctx.resolveUserProse(ownerId),
      ctx.resolveUserPresetParams(ownerId),
      latestRunRowOf(ctx.db, sessionId, "rewrite"),
    ]);
    const priorRewrite = priorRewriteRow === undefined ? null : REFINERY_STAGE_PAYLOADS.rewrite.safeParse(priorRewriteRow.payload);
    const rewritePayload = priorRewrite?.success === true ? priorRewrite.data : { fields: [] };
    // The working overlay mirrors the engine's (cleared entries shrink it, exactly as a run would see).
    const working = rewritePayload.fields.length === 0 ? session.originalCard : overlayRewrite(session.originalCard, rewritePayload);

    const model = castId<ModelId>(ctx.summarizerModel);
    const resolutions = await Promise.all(REFINERY_STAGES.map((stage) => resolveStageResolution(ctx, { ownerId, stage, session })));
    const stages: StagePreflight[] = REFINERY_STAGES.map((stage, i) => {
      const resolution = resolutions[i] ?? { kind: "fixed" as const };
      const prompts = stagePromptsOf(stage, resolution, { session, working, rewritePayload, overrides });
      const inputEstimate = inputEstimateOf(prompts);
      // The SAME expression the engine evaluates for this stage (substrate/output-budget) — so this readout
      // reports the budget the next run will request, never a floor the run is free to ignore.
      const subject = stageSubjectOf(stage, session);
      const sampling = resolveStageSampling({ subject, presetParams, contextTokens: ctx.summarizerContextTokens, inputEstimate });
      return {
        stage,
        model,
        temperature: sampling.temperature ?? null,
        maxOutputTokens: sampling.maxOutputTokens ?? null,
        inputEstimate,
        outputEstimate: outputEstimateOf(subject),
      };
    });
    return { contextTokens: ctx.summarizerContextTokens, stages } satisfies PreflightResult;
  };
}

function fixedScoreMode(session: RefinerySessionView): Exclude<RefinerySessionView["stageConfig"]["score"], { kind: "custom" }>["mode"] {
  const config = session.stageConfig.score;
  return config.kind === "fixed" ? config.mode : "full";
}

function fixedAnalyzeMode(session: RefinerySessionView): Exclude<RefinerySessionView["stageConfig"]["analyze"], { kind: "custom" }>["mode"] {
  const config = session.stageConfig.analyze;
  return config.kind === "fixed" ? config.mode : "full";
}
