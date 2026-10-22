// foundation/observability/debug — front door for the /api/_debug surface (the dissolved `debug` domain,
// folded into observability). The route registrar + the two structural-injection ports `entry/` fills.

export {
  type AdminAuthChecker,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  type MemoryRecallInspector,
  type RpgTraceInspector,
  registerDebugRoutes,
} from "./routes.ts";
export {
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  recordTurnOutcome,
  recordWireCapture,
  type WireCaptureFilter,
  type WireOutcome,
  type WireToolCall,
  type WireWarning,
} from "./wire-capture.ts";
