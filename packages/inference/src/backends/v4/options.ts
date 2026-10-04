// The funnel's resolved knobs and the structured plan → the V4 `LanguageModelV4CallOptions` slice every V4 wire
// spells the same way: the standardized sampler fields, the planned tools, tool choice and JSON response format,
// and the unified effort vocabulary. What a wire spells differently (OR's nested `reasoning`, vLLM's `top_k`/`min_p`
// via provider options, Anthropic's `thinking`) stays in that wire's own option builder.

import type {
  JSONObject,
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4ToolChoice,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import type { EffortLevel } from "@orb/contracts/inference";
import type { ToolChoice } from "../../contract/chat.ts";
import type { ResolvedSampling } from "../../contract/resolve.ts";
import type { PlannedResponseFormat, PlannedTool, StructuredPlan } from "../../structured/plan.ts";

/** The V4 `reasoning` vocabulary — our `max` is the wire's `xhigh` (no provider spells `max` on this axis). */
type WireEffort = Exclude<NonNullable<LanguageModelV4CallOptions["reasoning"]>, "provider-default">;

export function wireEffortOf(effort: EffortLevel): WireEffort {
  return effort === "max" ? "xhigh" : effort;
}

/** The standardized V4 sampler fields off the resolved sampling. The knobs V4 does NOT model are the wire's to
 *  spell (the openai-compat wire's `wireSampling`); a wire whose capability states none of them sends none. */
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

/** Order preserved — byte-stable request bodies, the prompt cache cares.
 *
 *  `cacheControl` rides the LAST tool alone: the tool list is a large, stable prefix and Anthropic caches
 *  everything up to a breakpoint, so one marker at the end of the list caches the whole list. Only the anthropic
 *  converter reads it; the openai-compatible converter ignores an unknown per-tool provider option. */
function functionTools(tools: readonly PlannedTool[], cacheLastTool: SharedV4ProviderOptions | undefined): LanguageModelV4FunctionTool[] {
  const last = tools.length - 1;
  return tools.map((tool, index) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters as JSONSchema7,
    ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
    ...(tool.inputExamples !== undefined ? { inputExamples: tool.inputExamples.map((input) => ({ input: input as JSONObject })) } : {}),
    ...(cacheLastTool !== undefined && index === last ? { providerOptions: cacheLastTool } : {}),
  }));
}

function toolChoiceOf(choice: ToolChoice): LanguageModelV4ToolChoice {
  return choice.mode === "tool" ? { type: "tool", toolName: choice.name } : { type: choice.mode };
}

/** The V4 JSON response format off the planned payload; the schema is already in the endpoint's subset. */
function jsonResponseFormat(format: PlannedResponseFormat): NonNullable<LanguageModelV4CallOptions["responseFormat"]> {
  return {
    type: "json",
    schema: format.schema as JSONSchema7,
    name: format.name,
    ...(format.description !== undefined ? { description: format.description } : {}),
  };
}

/** The plan's tools, tool choice and native response format as V4 call options. A tool vehicle's payload already
 *  rides in `plan.tools`, so only a `response-format` payload sets `responseFormat`. */
export function plannedOptions(
  plan: StructuredPlan,
  opts: { readonly cacheLastTool?: SharedV4ProviderOptions | undefined } = {},
): Pick<LanguageModelV4CallOptions, "tools" | "toolChoice" | "responseFormat"> {
  const format = plan.responseFormat;
  return {
    ...(plan.tools !== undefined ? { tools: functionTools(plan.tools, opts.cacheLastTool) } : {}),
    ...(plan.toolChoice !== undefined ? { toolChoice: toolChoiceOf(plan.toolChoice) } : {}),
    ...(format?.vehicle === "response-format" ? { responseFormat: jsonResponseFormat(format) } : {}),
  };
}
