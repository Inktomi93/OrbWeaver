// foundation/observability/debug — front door for the /api/_debug surface (the dissolved `debug` domain,
// folded into observability). The route registrar + the two structural-injection ports `entry/` fills.

export type {
  AppSettingRow,
  AutomationFireFilter,
  AutomationFireRow,
  CharacterDetailRow,
  CharacterListRow,
  ChatConfigRow,
  ChatListRow,
  ChatParticipantRow,
  IntegrityReport,
  PersonaRow,
  PresetRow,
  RenderPolicyVerdict,
  RpgGameRow,
  UserSettingsRow,
} from "./inspect/index.ts";
export {
  type AdminAuthChecker,
  type AssetInspector,
  type DebugAuthOptions,
  type DebugRoutesOptions,
  type MemoryRecallInspector,
  type RpgTraceInspector,
  registerDebugRoutes,
  type SocketInspector,
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
