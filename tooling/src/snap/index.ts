// snap's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
export type { FixtureStatus, FixtureTarget, FixtureTargetOverride } from "./contract/fixture.ts";
export { SNAP_HELP } from "./contract/help.ts";
export type { LighthouseDevice, LighthouseFailedAudit, LighthouseMode, LighthouseOutcome, LighthouseReceipt } from "./contract/lighthouse.ts";
export { LIGHTHOUSE_CATEGORIES } from "./contract/lighthouse.ts";
export type { OverflowEscape, OverflowProbe, OverflowSide } from "./contract/overflow.ts";
export type { RequestBodyOutcome, RequestLogEntry, RequestLogReceipt } from "./contract/request-log.ts";
export type { SnapDetailedResult, SnapRunReceipt } from "./contract/run.ts";
export type {
  ActiveStage,
  BandAccess,
  EnsureStageOpts,
  StageBandClaim,
  StageDecision,
  StagePaths,
  StagePorts,
  StageSweepEvidence,
  StageSweepVerdict,
} from "./contract/stage.ts";
// The `--theme` readiness gate (#1227) — the pure expectation/refusal halves plus the browser wait, so a
// pin can drive the SHIPPED wait against a late-stamping page without a dev stack.
export type { ThemeStampExpectation, ThemeStampReceipt } from "./contract/theme-stamp.ts";
export type { Args, NetworkConditions, NetworkProfileName, SnapAction } from "./contract/types.ts";
export type { DiffOutcome, SnapFailureSummary } from "./contract/verdict.ts";
export { capEvalText } from "./lib/eval-text.ts";
// The Lighthouse + request-log arms' PURE halves — what their unit pins exercise without a browser, and
// what a later stateful snap-session substrate composes with its own page (#1198/#1199).
export {
  auditedCount,
  auditNodes,
  categoryScores,
  failedAudits,
  lighthouseLines,
  parseLighthouseDevice,
  parseLighthouseMode,
  reportTruncation,
} from "./lib/lighthouse-report.ts";
export { variantOut } from "./lib/out-names.ts";
export { overflowAssertionLine } from "./lib/overflow-line.ts";
export { capBody, filterRequests, matchesRequestFilter, REQUEST_BODY_CAP_BYTES, requestLogLines } from "./lib/request-log.ts";
export { SELECTOR_VALUE_FLAGS, selectorRefusalForFlag, unmatchableSelectorRefusal } from "./lib/selector-shape.ts";
export { stageBandClaim, stageBandRefusal, urlTargetsStageBand } from "./lib/stage-plan.ts";
export { NETWORK_PROFILES, NO_CPU_THROTTLE, parseNetworkProfile, throttleResultValue } from "./lib/throttle.ts";
// The mode surface — the cli's dispatch targets, exported so a caller can drive snap programmatically
// (and so cli.ts enters through THIS door, per the front-door gate).
export { resolveContextsMode, snapContexts } from "./ops/contexts.ts";
export { splitTrailingEvals } from "./ops/drive.ts";
export { resolveFixtureTarget } from "./ops/fixture.ts";
export { OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS } from "./ops/flags-classes.ts";
export { configureStage, refuseFileMode } from "./ops/guards.ts";
// `auditSettledPage` is the liftable core: a Playwright page + a debugging port, no snap session.
export { auditSettledPage } from "./ops/lighthouse.ts";
export { materializeDevToolsAssets } from "./ops/materialize-devtools.ts";
export { snapMatrix } from "./ops/matrix.ts";
export { isSandboxTraceNoise, isViteDepChurn, partitionFailedRequests, SANDBOX_TRACE_NOISE_RE } from "./ops/noise.ts";
// The in-page sweep is exported so a browser test can run the SHIPPED body over a mounted frame.
export { OVERFLOW_MAX_ESCAPES, OVERFLOW_TOLERANCE_PX, sweepOverflowEscapes } from "./ops/overflow.ts";
export { parseSnapArgs } from "./ops/parse.ts";
export { selectConsoleMessagesForReport } from "./ops/report.ts";
export { recordRequestsOn } from "./ops/request-log.ts";
export { runSnapDetailed, snap } from "./ops/run.ts";
export { parseScenarioSpec, runScenarioDetailed, snapScenario } from "./ops/scenario.ts";
// The isolated stage is snap-OWNED plumbing with a SECOND consumer (#678): design-audit boots the same
// stage so a rendered fix can be audited BRANCH-SIDE. Cross-tool consumption enters here, through the
// front door — the stage set stays one home in snap/ (docs/architecture/core/Core-Tooling-Law.md §2.4 + §4.2).
export { ensureStage } from "./ops/stage.ts";
export { tryResolveRef } from "./ops/stage-git.ts";
// #1186: the band-ownership door — perf-meter/motion-audit ask it before they trust a `--base`.
export { stageBandRefusalFor } from "./ops/stage-marker.ts";
export { awaitThemeStamp, themeStampExit, themeStampExpectation, themeStampGap } from "./ops/theme-stamp.ts";
export { hasSnapFailure } from "./ops/verdict.ts";
