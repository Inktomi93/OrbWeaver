// biome-ignore-all lint/performance/noBarrelFile: this IS the contract front door by design — the
// `providers-public-surface-only` cruiser rule forbids outside callers from reaching `contract/<file>`,
// so the barrel is load-bearing for the executor's typed surface.
//
// infra/providers/contract — THE BARREL. The one front door for the role request/result shapes + the
// sealed-backend contract. Infra-internal request shapes (ChatRequest variants, AgentTurnRequest, the
// non-chat role requests, ChatEvent/ChatError/wire vocab) live behind this barrel; cross-boundary shapes
// (the role RESULTS, ResolvedCredential, CredentialHealth, ModelCapability) are RE-EXPORTS from
// `@orb/contracts` so a consumer needs ONE import for the whole provider surface (providers.md).

export type {
  ChatApi,
  ModelCapability,
  ModelCatalogEntry,
} from "@orb/contracts/connection";
export type {
  CredentialHealth,
  CredentialSource,
  ResolvedCredential,
} from "@orb/contracts/credentials";
// ── Cross-boundary RE-EXPORTS (canonical home is @orb/contracts; surfaced for one-import ergonomics) ─
export type {
  AccountCredits,
  EmbedResult,
  EndpointInspection,
  GenerationCost,
  ImageEmbedResult,
  RerankHit,
  RerankResult,
  SummarizeResult,
  SummarizeResultItem,
} from "@orb/contracts/providers";
// ── Infra-internal: the agent role ───────────────────────────────────────────────────────────────
export type {
  AgentDialogKind,
  AgentMcpHttpServer,
  AgentMcpServerSpec,
  AgentMcpSseServer,
  AgentMcpStdioServer,
  AgentToolServer,
  AgentTurnRequest,
} from "./agent";
export { AGENT_DIALOG_KINDS } from "./agent";
export type {
  BackendKey,
  BackendRegistry,
  FirewallRequest,
  ProviderBackend,
  ProviderDeps,
  ProviderExecutor,
  ProviderRole,
  WireCaptureSink,
} from "./backend";
// ── Infra-internal: the sealed-backend contract + dispatch surface ───────────────────────────────
export { BACKEND_KEYS, PROVIDER_ROLES } from "./backend";
export type {
  AgentMcpServerHealth,
  AgentSdkChatRequest,
  AgentSeedTurn,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ContextUsage,
  CostDetails,
  HistoryRole,
  NormalizedFinishReason,
  OpenRouterChatRequest,
  OrSkinTierModels,
  ResponseFormat,
  ToolCallInput,
  ToolChoice,
  WireTool,
} from "./chat";
// ── Infra-internal: the chat role (request/result/usage/finish vocab + the D48 wire-role axis) ───
export {
  AGENT_PROMPT_TAIL_JOINER,
  HISTORY_ROLES,
  NORMALIZED_FINISH_REASONS,
  normalizeFinishReason,
} from "./chat";
// ── Infra-internal: the diagnostic request shapes + the bound diagnostic surface ─────────────────
export type {
  AccountCreditsRequest,
  FetchAgentSdkModelsRequest,
  FetchCatalogRequest,
  GenerationCostRequest,
  InspectRequest,
  ProbeRequest,
  ProviderDiagnostics,
  VerifyAuthRequest,
} from "./diagnostics";
export type { ProviderErrorInit, ProviderErrorKind } from "./errors";
// ── Infra-internal: errors ───────────────────────────────────────────────────────────────────────
export { PROVIDER_ERROR_KINDS, ProviderError } from "./errors";
// ── Infra-internal: per-turn observability vocab ─────────────────────────────────────────────────
export type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events";
export type {
  DynamicContextChannel,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  WarningCode,
} from "./resolve";
// ── Infra-internal: the resolve-chat funnel's output shapes ──────────────────────────────────────
export { DYNAMIC_CONTEXT_CHANNELS, WARNING_CODES } from "./resolve";
// ── Infra-internal: the non-chat role requests + image-gen result ────────────────────────────────
export type {
  EmbedRequest,
  GeneratedImage,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  SummarizeRequest,
  SummarizeRequestItem,
} from "./roles";
