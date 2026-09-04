// snap's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
export type { FixtureStatus, FixtureTarget, FixtureTargetOverride } from "./contract/fixture.ts";
export type {
  HeapBrowserContextId,
  HeapCaptureRequest,
  HeapCaptureSessionId,
  HeapClassDelta,
  HeapComparisonReceipt,
  HeapPageEvidence,
  HeapRetainerReceipt,
  HeapRetainerRequest,
  HeapRetainerSelector,
  HeapSnapshotReceipt,
  HeapTargetId,
} from "./contract/heap.ts";
export { heapBrowserContextIdSchema, heapCaptureSessionIdSchema, heapTargetIdSchema } from "./contract/heap.ts";
export { SNAP_HELP } from "./contract/help.ts";
export type { LighthouseDevice, LighthouseFailedAudit, LighthouseMode, LighthouseOutcome, LighthouseReceipt } from "./contract/lighthouse.ts";
export { LIGHTHOUSE_CATEGORIES } from "./contract/lighthouse.ts";
export type { NetworkConditions, NetworkProfileName } from "./contract/load-emulation.ts";
export type { OverflowEscape, OverflowProbe, OverflowSide } from "./contract/overflow.ts";
export type {
  RequestBodyOutcome,
  RequestBodyRetentionReason,
  RequestLogEntry,
  RequestLogReceipt,
  RequestRingReceipt,
  RequestSizesEvidence,
  RequestWindowReceipt,
} from "./contract/request-log.ts";
export type { SnapDetailedResult, SnapRunReceipt } from "./contract/run.ts";
export type { SnapReportQuery, SnapRunArtifact, SnapRunIndex } from "./contract/run-index.ts";
export type { SessionAttachLease, SessionAttachRefusal, SessionAttachResolution, SessionAttachTarget } from "./contract/session.ts";
export type {
  BandAccess,
  EnsureStageOpts,
  StageAllocation,
  StageBandClaim,
  StageBandView,
  StageDecision,
  StageHealth,
  StageHealthEvidence,
  StageLimits,
  StagePaths,
  StagePorts,
  StageRow,
  StageSweepEvidence,
  StageSweepVerdict,
} from "./contract/stage.ts";
// The `--theme` readiness gate (#1227) — the pure expectation/refusal halves plus the browser wait, so a
// pin can drive the SHIPPED wait against a late-stamping page without a dev stack.
export type { ThemeStampExpectation, ThemeStampReceipt } from "./contract/theme-stamp.ts";
export type { Args, SnapAction } from "./contract/types.ts";
export type { DiffOutcome, SnapFailureSummary } from "./contract/verdict.ts";
export { modalModeErrors } from "./lib/cli-mode.ts";
export { capEvalText } from "./lib/eval-text.ts";
export {
  assertComparableHeapSnapshots,
  buildHeapComparisonReceipt,
  buildHeapRetainerReceipt,
  buildHeapSnapshotReceipt,
  loadHeapSnapshotReceipt,
  parseHeapCapture,
  parseHeapComparison,
  parseHeapRetainer,
} from "./lib/heap-analysis.ts";
export { HeapDevToolsParser, withHeapDevToolsParser } from "./lib/heap-devtools.ts";
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
export {
  filterRequests,
  matchesRequestFilter,
  REQUEST_BODY_BUDGET_BYTES,
  REQUEST_BODY_CAP_BYTES,
  REQUEST_RING_CAPACITY,
  requestLogLines,
} from "./lib/request-log.ts";
export { retiredInstrumentCensus } from "./lib/retired-instruments.ts";
export { parseSnapReportArgs } from "./lib/run-report-query.ts";
export { SELECTOR_VALUE_FLAGS, selectorRefusalForFlag, unmatchableSelectorRefusal } from "./lib/selector-shape.ts";
export { allocateStageBand, resolveStageLimits, stageHealthVerdict, stageSweepVerdict } from "./lib/stage-bands.ts";
// `shortSha`/`stageRowBaseUrl` are the row's DERIVED fields (#1276 stopped storing them — a serialized copy
// of a derived value is a second home that drifts), so every consumer derives them through this door.
export { shortSha, stageBandClaim, stageBandRefusal, stageRowBaseUrl, urlTargetsStageBand } from "./lib/stage-plan.ts";
export { NETWORK_PROFILES, NO_CPU_THROTTLE, parseNetworkProfile, throttleResultValue } from "./lib/throttle.ts";
// The mode surface — the cli's dispatch targets, exported so a caller can drive snap programmatically
// (and so cli.ts enters through THIS door, per the front-door gate).
// `auditSettledPage` is the liftable core: a Playwright page + a debugging port, no snap session; the
// request ring is its twin (one Playwright page, bounded lifetime state). The ring lives in ops/ because
// it is installed before any run arm exists (docs/design/1208-instrument-substrate.md §6.2).
export { auditSettledPage } from "./ops/arms/lighthouse.ts";
export { resolveContextsMode, snapContexts } from "./ops/contexts.ts";
export { splitTrailingEvals } from "./ops/drive.ts";
export { resolveFixtureTarget } from "./ops/fixture.ts";
export { snapFlagDescriptors } from "./ops/flag-grammar.ts";
export { OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS } from "./ops/flags-classes.ts";
export { configureStage, refuseFileMode } from "./ops/guards.ts";
export { materializeDevToolsAssets } from "./ops/materialize-devtools.ts";
export { snapMatrix } from "./ops/matrix.ts";
export { isSandboxTraceNoise, isViteDepChurn, partitionFailedRequests, SANDBOX_TRACE_NOISE_RE } from "./ops/noise.ts";
// The in-page sweep is exported so a browser test can run the SHIPPED body over a mounted frame.
export { OVERFLOW_MAX_ESCAPES, OVERFLOW_TOLERANCE_PX, sweepOverflowEscapes } from "./ops/overflow.ts";
export { parseSnapArgs } from "./ops/parse.ts";
export { selectConsoleMessagesForReport } from "./ops/report.ts";
export { RequestRing } from "./ops/request-ring.ts";
export { runOnSession, runSnapDetailed, snap } from "./ops/run.ts";
export { completeSnapRun } from "./ops/run-bundle.ts";
export { listSnapRunIndices, printSnapReport, printSnapReports, readSnapRunIndex, resolveSnapRunIndex } from "./ops/run-report.ts";
export { parseScenarioSpec, runScenarioDetailed, snapScenario } from "./ops/scenario.ts";
export { prepareScenario } from "./ops/scenario-prepare.ts";
// The stateful-session substrate (docs/design/1208-instrument-substrate.md §10.1): the admin verbs, the
// client (boot + call + export), and the daemon's own entry — all three dispatched by cli.ts.
export { runSessionAdmin } from "./ops/session-admin.ts";
// The sibling-attach door (#1285, §3.4 F3): design-audit/motion-audit/perf-meter/record resolve a
// `--session <name>` through this ONE function rather than reading the registry themselves.
export { attachResolvedSession, resolveSessionAttach } from "./ops/session-attach.ts";
export { runSessionCall } from "./ops/session-client.ts";
export { runSessionDaemon } from "./ops/session-daemon.ts";
// The isolated stage is snap-OWNED plumbing with a SECOND consumer (#678): design-audit boots the same
// stage so a rendered fix can be audited BRANCH-SIDE. Cross-tool consumption enters here, through the
// front door — the stage set stays one home in snap/ (docs/architecture/core/Core-Tooling-Law.md §2.4 + §4.2).
export { ensureStage } from "./ops/stage.ts";
export { tryResolveRef } from "./ops/stage-git.ts";
// #1186: the band-ownership door — perf-meter/motion-audit ask it before they trust a `--base`. The table
// readers ride beside it: a proof plants rows in a scratch home rather than the box's real band table.
export { readBands, stageBandRefusalFor, withBandsLock, writeBands } from "./ops/stage-marker.ts";
export { awaitThemeStamp, themeStampExit, themeStampExpectation, themeStampGap } from "./ops/theme-stamp.ts";
export { hasSnapFailure } from "./ops/verdict.ts";
