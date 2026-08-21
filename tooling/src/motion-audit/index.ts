// motion-audit's programmatic front door — what tests and sibling tools import; the cli fronts this
// surface. One tool, one API (docs/design/tooling-package.md §2.5).
export type { AnimationRecord, Args, AuditData, LoafRecord, MotionSnapshot, ReachAction, TraceEvent } from "./contract/types.ts";
export { calibratedDroppedFramePct, droppedFramePct } from "./lib/frames.ts";
export { clsOverBudget, clsTotals, loafOverBudget, loafTotals } from "./lib/verdicts.ts";
export { MOTION_AUDIT_HELP, parseMotionArgs } from "./ops/parse.ts";
export { runMotionAudit } from "./ops/run.ts";
