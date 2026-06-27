// biome-ignore-all lint/performance/noBarrelFile: the sub-module front door for the shared OpenAI-wire
// seam — openrouter + custom-byo + vllm import these helpers DOWN, so one stable surface is load-bearing.
//
// infra/providers/backends/kit/openai-compat — the shared OpenAI-compatible request/stream helpers BOTH
// the SDK-based (openrouter) and raw-fetch (custom-byo / vllm) backends consume. The ISOLATION seam: no
// backend reaches into another's folder; cross-backend wire work goes through here.

export type { OpenAiSamplingInput } from "./body";
export { applyIncludeExclude, buildOpenAiSamplingFields, redactHeaders } from "./body";
export type { MapTurnContext, StreamDelta, StreamReduceOptions } from "./stream";
export {
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  reduceChatCompletionStream,
} from "./stream";
