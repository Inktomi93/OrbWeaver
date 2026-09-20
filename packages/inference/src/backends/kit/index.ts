// backends/kit — SHARED wire helpers below every backend (NOT a backend). No `@orb/db`, no server import, no
// SDK: the caller-signal flattener, the Anthropic cache placement primitive, the history projections, the
// embeddings-payload decoder, the HTTP error table, pre-commit retry, idle-abort, the secret scrub, the
// SSE line parser `wrapFetch` reshapes through, and the `provider.*` log sink factory. The raw OpenAI SSE
// REDUCER and the lenient completion parsers left with the raw-fetch runners: the Vercel SDK parses the
// stream after `wrapFetch` reshapes it (§8.1).

export type { FlattenedAbort } from "./abort-flatten.ts";
export { flattenAbortSignal, foldAbortInto } from "./abort-flatten.ts";
export type { AnthImageBlock, AnthImageMediaType } from "./anth-image-block.ts";
export { ANTH_IMAGE_MEDIA_TYPES, toAnthImageBlock } from "./anth-image-block.ts";
export { effortWordOf } from "./applied-effort.ts";
export type { AnthropicCacheDirective, CacheBreakpointPlacement, CacheBreakpointRow, OpenRouterRouting } from "./cache-control.ts";
export {
  ANTHROPIC_CACHE_1H,
  anthropicCacheDirective,
  CACHE_TTLS,
  computeCacheBreakpointPlacements,
  effectiveProviderRouting,
  isAnthropicModel,
} from "./cache-control.ts";
export { decodeEmbeddingVector } from "./embedding-decode.ts";
export type { ErrorClassification, HttpErrorDiagnostic } from "./error-classify.ts";
export { classifyHttpStatus, classifyTransportName, extractHttpErrorDiagnostic, providerErrorFromHttp } from "./error-classify.ts";
export { chatHistoryText } from "./history.ts";
export type { IdleAbort } from "./idle-timeout.ts";
export { IDLE_TIMEOUT_MS, turnAbortSignal } from "./idle-timeout.ts";
export type { ImageToPng, NormalizedImageBytes, NormalizeImageBytes } from "./image-normalize.ts";
export { createImageNormalizer, passthroughImageNormalizer } from "./image-normalize.ts";
export { applyIncludeExclude, redactHeaders, redactSecretsFromText, secretHeaderValues, secretScrubOverhang } from "./openai-body.ts";
export type {
  ProviderCacheLog,
  ProviderCapabilityDrop,
  ProviderCapabilityLog,
  ProviderLogger,
  ProviderLogLevel,
  ProviderSamplingDrop,
  ProviderSamplingLog,
  ProviderSummarizeItemLog,
  ProviderTurnUsage,
} from "./provider-log.ts";
export { PROVIDER_LOG_LEVELS, providerLogger } from "./provider-log.ts";
export { parseGoDuration, RATE_LIMIT_WARN_UTILIZATION, rateLimitCanaryEvent, rateLimitFromHeaders } from "./rate-limit-headers.ts";
export type { ChatCompletionsReasoning, ReasoningRequest, ResponsesReasoning } from "./reasoning-budget.ts";
export { effortToOpenAIReasoning, effortToResponsesReasoning, OPENAI_EFFORT_LEVELS } from "./reasoning-budget.ts";
export type { AddSpanEvent, RetryOptions } from "./retry.ts";
export { computeBackoffMs, runWithPreCommitRetry } from "./retry.ts";
export type { ScrubSource } from "./sanitize.ts";
export { NO_PROVIDER_SECRETS, resolvedScrubSet, sanitizeApiError } from "./sanitize.ts";
export type { SseLine } from "./sse.ts";
export { encodeSseData, parseOpenAiSse, parseSseLine, SSE_DONE_LINE } from "./sse.ts";
