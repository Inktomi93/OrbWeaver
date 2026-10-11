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

/** The width a returned vector must have, and whether the model's vectors may be cut down to it. */
export interface VectorFit {
  readonly dims: number;
  readonly mrl: boolean;
}

/** Fit a returned vector to the space width: only an MRL model's longer vector is cut (its prefix is a valid
 *  shorter embedding); any other mismatch is refused, because padding invents coordinates and cutting a
 *  non-MRL vector discards meaning. */
export function fitToDim(vec: readonly number[], fit: VectorFit, prefix: string): Float32Array<ArrayBuffer> {
  if (vec.length !== fit.dims && !(fit.mrl && vec.length > fit.dims)) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${prefix}: the model returned a ${vec.length}-wide vector, but the connection states ${fit.dims}${fit.mrl ? "" : " and the model cannot be shortened"}; set the vector width under Advanced to what the model makes`,
      width: { stated: fit.dims, measured: vec.length },
    });
  }
  return l2Normalize(Float32Array.from(vec.length > fit.dims ? vec.slice(0, fit.dims) : vec)) as Float32Array<ArrayBuffer>;
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
