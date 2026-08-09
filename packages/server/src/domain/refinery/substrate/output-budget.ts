// domain/refinery/substrate/output-budget — the §8 OUTPUT arithmetic, and the ONE home for the two numbers
// that must never disagree: what `preflight` PREDICTS a stage will emit, and what the stage engine actually
// REQUESTS as that call's output cap.
//
// WHY THIS FILE EXISTS (live e2e, 2026-08-09 — the defect it was extracted to kill). The arithmetic used to
// live privately inside `verbs/preflight.ts` and the engine never read it: `runStage` re-resolved the posture
// ladder on its own and asked for the static `refine_score` floor. So the surface could compute — and the
// user could READ, in the fit line — `out ≈ 980 / 768 tok ⚠`, i.e. "this run is going to truncate", and the
// run would then proceed to request 768 anyway, hit `finish_reason:"length"` on BOTH the first attempt and
// the bounded retry, and fail the whole stage with a 503 after ~21s of paid decode. Measured twice against
// the real fleet (Qwen3-VL-8B), on the default selection of an ordinary card. A prediction the caller cannot
// act on is not a preflight — it is a spectator. Both numbers are derived here now, so the budget the engine
// requests IS the prediction the surface shows, by construction.
//
// THE ESTIMATOR IS MEASURED, NOT GUESSED. The same live pass falsified the old per-target constant too: the
// prediction was 980 tokens and the model emitted 1 490 for that exact run. Under-estimating is not a
// cosmetic inaccuracy here — it is the truncation, one step removed. The constants below carry the run that
// set them; re-measure and re-state them rather than nudging a number without a receipt.
//
// EVERY NUMBER HERE IS ADVISORY BY CONSTRUCTION (`@orb/kit/tokens`' QuadChars doctrine) and the design's own
// stance is that preflight WARNS, never blocks. That stance is unchanged: this file makes the budget adapt so
// the ordinary case stops overrunning at all — it does not gate, refuse, or confirm anything.

import type { SideGenPosture } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { RefineryRewriteMode, RefineryStage } from "@orb/contracts/refinery";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { estimateTokens } from "@orb/kit/tokens";
import type { StageOutputBudgetArgs, StageSamplingArgs } from "../contract/prompts.ts";
import type { RefinerySessionView } from "../contract/results.ts";
import { buildCardSections } from "./refine-prompt.ts";
import { REFINERY_POSTURE_BY_STAGE } from "./stage-resolution.ts";

// ── the per-stage output arithmetic (§8; all advisory) ──────────────────────────────────────────────────

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
/** One scored target's reply cost: THREE prose critique strings (`strengths`/`weaknesses`/`suggestions`)
 *  plus the number and the addressing keys. MEASURED, not assumed — a live full-mode score of an ordinary
 *  card (Elias Thorn, 7 targets, Qwen3-VL-8B, 2026-08-09) emitted 1 490 output tokens ⇒ ~213 per target.
 *  The previous value was 140, which under-predicted that same run by a third; 220 states the measurement
 *  with the small round-up the sample size deserves. */
const SCORE_TOKENS_PER_TARGET = 220;
/** The score payload's NON-per-target mass: `summary` (a paragraph), `priorityImprovements` (a bullet list)
 *  and the JSON wrapper. Previously folded into the per-target constant, which made the estimate wrong in
 *  BOTH directions — over on a one-field selection, under on a wide one. */
const SCORE_ENVELOPE_TOKENS = 200;
/** An analyze reply is near-fixed-size (three bullet lists + the soul block + the verdict). */
const ANALYZE_OUTPUT_TOKENS = 700;

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

/** The §8 per-stage output PREDICTION — what the fit line shows and what the budget below is derived from.
 *  A CUSTOM score/analyze schema is predicted with the fixed arithmetic (the shape is user-authored and its
 *  prose mass is unknowable ahead of a run); the budget resolver's floor and headroom carry that case. */
export function outputEstimateOf(stage: RefineryStage, session: RefinerySessionView): number {
  if (stage === "rewrite") {
    const mode = session.stageConfig.rewrite.mode;
    const targets = targetCountOf(session);
    const base = selectedTokensOf(session) * REWRITE_MODE_FACTORS[mode] + ENVELOPE_BASE_TOKENS + ENVELOPE_PER_ENTRY_TOKENS * targets;
    return Math.ceil(base * REWRITE_HEADROOM);
  }
  if (stage === "score") {
    return targetCountOf(session) * SCORE_TOKENS_PER_TARGET + SCORE_ENVELOPE_TOKENS;
  }
  return ANALYZE_OUTPUT_TOKENS;
}

// ── the requested budget ────────────────────────────────────────────────────────────────────────────────

/** Slack over the prediction. `maxTokens` is a CAP, not an allocation — a budget the model does not spend
 *  costs nothing, while a budget one token short costs a truncated payload, the bounded retry, and a failed
 *  stage (~21s of decode for no result, measured). That asymmetry is the whole argument for being generous
 *  here, and the window clamp below is what keeps generous from becoming reckless.
 *
 *  WHY 2× AND NOT A TIGHT FIT (measured, 2026-08-09, Qwen3-VL-8B over live cards). Actual output against
 *  the prediction: score runs landed 1 490 / 1 619 / 1 852 / 2 026 against a 1 740 prediction — a spread of
 *  0.86× to 1.16×, i.e. a tight 1.25× cap was already within one verbose card of truncating. Rewrite is
 *  worse and its sample is CENSORED: a run predicted at 3 885 hit a 4 857 cap at `finish_reason:"length"`
 *  on both attempts, so its true need is unknown and \>1.25×. The reason is structural, not noise — the
 *  rewrite estimator scales a MODE FACTOR over the SELECTED input, and the APPEND arm (fork F-T1) emits
 *  whole new greetings that have no selected input to scale from. Until that arm is modelled, the cap is
 *  what absorbs it. */
const OUTPUT_BUDGET_HEADROOM = 2;
/** Window slack held back when clamping: the bounded structured RETRY re-sends the prompt with the zod
 *  issues appended, so the second attempt's input is strictly larger than the first's. */
const CONTEXT_RESERVE_TOKENS = 256;

/**
 * The output cap a stage call should REQUEST: the shipped floor, raised to cover the stage's own predicted
 * payload plus headroom, clamped so prompt + output still fit the resolved window.
 *
 * This is the FLOOR rung of the side-gen ladder, not a new rung above it — the caller folds the result
 * through `resolveSideGenSampling`, so a user's own preset `maxOutputTokens` still wins outright. A user who
 * caps the budget below their payload keeps the truncation they asked for, and the fit line keeps warning
 * about it; that policy call is the owner's, and nothing here decides it.
 */
function resolveStageOutputBudget(args: StageOutputBudgetArgs): number {
  const { estimate, floor, contextTokens, inputEstimate } = args;
  const want = Math.max(floor, Math.ceil(estimate * OUTPUT_BUDGET_HEADROOM));
  if (contextTokens === null) {
    return want;
  }
  const room = contextTokens - inputEstimate - CONTEXT_RESERVE_TOKENS;
  // A window with no room left for the floor is the INPUT-side overrun the fit line's other half warns
  // about — clamping below the shipped floor would silently turn that into a truncated output instead.
  return room <= floor ? floor : Math.min(want, room);
}

/**
 * THE one resolution of a stage call's sampling posture — the side-gen ladder with the stage's shipped floor
 * replaced by the payload-aware budget above.
 *
 * `preflight` and the stage ENGINE both go through here, and that is the point: the fit line's
 * `max output` and the number the next run puts on the wire are the same expression evaluated twice, not two
 * expressions that happen to agree today. (They did not agree, and the disagreement was the 503 — see this
 * file's header.)
 */
export function resolveStageSampling(args: StageSamplingArgs): SideGenSampling {
  const { stage, session, presetParams, contextTokens, inputEstimate } = args;
  const posture: SideGenPosture = SIDE_GEN_POSTURES[REFINERY_POSTURE_BY_STAGE[stage]];
  const floor = resolveStageOutputBudget({
    estimate: outputEstimateOf(stage, session),
    // `maxOutputTokens` is optional on `SideGenPosture` (compaction/caption ship without one), so the
    // absent arm is real at the type level. Zero is its correct reading here — "no shipped minimum" —
    // and leaves the payload estimate as the whole budget.
    floor: posture.maxOutputTokens ?? 0,
    contextTokens,
    inputEstimate,
  });
  return resolveSideGenSampling({ ...posture, maxOutputTokens: floor }, presetParams);
}
