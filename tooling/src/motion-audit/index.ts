// Retained motion evidence/verdict engine. Snap is the only rendered-instrument front door; this barrel
// exposes pure facts used by tests and non-browser consumers, never a second parser, stage, or run path.

export type { BrowserEnvironmentEvidence } from "../_shared/browser-environment.ts";
export type {
  AnimationRecord,
  ApplicationMotionEvidence,
  AuditData,
  ClsBudgetBasis,
  LoafRecord,
  MotionFlagRecord,
  MotionSnapshot,
  ShiftRecord,
  TraceEvent,
} from "./contract/types.ts";
export { animationTotals } from "./lib/animations.ts";
export { apparatusGap, appReadyTimeoutGap, flagRingGap, motionEvidenceGaps, observedClsGap, orbBridgeGap } from "./lib/evidence.ts";
export { calibratedDroppedFramePct, droppedFramePct } from "./lib/frames.ts";
export {
  BLOCKING_BUDGET_MS,
  CLS_BUDGET,
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
export { hasOrbBridge, prepareMeasuredClick } from "./ops/drive.ts";
export type { MotionAppearanceMatrix, MotionMatrixVariant, MotionStaticExpectedLink } from "./ops/matrix-contract.ts";
export { motionMatrixVariant, planMotionAppearanceMatrix } from "./ops/matrix-contract.ts";
export type { MotionMatrixCellEvidence, MotionStaticExpectedVerdict } from "./ops/matrix-verdict.ts";
export { evaluateMotionStaticExpected } from "./ops/matrix-verdict.ts";
export { evaluateMotionAudit } from "./ops/report.ts";
export { runAudit } from "./ops/trace.ts";
