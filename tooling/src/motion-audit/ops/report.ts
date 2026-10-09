// Pure legacy motion verdict retained behind Snap's unified motion arm. Human/terminal reporting moved
// to Snap; this module now owns only the evaluation kernel consumed by the matrix verifier.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { TimingEvidencePolicy } from "../../_shared/timing-capability.ts";
import type { AuditData } from "../contract/types.ts";
import { animationTotals } from "../lib/animations.ts";
import { motionEvidenceGaps } from "../lib/evidence.ts";
import { clsOverBudget, DROPPED_FRAME_BUDGET_PCT, framePopulationBasis, loafOverBudget } from "../lib/verdicts.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion");

function framesBudgetJudgeable(data: AuditData): boolean {
  return framePopulationBasis(data.frames.budgeted.total) === "verdict";
}

function measurementsOverBudget(data: AuditData): boolean {
  const framesOverBudget = framesBudgetJudgeable(data) && data.frames.budgeted.pct !== null && data.frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT;
  return loafOverBudget(data.motion) || clsOverBudget(data.motion, data.measuredInput) || framesOverBudget;
}

export interface MotionAuditEvaluation {
  readonly gaps: readonly EvidenceGap[];
  /** Raw non-compositor-clean population in the END-OF-WINDOW sample, preserved for compatibility and
   * denominator honesty. */
  readonly dirtyAnimations: number;
  /** Non-compositor-clean TRANSIENT raises — the 130–360ms band the sample above cannot see (#1070). */
  readonly transientDirtyAnimations: number;
  readonly sanctionedLibraryAnimations: number;
  readonly budgetedDirtyAnimations: number;
  /** FALSE ⇒ the dropped-frame arm was skipped because its population cannot support a rate (#1148).
   * Carried on the evaluation so a `budgetsPass: true` is never read as "frames were clean". */
  readonly framesBudgetJudged: boolean;
  readonly measurementsOverBudget: boolean;
  readonly timingPolicy: TimingEvidencePolicy;
  readonly budgetsPass: boolean;
}

/** Pure verdict input shared with the matrix-only STATIC-EXPECTED arm. */
export function evaluateMotionAudit(data: AuditData, windowMs: number, timingPolicy: TimingEvidencePolicy): MotionAuditEvaluation {
  const animations = animationTotals(data.animations, data.flags);
  const overBudget = measurementsOverBudget(data);
  return {
    gaps: [...motionEvidenceGaps(data, windowMs), ...animations.gaps],
    dirtyAnimations: animations.rawDirty,
    transientDirtyAnimations: animations.transientDirty,
    sanctionedLibraryAnimations: animations.sanctionedLibrary,
    budgetedDirtyAnimations: animations.budgetedDirty,
    framesBudgetJudged: timingPolicy === "assert" && framesBudgetJudgeable(data),
    measurementsOverBudget: overBudget,
    timingPolicy,
    budgetsPass: !(
      (timingPolicy === "assert" && overBudget) ||
      animations.budgetedDirty > 0 ||
      data.stepFailed ||
      data.reachFailures > 0 ||
      data.pageErrors.length > 0
    ),
  };
}
