import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { GoogleChatRequest } from "../../contract/chat.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { StructuredAsk } from "../../structured/plan.ts";
import { standardSampling } from "../v4/options.ts";
import { GOOGLE_KEY } from "./model.ts";

const GOOGLE_EXTRA_KEYS = new Set(["cachedContent", "safetySettings", "threshold", "audioTimestamp", "mediaResolution", "imageConfig"]);

export function googleExtras(connection: Resolved, warnings: ResolvedWarning[]): JSONObject {
  const allowed: JSONObject = {};
  for (const [key, value] of Object.entries(connection.extras ?? {})) {
    if (GOOGLE_EXTRA_KEYS.has(key)) {
      allowed[key] = value;
    } else {
      warnings.push({ code: "custom_parameters_ignored", key, message: `Google extras key "${key}" is unsupported or owned by the task` });
    }
  }
  return allowed;
}

/** Model reasoning facts are resolved before the native transport spells them. */
export function googleThinking(reasoning: ResolvedReasoning): JSONObject {
  if (reasoning.mode === "none") {
    return {};
  }
  if (!reasoning.enabled) {
    return reasoning.offChosen === true ? { thinkingConfig: { thinkingBudget: 0 } } : {};
  }
  if (reasoning.mode === "budget") {
    return { thinkingConfig: { includeThoughts: true, thinkingBudget: reasoning.budgetTokens ?? -1 } };
  }
  return { thinkingConfig: { includeThoughts: true, ...(reasoning.effort === undefined ? {} : { thinkingLevel: reasoning.effort }) } };
}

/** The turn's tools and tool choice, or neither where the model takes no function tools (said, not dropped). */
export function googleToolAsk(
  req: GoogleChatRequest,
  generation: GenerationCapability,
  warnings: ResolvedWarning[],
): Pick<StructuredAsk, "tools" | "toolChoice"> {
  if (req.tools === undefined) {
    return {};
  }
  if (generation.tools === undefined) {
    warnings.push({ code: "sdk_unsupported_tool", message: "The selected model does not support function tools" });
    return {};
  }
  return { tools: req.tools, toolChoice: req.toolChoice };
}

export function googleOptions(
  req: GoogleChatRequest,
  knobs: ResolvedChatKnobs,
  generation: GenerationCapability,
  warnings: ResolvedWarning[],
): Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal"> {
  if (knobs.verbosity !== undefined) {
    warnings.push({ code: "verbosity_dropped", message: "Google has no verbosity option" });
  }
  if (req.params.advanced?.parallelToolCalls === false) {
    warnings.push({ code: "sdk_unsupported_tool", message: "Google cannot disable parallel function calls" });
  }
  return {
    ...standardSampling(knobs.sampling, knobs.maxOutputTokens),
    providerOptions: {
      [GOOGLE_KEY]: {
        ...googleExtras(req.connection, warnings),
        ...googleThinking(knobs.reasoning),
        ...(generation.output.modalities.includes("image") ? { responseModalities: knobs.replyImages ? ["TEXT", "IMAGE"] : ["TEXT"] } : {}),
      },
    },
  };
}
