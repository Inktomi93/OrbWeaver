// Internal task, execution and error contracts, including the public subset forwarded by the package root.
// Cross-boundary shapes remain owned by @orb/contracts; this barrel does not redefine them.

export type { ResolvedWarning } from "@orb/contracts/inference";

export type { SummarizeResult } from "@orb/contracts/providers";
export type { AgentMcpServerSpec, AgentSdkSessionTotals, AgentToolServer, AgentTurnRequest, SessionEntryWriter } from "./agent.ts";
export type { AgentSdkExecution, AgentSdkExecutionDeps, AgentSdkLifetime, AgentSdkQueryLease } from "./agent-sdk-execution.ts";
export type { ProviderBackend, ProviderExecutor, WireCaptureSink } from "./backend.ts";
export type {
  AgentMcpServerHealth,
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
  ResponseFormat,
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
export type { AccountCreditsRequest, GenerationCostRequest, InspectRequest, ListModelsRequest, ProbeRequest, VerifyAuthRequest } from "./diagnostics.ts";
export type { ProviderErrorKind, ProviderScrubSet, VectorWidthMismatch } from "./errors.ts";
export { ProviderError, SCHEMA_REJECTED_DETAIL } from "./errors.ts";
export type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events.ts";
export { compactionTriggerSchema, compactResultSchema } from "./events.ts";
export type { GoogleBackend, GoogleBackendDeps, GoogleCall } from "./google.ts";
export type { AgentSdkSessionId } from "./identity.ts";
export { agentSdkSessionIdSchema } from "./identity.ts";

export type { LocalLightLoadProgress } from "./local-light-worker.ts";
export type { ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling } from "./resolve.ts";
export type { ConnectionTransport, Resolved, ResponseMap } from "./resolved.ts";
export { generationOf, withPresetWindow } from "./resolved.ts";
export type {
  EmbeddingExecution,
  EmbedRequest,
  GeneratedImage,
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
  ScheduleTimeout,
  SpawnIdentity,
  StoredConnectionRead,
} from "./runtime.ts";
export { ANTH_IMAGE_MEDIA_TYPES, LOCAL_LIGHT_MODEL_SLOTS } from "./runtime.ts";
export type { ChatPosture, SideGenSampling } from "./side-gen.ts";
export { postureOfTask } from "./side-gen.ts";
export type { StructuredRetrySummary } from "./structured-turn.ts";
export { StructuredOutputError } from "./structured-turn.ts";
