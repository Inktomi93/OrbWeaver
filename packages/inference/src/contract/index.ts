// Internal task, execution and error contracts, including the public subset forwarded by the package root.
// Cross-boundary shapes remain owned by @orb/contracts; this barrel does not redefine them.

export type { ChatDeltaEvent } from "@orb/contracts/chat";
export type { ResolvedWarning } from "@orb/contracts/inference";
export type { SummarizeResult } from "@orb/contracts/providers";
export type { ResponseFormat } from "@orb/contracts/role-clients";
export type { AgentSdkSessionTotals, AgentToolServer, SessionEntryWriter } from "./agent.ts";
export type { AgentSdkExecution, AgentSdkExecutionDeps, AgentSdkLifetime, AgentSdkQueryLease } from "./agent-sdk-execution.ts";
export type { ProviderBackend, ProviderExecutor, WireCaptureSink } from "./backend.ts";
export type {
  AgentSdkChatRequest,
  AgentSeedBlock,
  AgentSeedTurn,
  AnthropicChatRequest,
  ChatHistoryMessage,
  ChatRequest,
  ChatResult,
  ChatToolDefinition,
  ChatToolExecution,
  ChatToolOffer,
  ChatTurnInput,
  ChatTurnTools,
  ContextUsage,
  ForcedToolRoundInput,
  GenerationObservationCallback,
  GoogleChatRequest,
  HistoryRole,
  OpenAiCompatChatRequest,
  ReasoningContentPart,
  ToolCallInput,
  ToolChoice,
  WireMeta,
  WireTool,
} from "./chat.ts";
export {
  AGENT_CONTINUATION_PROMPT_STUB,
  AGENT_PROMPT_TAIL_JOINER,
  deltaSubscriptionOf,
  GenerationObservationPersistenceError,
  normalizeFinishReason,
} from "./chat.ts";
export type { DiagnosticRequestCommon, GenerationCostRequest, ListModelsRequest, ModelsDial } from "./diagnostics.ts";
export type { ProviderErrorKind, ProviderScrubSet, VectorWidthMismatch } from "./errors.ts";
export { ProviderError, SCHEMA_REJECTED_DETAIL } from "./errors.ts";
export type { ChatEvent, RateLimitSnapshot } from "./events.ts";
export { compactionTriggerSchema, compactResultSchema, rateLimitStatusSchema, sdkActivityStatusSchema } from "./events.ts";
export type { GeneratedImage } from "./generation.ts";
export type { GoogleBackend, GoogleBackendDeps, GoogleCall } from "./google.ts";
export type { AgentSdkSessionId } from "./identity.ts";
export { agentSdkSessionIdSchema } from "./identity.ts";
export type { ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling } from "./resolve.ts";
export type { ConnectionTransport, Resolved, ResponseMap } from "./resolved.ts";
export { generationOf, withPresetWindow } from "./resolved.ts";
export type {
  EmbeddingExecution,
  EmbedRequest,
  ImageEmbedRequest,
  ImageGenerateRequest,
  ImageGenerateResult,
  RerankRequest,
  RoleClientsWithSignal,
  StructuredRequest,
  SummarizeRequest,
  WireEmbedding,
} from "./roles.ts";
export { embedRequestTimeoutMs } from "./roles.ts";
export type {
  AddSpanEvent,
  AnthImageBlock,
  AnthImageMediaType,
  EndpointModel,
  LocalLightModelSlot,
  ModelFamily,
  Reachability,
  SpawnIdentity,
  StoredConnectionRead,
} from "./runtime.ts";
export { ANTH_IMAGE_MEDIA_TYPES, LOCAL_LIGHT_MODEL_SLOTS } from "./runtime.ts";
export type { ChatPosture } from "./side-gen.ts";
export { postureOfTask } from "./side-gen.ts";
export type { StructuredRetrySummary } from "./structured-turn.ts";
export { StructuredOutputError } from "./structured-turn.ts";
