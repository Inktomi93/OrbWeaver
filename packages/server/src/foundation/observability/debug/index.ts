// foundation/observability/debug — front door for the /api/_debug surface (the dissolved `debug` domain,
// folded into observability). The route registrar + the two structural-injection ports `entry/` fills.

export {
  type MemoryRecallInspector,
  type RpgTraceInspector,
  registerDebugRoutes,
} from "./routes.ts";
export {
  createWireCaptureSpill,
  isWireCaptureEnabled,
  isWireReplyCaptureEnabled,
  recordTurnOutcome,
  recordWireCapture,
  type WireCaptureSpill,
  type WireOutcome,
} from "./wire-capture.ts";
