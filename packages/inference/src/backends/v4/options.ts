// The funnel's resolved knobs → the V4 `LanguageModelV4CallOptions` slice both hosted wires spell the same
// way: the standardized sampler fields, the tool projection, the tool choice, the JSON response format and the
// unified effort vocabulary. What a wire spells DIFFERENTLY (OR's nested `reasoning`, vLLM's `top_k`/`min_p`
// via provider options, Anthropic's `thinking`) stays in that wire's own option builder.

import type {
  JSONObject,
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4ToolChoice,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import type { EffortLevel, EndpointFeatures } from "@orb/contracts/inference";
import type { ResponseFormat, ToolChoice, WireTool } from "../../contract/chat.ts";
import type { ResolvedSampling, ResolvedWarning } from "../../contract/resolve.ts";

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

/** THE STRICT-TOOL RESOLUTION (audit C1). Precedence is the endpoint FIRST, the caller second, which is the
 *  inverse of the `extras` rule and is right for the same reason it is right there: `features.strictJson`
 *  states what the row CAN do, and a caller asking for a mode the endpoint has no field for does not make it
 *  appear. `never` therefore refuses even an explicit `strict: true` — loudly, at the point of declining. */
function strictOf(tool: WireTool, strictJson: EndpointFeatures["strictJson"], warnings: ResolvedWarning[] | undefined): boolean | undefined {
  if (strictJson === "never") {
    if (tool.strict !== undefined) {
      warnings?.push({
        code: "sdk_unsupported_tool",
        message: `tool "${tool.name}" asked for strict input mode: this endpoint's row declares no strict JSON support, so the flag was not sent`,
      });
    }
    return;
  }
  // `default-on` is the guided-decoding row (vLLM): strict is the house default there, and a tool that
  // wants the wider schema subset says `strict: false` explicitly. `declared-only` sends nothing unless asked.
  return tool.strict ?? (strictJson === "default-on" ? true : undefined);
}

/** Order preserved — byte-stable request bodies, the prompt cache cares.
 *
 *  `cacheControl` rides the LAST tool alone (audit C4): the tool list is a large, stable prefix and Anthropic
 *  caches everything UP TO a breakpoint, so one marker at the end of the list caches the whole list. Only the
 *  anthropic converter reads it (`getCacheControl(tool.providerOptions, {type:"tool definition"})`); the
 *  openai-compatible converter ignores an unknown per-tool provider option, so passing it is inert there. */
export function functionTools(
  tools: readonly WireTool[],
  opts: {
    readonly strictJson: EndpointFeatures["strictJson"];
    readonly warnings?: ResolvedWarning[] | undefined;
    readonly cacheLastTool?: SharedV4ProviderOptions | undefined;
  } = {
    strictJson: undefined,
  },
): LanguageModelV4FunctionTool[] {
  const last = tools.length - 1;
  return tools.map((tool, index) => {
    const strict = strictOf(tool, opts.strictJson, opts.warnings);
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters as JSONSchema7,
      ...(strict !== undefined ? { strict } : {}),
      ...(tool.inputExamples !== undefined ? { inputExamples: tool.inputExamples.map((input) => ({ input: input as JSONObject })) } : {}),
      ...(opts.cacheLastTool !== undefined && index === last ? { providerOptions: opts.cacheLastTool } : {}),
    };
  });
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
