// foundation/observability — front door. The structured logger + request scope, OTel tracing + the libSQL
// wrap, the per-request middleware, the best-effort audit writer, and the /api/_debug read surface. Read
// DOWN by every tier; a root's logger, read through `getLog(base)`, is the only sanctioned output (the `noConsole` total ban).

export { createAuditWiring } from "./audit.ts";
export type { BugReportDiagnosticsRead } from "./bug-report-diagnostics.ts";
export { createBugReportDiagnosticsRead } from "./bug-report-diagnostics.ts";
export { recordClientError } from "./client-error.ts";
export type { AuditEntry, AuditWiring } from "./contract/audit-wiring.ts";
export type { DebugRoutesOptions, MemoryRecallInspector, RecorderFilter, RpgTraceInspector, SocketInspector } from "./contract/debug.ts";
export type { Logger, ObservabilityRings } from "./contract/logging.ts";
export type { DetachedSupervision, RequestTrace, SerializedSpan, SpanAttrs, TraceRing } from "./contract/tracing.ts";
export type { WireOutcome } from "./contract/wire-capture.ts";
export { registerDebugRoutes } from "./debug/routes.ts";
export {
  createWireCaptureSpill,
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  recordTurnOutcome,
  recordWireCapture,
  type WireCaptureSpill,
} from "./debug/wire-capture.ts";
export {
  createLogger,
  getLog,
  groupsLogFields,
  logSerializers,
  securityEvent,
} from "./logger.ts";
export { recordMemoryLog } from "./memory-log.ts";
export { createRequestObservability } from "./middleware.ts";
export { createObservabilityRings } from "./rings.ts";
export { traceStructuredRetry } from "./structured-retry.ts";
export {
  addSpanEvent,
  createDetachedSupervision,
  initTracing,
  setSpanAttrs,
  span,
  withRequestSpan,
  wrapLibSqlClient,
} from "./tracing.ts";
