// biome-ignore-all lint/performance/noBarrelFile: this IS the `backends/kit/` front door — the shared
// infra-pure wire helpers the sealed chat backends (openrouter / custom-byo / vllm) import DOWN. One
// stable surface keeps the strategy-isolation seam intact (no backend reaches into another's folder).
//
// infra/providers/backends/kit — SHARED INFRA-PURE wire helpers (NOT a backend; below the backends). No
// @orb/db, no domain import, no SDK (the agent-sdk's SDK is its private dep, D8). Pure wire/transport:
// the OpenAI SSE reducer/mapper, the cache_control constants + placement primitive, the reasoning XOR
// builders, the lenient wire parses, the HTTP error table, pre-commit retry, idle-abort, error sanitize.

// ── Anthropic cache_control: constants, the model anchor, the routing pin, the placement primitive ──
export type { CacheControlTextBlock } from "./cache-control";
export {
  ANTHROPIC_CACHE_5M,
  cacheControlBlock,
  effectiveProviderRouting,
  isAnthropicModel,
} from "./cache-control";
// ── HTTP error classification → typed ProviderError ────────────────────────────────────────────────
export type { ErrorClassification, HttpErrorDiagnostic } from "./error-classify";
export {
  classifyHttpStatus,
  classifyTransportName,
  extractHttpErrorDiagnostic,
  providerErrorFromHttp,
} from "./error-classify";
// ── Idle-abort wrapper for streaming HTTP runners ──────────────────────────────────────────────────
export type { IdleAbort } from "./idle-timeout";
export { IDLE_TIMEOUT_MS, turnAbortSignal } from "./idle-timeout";
// ── The shared OpenAI-compatible request/stream seam ───────────────────────────────────────────────
export * from "./openai-compat";
// ── Reasoning wire-block builders (the OR-responses effort/maxTokens XOR) ───────────────────────────
export type {
  ChatCompletionsReasoning,
  ReasoningRequest,
  ResponsesReasoning,
} from "./reasoning-budget";
export {
  effortToOpenAIReasoning,
  effortToResponsesReasoning,
  OPENAI_EFFORT_LEVELS,
} from "./reasoning-budget";
// ── Pre-commit-safe retry (only before any delta streams) ──────────────────────────────────────────
export type { RetryOptions } from "./retry";
export { computeBackoffMs, runWithPreCommitRetry } from "./retry";
// ── Error sanitize/brand (never leak key material) ─────────────────────────────────────────────────
export { sanitizeApiError } from "./sanitize";
// ── Lenient wire-shape parses + the consumed view surfaces + extractors ────────────────────────────
export type {
  ChatCompletionChoice,
  ChatCompletionCostDetails,
  ChatCompletionMessage,
  ChatCompletionResult,
  ChatCompletionStreamChoice,
  ChatCompletionStreamChunk,
  ChatCompletionStreamDelta,
  ChatCompletionTokensDetails,
  ChatCompletionUsage,
  ChatPromptTokensDetails,
  ChatReasoningDetail,
  ResponsesCostDetails,
  ResponsesOutputContent,
  ResponsesOutputItem,
  ResponsesResult,
  ResponsesStreamEvent,
  ResponsesUsage,
} from "./wire-schemas";
export {
  extractChatReasoning,
  extractChatReply,
  parseChatCompletionResult,
  parseResponsesResult,
} from "./wire-schemas";
