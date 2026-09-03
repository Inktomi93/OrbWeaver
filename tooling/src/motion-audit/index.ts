// motion-audit's programmatic front door — what tests and sibling tools import; the cli fronts this
// surface. One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).

export type { BrowserEnvironmentEvidence } from "../_shared/browser-environment.ts";
export { MOTION_AUDIT_HELP } from "./contract/help.ts";
export type {
  AnimationRecord,
  ApplicationMotionEvidence,
  Args,
  AuditData,
  ClsBudgetBasis,
  LoafRecord,
  MotionFlagRecord,
  MotionSnapshot,
  ReachAction,
  ShiftRecord,
  TraceEvent,
} from "./contract/types.ts";
export { animationTotals } from "./lib/animations.ts";
export { apparatusGap, appReadyTimeoutGap, flagRingGap, motionEvidenceGaps, observedClsGap, orbBridgeGap } from "./lib/evidence.ts";
export { calibratedDroppedFramePct, droppedFramePct } from "./lib/frames.ts";
export {
  clsBudgetBasis,
  clsBudgeted,
  clsOverBudget,
  clsTotals,
  DROPPED_FRAME_BUDGET_PCT,
  FRAME_POPULATION_RESOLUTION_FLOOR,
  framePopulationBasis,
  loafOverBudget,
  loafTotals,
  observedClsTotals,
} from "./lib/verdicts.ts";
export { runMotionAuditMatrix } from "./ops/matrix.ts";
export { parseMotionArgs } from "./ops/parse.ts";
export { evaluateMotionAudit } from "./ops/report.ts";
export { runMotionAudit, runMotionAuditDetailed } from "./ops/run.ts";
