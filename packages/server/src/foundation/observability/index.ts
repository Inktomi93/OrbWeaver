// foundation/observability — front door. The structured logger + request scope, OTel tracing + the libSQL
// wrap, the per-request middleware, the best-effort audit writer, and the /api/_debug read surface. Read
// DOWN by every tier; `getLog()`/`logger` is the only sanctioned output (the `noConsole` total ban).

export { type AuditEntry, createAuditWiring, logAudit } from "./audit.ts";
export { readBugReportDiagnostics } from "./bug-report-diagnostics.ts";
export { recordClientError } from "./client-error.ts";
export type { AuditWiring } from "./contract/audit-wiring.ts";
export {
  type AdminAuthChecker,
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
  type WireOutcome,
  type WireToolCall,
  type WireWarning,
} from "./debug/index.ts";
export { getLog, groupsLogFields, logger, logRing, logSerializers, type RequestRecord, runInRequest, securityEvent } from "./logger.ts";
export { type MemoryLogRecord, recordMemoryLog } from "./memory-log.ts";
export { observability, observabilityErrorHandler } from "./middleware.ts";
export { traceStructuredRetry } from "./structured-retry.ts";
export {
  addSpanEvent,
  getTraceByRequestId,
  initTracing,
  type RequestTrace,
  recentTraces,
  type SerializedSpan,
  type SerializedSpanEvent,
  type SpanAttrs,
  setSpanAttrs,
  span,
  superviseDetached,
  superviseSettled,
  withRequestSpan,
  wrapLibSqlClient,
} from "./tracing.ts";
