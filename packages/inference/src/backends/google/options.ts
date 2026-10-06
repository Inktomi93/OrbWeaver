import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { GoogleChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { resolveCachePolicy } from "../../funnel/resolve-cache.ts";
import type { StructuredAsk } from "../../structured/plan.ts";
import { cachePolicyContextOf } from "../kit/response-cache.ts";
import { standardSampling } from "../v4/options.ts";
import { GOOGLE_KEY } from "./model.ts";

const GOOGLE_EXTRA_KEYS = new Set(["cachedContent", "safetySettings", "threshold", "audioTimestamp", "mediaResolution", "imageConfig"]);
const CACHED_CONTENT_REFERENCE = /^cachedContents\/[^/\s]+$/u;

function validateCachedContent(req: GoogleChatRequest): void {
  const reference = req.connection.extras?.["cachedContent"];
  if (reference === undefined) {
    return;
  }
  if (typeof reference !== "string" || !CACHED_CONTENT_REFERENCE.test(reference)) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google cachedContent must name an existing cachedContents resource" });
  }
  if (
    req.systemPrompt.static.trim().length > 0 ||
    req.systemPrompt.dynamic.trim().length > 0 ||
    req.history.some((row) => row.role === "system") ||
    (req.tools?.length ?? 0) > 0 ||
    req.toolChoice !== undefined
  ) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "Google cachedContent owns immutable system instructions and tools; remove the cachedContent reference to send this prompt unchanged",
    });
  }
}

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
function googleThinking(reasoning: ResolvedReasoning): JSONObject {
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
  validateCachedContent(req);
  const cache = resolveCachePolicy({
    context: cachePolicyContextOf(req.connection, false),
    generation,
    preset: req.params.responseCache,
    request: req.responseCache,
  });
  warnings.push(...cache.warnings);
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
