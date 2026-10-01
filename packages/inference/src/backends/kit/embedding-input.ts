import type { EmbeddingCapability } from "@orb/contracts/inference";
import { l2Normalize } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/errors.ts";
import type { EmbedRequest } from "../../contract/roles.ts";

/** Cookbook instructions (Qwen3-VL-Embedding, asymmetric retrieval). */
export const DOC_INSTRUCTION = "Represent the user's input.";
export const QUERY_INSTRUCTION = "Retrieve images or text relevant to the user's query.";

/** The ChatML conversation Qwen3-VL-Embedding was trained on. */
function toChatMlPrompt(text: string, instruction: string): string {
  return `<|im_start|>system\n${instruction}<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`;
}

/** MRL truncation down; a REFUSAL for a narrower vector (#1635 — padding invents coordinates). */
export function fitToDim(vec: readonly number[], dim: number | undefined, prefix: string): Float32Array<ArrayBuffer> {
  if (dim !== undefined && vec.length < dim) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${prefix}: the model returned a ${vec.length}-wide vector, narrower than the ${dim} the space admits`,
    });
  }
  const sliced = dim !== undefined && vec.length > dim ? vec.slice(0, dim) : vec;
  return l2Normalize(Float32Array.from(sliced)) as Float32Array<ArrayBuffer>;
}

/** The prompt one input embeds as: the scaffold + instruction the capability says the model was trained on. */
export function embeddingPrompt(text: string, req: EmbedRequest, capability: EmbeddingCapability): string {
  const instruction = req.instruction ?? (req.inputType === "query" ? QUERY_INSTRUCTION : DOC_INSTRUCTION);
  if (capability.promptScaffold === "gemini-retrieval") {
    return req.inputType === "query" ? `task: ${req.instruction ?? "search result"} | query: ${text}` : `title: none | text: ${text}`;
  }
  if (capability.promptScaffold === "chatml") {
    return toChatMlPrompt(text, instruction);
  }
  return capability.instructionAware && req.instruction !== undefined ? `${req.instruction} ${text}` : text;
}
