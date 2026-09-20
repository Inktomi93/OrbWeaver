// The funnel's resolved knobs → the V4 `LanguageModelV4CallOptions` slice both hosted wires spell the same
// way: the standardized sampler fields, the tool projection, the tool choice, the JSON response format and the
// unified effort vocabulary. What a wire spells DIFFERENTLY (OR's nested `reasoning`, vLLM's `top_k`/`min_p`
// via provider options, Anthropic's `thinking`) stays in that wire's own option builder.

import type { JSONSchema7, LanguageModelV4CallOptions, LanguageModelV4FunctionTool, LanguageModelV4ToolChoice } from "@ai-sdk/provider";
import type { EffortLevel } from "@orb/contracts/inference";
import type { ResponseFormat, ToolChoice, WireTool } from "../../contract/chat.ts";
import type { ResolvedSampling } from "../../contract/resolve.ts";

/** The V4 `reasoning` vocabulary — our `max` is the wire's `xhigh` (no provider spells `max` on this axis). */
export type WireEffort = Exclude<NonNullable<LanguageModelV4CallOptions["reasoning"]>, "provider-default">;

export function wireEffortOf(effort: EffortLevel): WireEffort {
  return effort === "max" ? "xhigh" : effort;
}

/** The standardized V4 sampler fields off the resolved sampling. The knobs V4 does NOT model (repetition
 *  penalty, min-p, top-a, logit bias) are the wire's to spell — `samplingExtras` hands them over snake-cased. */
export function standardSampling(sampling: ResolvedSampling, maxOutputTokens: number | undefined): Partial<LanguageModelV4CallOptions> {
  return {
    ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
    ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    ...(sampling.topK !== undefined ? { topK: sampling.topK } : {}),
    ...(sampling.frequencyPenalty !== undefined ? { frequencyPenalty: sampling.frequencyPenalty } : {}),
    ...(sampling.presencePenalty !== undefined ? { presencePenalty: sampling.presencePenalty } : {}),
    ...(sampling.seed !== undefined ? { seed: sampling.seed } : {}),
    ...(sampling.stop !== undefined ? { stopSequences: [...sampling.stop] } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}

/** The OpenAI-dialect spellings of the knobs V4 leaves to the wire. */
export function samplingExtras(sampling: ResolvedSampling): Record<string, unknown> {
  return {
    ...(sampling.repetitionPenalty !== undefined ? { repetition_penalty: sampling.repetitionPenalty } : {}),
    ...(sampling.minP !== undefined ? { min_p: sampling.minP } : {}),
    ...(sampling.topA !== undefined ? { top_a: sampling.topA } : {}),
    ...(sampling.logitBias !== undefined ? { logit_bias: sampling.logitBias } : {}),
  };
}

/** Order preserved — byte-stable request bodies, the prompt cache cares. */
export function functionTools(tools: readonly WireTool[]): LanguageModelV4FunctionTool[] {
  return tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, inputSchema: tool.parameters as JSONSchema7 }));
}

export function toolChoiceOf(choice: ToolChoice): LanguageModelV4ToolChoice {
  return choice.mode === "tool" ? { type: "tool", toolName: choice.name } : { type: choice.mode };
}

/** The V4 JSON response format. The schema arrives ALREADY in the wire subset the calling backend chose
 *  (`scrubWireSchema` at the call site — a hosted transport scrubs, guided decoding does not). */
export function jsonResponseFormat(format: ResponseFormat, schema: Record<string, unknown>): NonNullable<LanguageModelV4CallOptions["responseFormat"]> {
  return {
    type: "json",
    schema: schema as JSONSchema7,
    name: format.name,
    ...(format.description !== undefined ? { description: format.description } : {}),
  };
}
