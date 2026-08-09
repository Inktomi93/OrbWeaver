// verb: preflight — the OUTPUT-BUDGET readout (owner directive 2; schema-renderer §8). Re-resolves the
// whole posture ladder PER CALL (floor + the owner's preset params — a preset edit shows up on the next
// read, the D126 discipline), assembles the REAL stage prompts through the same substrate the engine
// runs, and measures both directions: input (assembled prompt vs the summarize role's context window)
// and output (the §8 per-stage arithmetic vs the resolved max-output budget).
//
// ADVISORY BY DESIGN: QuadChars is an estimate and the copy says "likely", never a hard number
// (`@orb/kit/tokens`' own doctrine); preflight WARNS, never blocks — truncation still surfaces as the
// typed structured-output failure, this just prevents the paid-for retry. The reasoning-wire caveat
// (max_completion_tokens covers THINKING+TEXT on reasoning models) is surface copy, not arithmetic.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { RefineryRewriteMode, RefineryRewritePayload, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS, REFINERY_STAGES } from "@orb/contracts/refinery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { estimateTokens } from "@orb/kit/tokens";
import type { RefineryContext } from "../context.ts";
import type { StagePrompts } from "../contract/prompts.ts";
import type { PreflightResult, RefinerySessionView, StagePreflight } from "../contract/results.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";
import { buildAnalyzePrompt, buildCardSections, buildRewritePrompt, buildScorePrompt, overlayRewrite } from "../substrate/refine-prompt.ts";
import { resolveStageResolution } from "../substrate/stage-resolution.ts";

// ── the §8 output arithmetic (measured-mode promises, stated in the design; all advisory) ───────────────

/** What each rewrite MODE promises about length, as a factor over the selected input ("keep similar
 *  length" / "significantly expand" — the mode prose's own words). */
const REWRITE_MODE_FACTORS: Record<RefineryRewriteMode, number> = {
  conservative: 0.9,
  balanced: 1.2,
  expansive: 2.5,
};
/** JSON envelope overhead: the wrapper object + per-entry field/greetingIndex keys. */
const ENVELOPE_BASE_TOKENS = 30;
const ENVELOPE_PER_ENTRY_TOKENS = 15;
/** Headroom for the fill-empty/split arms (§7) — new fields have no baseline to measure. */
const REWRITE_HEADROOM = 1.15;
/** A score reply's per-target cost (three short critique strings + the numbers). */
const SCORE_TOKENS_PER_TARGET = 140;
/** An analyze reply is near-fixed-size (three bullet lists + the soul block). */
const ANALYZE_OUTPUT_TOKENS = 400;

/** How many addressable targets the selection names (fields + per-index greetings). */
function targetCountOf(session: RefinerySessionView): number {
  let count = 0;
  for (const field of session.selection.fields) {
    if (field === "greetings") {
      count += session.selection.greetingIndexes?.length ?? session.originalCard.greetings.length;
      continue;
    }
    count += 1;
  }
  return count;
}

/** The selected content's own token mass — the rewrite estimate's base. Measured off the SAME section
 *  renderer the prompt uses, so the two never drift. */
function selectedTokensOf(session: RefinerySessionView): number {
  return estimateTokens(buildCardSections(session.originalCard, session.selection));
}

function outputEstimateOf(stage: RefineryStage, session: RefinerySessionView): number {
  if (stage === "rewrite") {
    const mode = session.stageConfig.rewrite.mode;
    const targets = targetCountOf(session);
    const base = selectedTokensOf(session) * REWRITE_MODE_FACTORS[mode] + ENVELOPE_BASE_TOKENS + ENVELOPE_PER_ENTRY_TOKENS * targets;
    return Math.ceil(base * REWRITE_HEADROOM);
  }
  if (stage === "score") {
    return targetCountOf(session) * SCORE_TOKENS_PER_TARGET;
  }
  return ANALYZE_OUTPUT_TOKENS;
}

function inputEstimateOf(prompts: StagePrompts): number {
  return estimateTokens(`${prompts.system}\n${prompts.user}`);
}

/** The per-stage side-gen posture (the F4 keys, spelled once). */
const STAGE_POSTURE = {
  score: SIDE_GEN_POSTURES.refine_score,
  rewrite: SIDE_GEN_POSTURES.refine_rewrite,
  analyze: SIDE_GEN_POSTURES.refine_analyze,
} as const satisfies Record<RefineryStage, unknown>;

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
      const sampling = resolveSideGenSampling(STAGE_POSTURE[stage], presetParams);
      const prompts = stagePromptsOf(stage, resolution, { session, working, rewritePayload, overrides });
      return {
        stage,
        model,
        temperature: sampling.temperature ?? null,
        maxOutputTokens: sampling.maxOutputTokens ?? null,
        inputEstimate: inputEstimateOf(prompts),
        outputEstimate: outputEstimateOf(stage, session),
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
