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
} from "./agent.ts";
export { AGENT_DIALOG_KINDS } from "./agent.ts";
export type {
  BackendKey,
  BackendRegistry,
  FirewallRequest,
  ProviderBackend,
  ProviderDeps,
  ProviderExecutor,
  ProviderRole,
  WireCaptureSink,
} from "./backend.ts";
// ── Infra-internal: the sealed-backend contract + dispatch surface ───────────────────────────────
export { BACKEND_KEYS, PROVIDER_ROLES } from "./backend.ts";
export type {
  AgentMcpServerHealth,
  AgentSdkChatRequest,
  AgentSeedBlock,
  AgentSeedTurn,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ContextUsage,
  CostDetails,
  HistoryRole,
  NormalizedFinishReason,
  OpenAiRawContentPart,
  OpenRouterChatRequest,
  OrSkinTierModels,
  ResponseFormat,
  ToolCallInput,
  ToolChoice,
  VllmChatRequest,
  WireTool,
} from "./chat.ts";
// ── Infra-internal: the chat role (request/result/usage/finish vocab + the D48 wire-role axis) ───
export {
  AGENT_CONTINUATION_PROMPT_STUB,
  AGENT_PROMPT_TAIL_JOINER,
  HISTORY_ROLES,
  NORMALIZED_FINISH_REASONS,
  normalizeFinishReason,
} from "./chat.ts";
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
} from "./diagnostics.ts";
export type { ProviderErrorInit, ProviderErrorKind, ProviderScrubSet } from "./errors.ts";
// ── Infra-internal: errors ───────────────────────────────────────────────────────────────────────
export { PROVIDER_ERROR_KINDS, ProviderError } from "./errors.ts";
// ── Infra-internal: per-turn observability vocab ─────────────────────────────────────────────────
export type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events.ts";
export type {
  DynamicContextChannel,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  WarningCode,
} from "./resolve.ts";
// ── Infra-internal: the resolve-chat funnel's output shapes ──────────────────────────────────────
export { DYNAMIC_CONTEXT_CHANNELS, WARNING_CODES } from "./resolve.ts";
// ── Infra-internal: the non-chat role requests + image-gen result ────────────────────────────────
export type {
  EmbedRequest,
  GeneratedImage,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  RoleClientsWithSignal,
  StructuredRequest,
  SummarizeCallOptions,
  SummarizeRequest,
  SummarizeRequestItem,
  WireEmbedding,
} from "./roles.ts";
