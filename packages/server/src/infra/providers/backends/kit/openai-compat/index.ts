//
// infra/providers/backends/kit/openai-compat — the shared OpenAI-compatible request/stream helpers BOTH
// the SDK-based (openrouter) and raw-fetch (custom-byo / vllm) backends consume. The ISOLATION seam: no
// backend reaches into another's folder; cross-backend wire work goes through here.

export type { OpenAiSamplingInput } from "./body.ts";
export {
  applyIncludeExclude,
  buildOpenAiSamplingFields,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  redactHeaders,
  redactSecretsFromText,
  secretHeaderValues,
  secretScrubOverhang,
} from "./body.ts";
export type { MapTurnContext, StreamDelta, StreamReduceOptions } from "./stream.ts";
export {
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  reduceChatCompletionStream,
} from "./stream.ts";
