// foundation/observability — front door. The structured logger + request scope, OTel tracing + the libSQL
// wrap, the per-request middleware, the best-effort audit writer, and the /api/_debug read surface. Read
// DOWN by every tier; `getLog()`/`logger` is the only sanctioned output (the `noConsole` total ban).

export {
  type AuditEntry,
  type AuditFailureSnapshot,
  getAuditFailureSnapshot,
  logAudit,
  resetAuditFailureCount,
} from "./audit";
export { type ClientErrorReport, recordClientError } from "./client-error";
export {
  type AdminAuthChecker,
  type AssetInspector,
  type ChatInspection,
  createDebugAuthMiddleware,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  debugAuthMiddleware,
  type IntegrityReport,
  inspectChatState,
  integrityProbe,
  registerDebugRoutes,
  tableCounts,
  tokenMatches,
} from "./debug";
export {
  bindRequestUser,
  getLog,
  getRequestUserId,
  logger,
  logRing,
  type RequestRecord,
  recentRequests,
  recordRequest,
  runInRequest,
  securityEvent,
} from "./logger";
export { observability, observabilityErrorHandler } from "./middleware";
export {
  addSpanEvent,
  getTraceByRequestId,
  initTracing,
  type RequestTrace,
  type RequestTraceTotals,
  recentTraces,
  recordThrownRequest,
  type SerializedSpan,
  type SerializedSpanEvent,
  type SpanAttrs,
  setSpanAttrs,
  span,
  withRequestSpan,
  wrapLibSqlClient,
} from "./tracing";
