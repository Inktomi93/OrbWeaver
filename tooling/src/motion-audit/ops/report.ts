// Pure legacy motion verdict retained behind Snap's unified motion arm. Human/terminal reporting moved
// to Snap; this module now owns only the evaluation kernel consumed by the matrix verifier.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AuditData } from "../contract/types.ts";
import { animationTotals } from "../lib/animations.ts";
import { motionEvidenceGaps } from "../lib/evidence.ts";
import { clsOverBudget, DROPPED_FRAME_BUDGET_PCT, framePopulationBasis, loafOverBudget } from "../lib/verdicts.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

function framesBudgetJudgeable(data: AuditData): boolean {
  return framePopulationBasis(data.frames.budgeted.total) === "verdict";
}

function budgetsPass(data: AuditData, dirtyAnimations: number): boolean {
  const { motion, frames, pageErrors, stepFailed, reachFailures } = data;
  const framesOverBudget = framesBudgetJudgeable(data) && frames.budgeted.pct !== null && frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT;
  const budgetFails = loafOverBudget(motion) || clsOverBudget(motion, data.measuredInput) || dirtyAnimations > 0 || framesOverBudget;
  return !(budgetFails || stepFailed || reachFailures > 0 || pageErrors.length > 0);
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
  readonly budgetsPass: boolean;
}

/** Pure verdict input shared with the matrix-only STATIC-EXPECTED arm. */
export function evaluateMotionAudit(data: AuditData, windowMs: number): MotionAuditEvaluation {
  const animations = animationTotals(data.animations, data.flags);
  return {
    gaps: [...motionEvidenceGaps(data, windowMs), ...animations.gaps],
    dirtyAnimations: animations.rawDirty,
    transientDirtyAnimations: animations.transientDirty,
    sanctionedLibraryAnimations: animations.sanctionedLibrary,
    budgetedDirtyAnimations: animations.budgetedDirty,
    framesBudgetJudged: framesBudgetJudgeable(data),
    budgetsPass: budgetsPass(data, animations.budgetedDirty),
  };
}
