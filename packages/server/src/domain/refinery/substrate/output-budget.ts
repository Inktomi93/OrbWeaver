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
// EVERY NUMBER HERE IS ADVISORY BY CONSTRUCTION (`@orb/kit/tokens`' QuadChars doctrine) and PREFLIGHT still
// WARNS, never blocks — a readout that refused would be a readout nobody could read. The one place a number
// here DECIDES anything is `stageBudgetMisfitOf` (below): the owner-ruled refusal for a run whose caller has
// explicitly capped `maxOutputTokens` under its own payload. That arm is narrow on purpose — it fires only on
// the user's OWN cap, never on the payload-aware floor this file resolves for everyone else.

import type { SideGenPosture } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { RefineryRewriteMode, RefineryStage } from "@orb/contracts/refinery";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { estimateTokens } from "@orb/kit/tokens";
import type { StageBudgetFitArgs, StageBudgetMisfit, StageEstimateSubject, StageOutputBudgetArgs, StageSamplingArgs } from "../contract/prompts.ts";
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
function targetCountOf(subject: StageEstimateSubject): number {
  let count = 0;
  for (const field of subject.selection.fields) {
    if (field === "greetings") {
      count += subject.selection.greetingIndexes?.length ?? subject.card.greetings.length;
      continue;
    }
    count += 1;
  }
  return count;
}

/** The selected content's own token mass — the rewrite estimate's base. Measured off the SAME section
 *  renderer the prompt uses, so the two never drift. */
function selectedTokensOf(subject: StageEstimateSubject): number {
  return estimateTokens(buildCardSections(subject.card, subject.selection));
}

/** THE session→subject derivation, in one place: every session-backed caller (`preflight`, the stage
 *  engine) reads its payload facts through this, so "what the estimate is about" cannot drift between the
 *  readout and the wire. The sweep builds its own subject per card — it has no session. */
export function stageSubjectOf(stage: RefineryStage, session: RefinerySessionView): StageEstimateSubject {
  if (stage === "rewrite") {
    return { stage, card: session.originalCard, selection: session.selection, mode: session.stageConfig.rewrite.mode };
  }
  return { stage, card: session.originalCard, selection: session.selection };
}

/** The §8 per-stage output PREDICTION — what the fit line shows, what the budget below is derived from, and
 *  what the ruled refusal measures a caller's cap against. A CUSTOM score/analyze schema is predicted with
 *  the fixed arithmetic (the shape is user-authored and its prose mass is unknowable ahead of a run); the
 *  budget resolver's floor and headroom carry that case. */
export function outputEstimateOf(subject: StageEstimateSubject): number {
  if (subject.stage === "rewrite") {
    const targets = targetCountOf(subject);
    const base = selectedTokensOf(subject) * REWRITE_MODE_FACTORS[subject.mode] + ENVELOPE_BASE_TOKENS + ENVELOPE_PER_ENTRY_TOKENS * targets;
    return Math.ceil(base * REWRITE_HEADROOM);
  }
  if (subject.stage === "score") {
    return targetCountOf(subject) * SCORE_TOKENS_PER_TARGET + SCORE_ENVELOPE_TOKENS;
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
/** Window slack held back when clamping, as a FIXED floor plus a band PROPORTIONAL to the input. Two sources
 *  of real input that the estimate misses, and only the second scales: the bounded structured RETRY re-sends
 *  the prompt with the zod issues appended (a small fixed addition — the floor), and `estimateTokens`
 *  (QuadChars, advisory) UNDER-counts the true tokenization by a fraction that grows with input length.
 *
 *  RECEIPT (live score sweep, 2026-08-10): a ~31.5k-token card prompt estimated ~31 312 tokens but tokenized
 *  to 31 569 — a 257-token (0.82%) undercount, ONE more than the fixed 256 reserve — so the clamp landed the
 *  output cap exactly on the context boundary and the wire 400'd by a single token (`32769 > 32768`). A fixed
 *  reserve cannot cover an error that scales with input; the proportional band does. 5% is generous over the
 *  observed 0.82% to absorb content that tokenizes DENSER than QuadChars (code, punctuation, CJK). */
const CONTEXT_RESERVE_FLOOR_TOKENS = 256;
const INPUT_ESTIMATE_UNDERCOUNT_FRACTION = 0.05;

function windowReserveOf(inputEstimate: number): number {
  return CONTEXT_RESERVE_FLOOR_TOKENS + Math.ceil(inputEstimate * INPUT_ESTIMATE_UNDERCOUNT_FRACTION);
}

/**
 * The output cap a stage call should REQUEST: the shipped floor, raised to cover the stage's own predicted
 * payload plus headroom, clamped so prompt + output still fit the resolved window.
 *
 * This is the FLOOR rung of the side-gen ladder, not a new rung above it — the caller folds the result
 * through `resolveSideGenSampling`, so a user's own preset `maxOutputTokens` still wins outright. What
 * happens when that explicit cap sits UNDER the payload is now ruled: see {@link stageBudgetMisfitOf}.
 */
function resolveStageOutputBudget(args: StageOutputBudgetArgs): number {
  const { estimate, floor, contextTokens, inputEstimate } = args;
  const want = Math.max(floor, Math.ceil(estimate * OUTPUT_BUDGET_HEADROOM));
  if (contextTokens === null) {
    return want;
  }
  const room = contextTokens - inputEstimate - windowReserveOf(inputEstimate);
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
  const { subject, presetParams, contextTokens, inputEstimate } = args;
  const posture: SideGenPosture = SIDE_GEN_POSTURES[REFINERY_POSTURE_BY_STAGE[subject.stage]];
  const floor = resolveStageOutputBudget({
    estimate: outputEstimateOf(subject),
    // `maxOutputTokens` is optional on `SideGenPosture` (compaction/caption ship without one), so the
    // absent arm is real at the type level. Zero is its correct reading here — "no shipped minimum" —
    // and leaves the payload estimate as the whole budget.
    floor: posture.maxOutputTokens ?? 0,
    contextTokens,
    inputEstimate,
  });
  return resolveSideGenSampling({ ...posture, maxOutputTokens: floor }, presetParams);
}

// ── the RULED refusal (owner ruling on live-e2e 2026-08-09 open fork 1) ──────────────────────────────────

/**
 * The one arm where a number here DECIDES: a run whose caller has EXPLICITLY capped `maxOutputTokens` below
 * what this stage's payload needs is refused with the fit receipt, instead of proceeding to fail exactly as
 * predicted. Returns the receipt, or `null` when the run fits.
 *
 * WHY THIS IS NOT A SECOND WARNING (measured, live e2e 2026-08-09). The pre-ruling behaviour was: the fit
 * line printed `out ≈ 980 / 768 tok ⚠`, the run went anyway, the first attempt AND the bounded structured
 * retry both came back `finish_reason:"length"`, and the stage 503'd after ~21s of paid decode. The payload-
 * aware floor above removed that outcome for the DEFAULT case; the remaining case is a cap the user set
 * themselves, where the arithmetic is just as certain and the outcome just as useless.
 *
 * THE ARM IS NARROW, DELIBERATELY, and both halves of that matter:
 *  · `presetParams.maxOutputTokens === undefined` ⇒ never refuses. Everyone without an explicit cap rides
 *    the payload-aware floor, which is sized to fit by construction — refusing them would be refusing our
 *    own arithmetic, and the window CLAMP can legitimately hold that floor under the estimate on a card
 *    whose prompt nearly fills the window. That is the INPUT-side overrun the fit line's other half warns
 *    about, and narrowing the selection is its fix, not raising a cap.
 *  · The predicate is the fit line's OWN predicate (`outputEstimate > maxOutputTokens`, `RunControlsCard`)
 *    evaluated against the same `outputEstimateOf`, because an explicit cap wins the ladder outright — so
 *    the run refuses exactly when, and only when, the surface was already showing the ⚠.
 *
 * The SWEEP does not consult this: a library pass has per-card containment, no interactive receipt surface,
 * and (mixed-owner/bulk) frequently no single caller whose preset could be the cap. It rides the payload-
 * aware budget alone.
 */
export function stageBudgetMisfitOf(args: StageBudgetFitArgs): StageBudgetMisfit | null {
  const capTokens = args.presetParams?.maxOutputTokens;
  if (capTokens === undefined) {
    return null;
  }
  const needTokens = outputEstimateOf(args.subject);
  return capTokens < needTokens ? { needTokens, capTokens } : null;
}
