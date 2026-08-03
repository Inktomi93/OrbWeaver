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
} from "./inspect/index.ts";
export {
  type AdminAuthChecker,
  type AssetInspector,
  createDebugAuthMiddleware,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  type RpgTraceInspector,
  registerDebugRoutes,
  type SocketInspector,
  tokenMatches,
} from "./routes.ts";
export {
  isWireCaptureEnabled,
  recentWireCaptures,
  recordWireCapture,
  resetWireCaptures,
  type WireCapture,
  type WireCaptureFilter,
} from "./wire-capture.ts";
