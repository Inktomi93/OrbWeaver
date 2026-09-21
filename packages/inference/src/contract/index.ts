// @orb/inference/contract — THE BARREL: the task request/result shapes, the sealed-backend contract, the
// resolved connection, the funnel's output shapes, the events and errors. Cross-boundary shapes (the task
// RESULTS, `ResolvedSecret`, `CredentialHealth`, the capability schemas) are RE-EXPORTS from
// `@orb/contracts` so a consumer needs ONE import for the whole surface.

export type { ResolvedSecret } from "@orb/contracts/credentials";
export type { Capability, ChatApi, EmbeddingCapability, GenerationCapability, ModelCatalogEntry, RerankCapability, Task, Wire } from "@orb/contracts/inference";
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
export type { BackendRegistry, ProviderBackend, ProviderExecutor, WireCaptureSink } from "./backend.ts";
export type {
  AgentMcpServerHealth,
  AgentSdkChatRequest,
  AgentSeedBlock,
  AgentSeedTurn,
  AnthropicChatRequest,
  ChatDeltaSubscription,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ContextUsage,
  HistoryRole,
  OpenAiCompatChatRequest,
  ReasoningContentPart,
  ResponseFormat,
  ToolCallInput,
  ToolChoice,
  WireMeta,
  WireTool,
} from "./chat.ts";
export { AGENT_CONTINUATION_PROMPT_STUB, AGENT_PROMPT_TAIL_JOINER, HISTORY_ROLES, normalizeFinishReason } from "./chat.ts";
export type {
  AccountCreditsRequest,
  GenerationCostRequest,
  InspectRequest,
  ListModelsRequest,
  ListModelsResult,
  ProbeRequest,
  ProviderDiagnostics,
  VerifyAuthRequest,
} from "./diagnostics.ts";
export type { ProviderErrorInit, ProviderErrorKind, ProviderScrubSet } from "./errors.ts";
export { assertNever, PROVIDER_ERROR_KINDS, ProviderError } from "./errors.ts";
export type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events.ts";
export type {
  DynamicContextChannel,
  ResolvedChatKnobs,
  ResolvedEmbedKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  WarningCode,
} from "./resolve.ts";
export { DYNAMIC_CONTEXT_CHANNELS, WARNING_CODES } from "./resolve.ts";
export type { ConnectionTransport, Resolved, ResponseMap } from "./resolved.ts";
export { generationOf } from "./resolved.ts";
export type {
  EmbedRequest,
  GeneratedImage,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  RoleClientsWithSignal,
  SideGenSampling,
  StructuredCallOptions,
  StructuredRequest,
  SummarizeCallOptions,
  SummarizeRequest,
  SummarizeRequestItem,
  WireEmbedding,
} from "./roles.ts";
