// snap's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/design/tooling-package.md §2.5).
export type { FixtureStatus, FixtureTarget, FixtureTargetOverride } from "./contract/fixture.ts";
export type {
  ActiveStage,
  BandAccess,
  EnsureStageOpts,
  StageDecision,
  StagePaths,
  StagePorts,
  StageSweepEvidence,
  StageSweepVerdict,
} from "./contract/stage.ts";
export type { Args, OverflowEscape, OverflowProbe, OverflowSide, SnapAction, SnapFailureSummary } from "./contract/types.ts";
export { capEvalText } from "./lib/eval-text.ts";
export { variantOut } from "./lib/out-names.ts";
export { overflowAssertionLine } from "./lib/overflow-line.ts";
// The mode surface — the cli's dispatch targets, exported so a caller can drive snap programmatically
// (and so cli.ts enters through THIS door, per the front-door gate).
export { resolveContextsMode, snapContexts } from "./ops/contexts.ts";
export { splitTrailingEvals } from "./ops/drive.ts";
export { resolveFixtureTarget } from "./ops/fixture.ts";
export { configureStage, refuseFileMode } from "./ops/guards.ts";
export { snapMatrix } from "./ops/matrix.ts";
export { isSandboxTraceNoise, isViteDepChurn, partitionFailedRequests, SANDBOX_TRACE_NOISE_RE } from "./ops/noise.ts";
// The in-page sweep is exported so a browser test can run the SHIPPED body over a mounted frame.
export { OVERFLOW_MAX_ESCAPES, OVERFLOW_TOLERANCE_PX, sweepOverflowEscapes } from "./ops/overflow.ts";
export { parseSnapArgs, SNAP_HELP } from "./ops/parse.ts";
export { selectConsoleMessagesForReport } from "./ops/report.ts";
export { snap } from "./ops/run.ts";
export { parseScenarioSpec, snapScenario } from "./ops/scenario.ts";
export { hasSnapFailure } from "./ops/verdict.ts";
