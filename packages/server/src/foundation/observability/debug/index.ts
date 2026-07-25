// foundation/observability/debug — front door for the /api/_debug surface (the dissolved `debug` domain,
// folded into observability). The route registrar + the two structural-injection ports `entry/` fills.

export {
  type CharacterListRow,
  type ChatInspection,
  type ChatListRow,
  characterListSummaries,
  chatListSummaries,
  type IntegrityReport,
  inspectChatState,
  integrityProbe,
  tableCounts,
} from "./inspect";
export {
  type AdminAuthChecker,
  type AssetInspector,
  createDebugAuthMiddleware,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  debugAuthMiddleware,
  type RpgTraceInspector,
  registerDebugRoutes,
  tokenMatches,
} from "./routes";
export {
  isWireCaptureEnabled,
  recentWireCaptures,
  recordWireCapture,
  resetWireCaptures,
  type WireCapture,
  type WireCaptureFilter,
} from "./wire-capture";
