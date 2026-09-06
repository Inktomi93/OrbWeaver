//
// infra/providers/backends/kit — SHARED INFRA-PURE wire helpers (NOT a backend; below the backends). No
// @orb/db, no domain import, no SDK (the agent-sdk's SDK is its private dep, D8). Pure wire/transport:
// the OpenAI SSE reducer/mapper, the cache_control constants + placement primitive, the reasoning XOR
// builders, the lenient wire parses, the embeddings-payload decoder, the HTTP error table, pre-commit
// retry, idle-abort, error sanitize.

// ── Caller-signal flattening (the abort REASON never reaches the transport classifier) ─────────────
export type { FlattenedAbort } from "./abort-flatten.ts";
export { flattenAbortSignal, foldAbortInto } from "./abort-flatten.ts";
// ── Outbound image → Anthropic Messages content block (MA-10; agent-sdk summarize) ────────
export { toAnthImageBlock } from "./anth-image-block.ts";
// ── Anthropic cache_control: constants, the model anchor, the routing pin, the placement primitive ──
export type { AnthropicCacheDirective, CacheBreakpointPlacement, CacheBreakpointRow, CacheControlTextBlock } from "./cache-control.ts";
export {
  ANTHROPIC_CACHE_1H,
  anthropicCacheDirective,
  CACHE_TTLS,
  cacheControlBlock,
  computeCacheBreakpointPlacements,
  effectiveProviderRouting,
  isAnthropicModel,
} from "./cache-control.ts";
// ── OpenAI-dialect embeddings payload → Float32Array, alignment- and width-checked ─────────────────
// (the payload SHAPE is `WireEmbedding`, homed in the providers `contract/` with the rest of the wire vocab)
export { decodeEmbeddingVector, decodeEmbeddingVectors } from "./embedding-decode.ts";
// ── HTTP error classification → typed ProviderError ────────────────────────────────────────────────
export type { ErrorClassification, HttpErrorDiagnostic } from "./error-classify.ts";
export {
  classifyHttpStatus,
  classifyTransportName,
  extractHttpErrorDiagnostic,
  providerErrorFromHttp,
} from "./error-classify.ts";
// ── History content-part → text (D45 multimodal send; image parts wire-mapped per-backend later) ────
export { chatHistoryOpenAiContent, chatHistoryText } from "./history.ts";
// ── Idle-abort wrapper for streaming HTTP runners ──────────────────────────────────────────────────
export type { IdleAbort } from "./idle-timeout.ts";
export { IDLE_TIMEOUT_MS, turnAbortSignal } from "./idle-timeout.ts";
// ── Outbound image-input wire-normalize (MA-6: GIF → first-frame PNG, metadata-stripped, injected sharp) ─
export type { ImageToPng, NormalizedImageBytes, NormalizeImageBytes } from "./image-normalize.ts";
export { createImageNormalizer, passthroughImageNormalizer } from "./image-normalize.ts";
// ── The shared OpenAI-compatible request/stream seam ───────────────────────────────────────────────
export type { MapTurnContext, OpenAiSamplingInput, StreamDelta, StreamReduceOptions } from "./openai-compat/index.ts";
export {
  applyIncludeExclude,
  buildOpenAiSamplingFields,
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  redactHeaders,
  redactSecretsFromText,
  reduceChatCompletionStream,
  secretHeaderValues,
  secretScrubOverhang,
} from "./openai-compat/index.ts";
// ── The shared `provider.*` structured-log sink (hoisted from agent-sdk; per-call `backend` tag) ─────
export type {
  ProviderCacheLog,
  ProviderCapabilityDrop,
  ProviderCapabilityLog,
  ProviderSamplingDrop,
  ProviderSamplingLog,
  ProviderSummarizeItemLog,
  ProviderTurnUsage,
} from "./provider-log.ts";
export {
  logProviderCache,
  logProviderCapability,
  logProviderSampling,
  logProviderSummarizeItem,
  PROVIDER_LOG_LEVELS,
  providerLog,
} from "./provider-log.ts";
// ── Reasoning wire-block builders (the OR-responses effort/maxTokens XOR) ───────────────────────────
export type {
  ChatCompletionsReasoning,
  ReasoningRequest,
  ResponsesReasoning,
} from "./reasoning-budget.ts";
export {
  effortToOpenAIReasoning,
  effortToResponsesReasoning,
  OPENAI_EFFORT_LEVELS,
} from "./reasoning-budget.ts";
// ── Pre-commit-safe retry (only before any delta streams) ──────────────────────────────────────────
export type { RetryOptions } from "./retry.ts";
export { computeBackoffMs, runWithPreCommitRetry } from "./retry.ts";
// ── Error sanitize/brand (never leak key material) ─────────────────────────────────────────────────
// (the scrub-set SHAPE is `ProviderScrubSet`, homed in the providers `contract/` with the rest of the
// error vocab; these are its two producers)
export { customOpenAiSecretLiterals, NO_PROVIDER_SECRETS, providerCredentialSecretValues, sanitizeApiError } from "./sanitize.ts";
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
  ChatMessageToolCall,
  ChatPromptTokensDetails,
  ChatReasoningDetail,
  ChatToolCallDelta,
} from "./wire-schemas.ts";
export { extractChatReasoning, extractChatRefusal, extractChatReply, parseChatCompletionResult } from "./wire-schemas.ts";
