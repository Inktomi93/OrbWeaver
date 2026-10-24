// foundation/observability — front door. The structured logger + request scope, OTel tracing + the libSQL
// wrap, the per-request middleware, the best-effort audit writer, and the /api/_debug read surface. Read
// DOWN by every tier; a root's logger, read through `getLog(base)`, is the only sanctioned output (the `noConsole` total ban).

export { type AuditEntry, createAuditWiring, logAudit } from "./audit.ts";
export type { BugReportDiagnosticsRead } from "./bug-report-diagnostics.ts";
export { createBugReportDiagnosticsRead } from "./bug-report-diagnostics.ts";
export { recordClientError } from "./client-error.ts";
export type { AuditWiring } from "./contract/audit-wiring.ts";
export {
  type AdminAuthChecker,
  createWireCaptureSpill,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  type MemoryRecallInspector,
  type RpgTraceInspector,
  recordTurnOutcome,
  recordWireCapture,
  registerDebugRoutes,
  type WireCaptureFilter,
  type WireCaptureSpill,
  type WireOutcome,
  type WireToolCall,
  type WireWarning,
} from "./debug/index.ts";
export {
  createLogger,
  getLog,
  groupsLogFields,
  type Logger,
  logRing,
  logSerializers,
  type RequestRecord,
  securityEvent,
} from "./logger.ts";
export { type MemoryLogRecord, recordMemoryLog } from "./memory-log.ts";
export { createRequestObservability } from "./middleware.ts";
export { traceStructuredRetry } from "./structured-retry.ts";
export {
  addSpanEvent,
  createDetachedSupervision,
  type DetachedSupervision,
  getTraceByRequestId,
  initTracing,
  type RequestTrace,
  recentTraces,
  type SerializedSpan,
  type SerializedSpanEvent,
  type SpanAttrs,
  setSpanAttrs,
  span,
  withRequestSpan,
  wrapLibSqlClient,
} from "./tracing.ts";
