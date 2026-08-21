// snap's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/design/tooling-package.md §2.5).
export type { FixtureStatus, FixtureTarget, FixtureTargetOverride } from "./contract/fixture.ts";
export type { ActiveStage, BandAccess, EnsureStageOpts, StageDecision, StagePaths, StagePorts } from "./contract/stage.ts";
export type { Args, SnapAction, SnapFailureSummary } from "./contract/types.ts";
export { capEvalText } from "./lib/eval-text.ts";
export { variantOut } from "./lib/out-names.ts";
// The mode surface — the cli's dispatch targets, exported so a caller can drive snap programmatically
// (and so cli.ts enters through THIS door, per the front-door gate).
export { resolveContextsMode, snapContexts } from "./ops/contexts.ts";
export { splitTrailingEvals } from "./ops/drive.ts";
export { resolveFixtureTarget } from "./ops/fixture.ts";
export { configureStage, refuseFileMode } from "./ops/guards.ts";
export { snapMatrix } from "./ops/matrix.ts";
export { isSandboxTraceNoise, isViteDepChurn, partitionFailedRequests, SANDBOX_TRACE_NOISE_RE } from "./ops/noise.ts";
export { parseSnapArgs, SNAP_HELP } from "./ops/parse.ts";
export { selectConsoleMessagesForReport } from "./ops/report.ts";
export { snap } from "./ops/run.ts";
export { parseScenarioSpec, snapScenario } from "./ops/scenario.ts";
export { hasSnapFailure } from "./ops/verdict.ts";
