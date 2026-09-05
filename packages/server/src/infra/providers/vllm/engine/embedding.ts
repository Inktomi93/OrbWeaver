// Shared embed-wire helpers for the Qwen3-VL-Embedding engine, at engine-level (not a surface) because
// text-embed AND image-embed share the same vector finalize + cookbook instructions, and a surface may
// not import a sibling surface (`vllm-surface-isolation`).
//
// PROMPT SHAPE (cookbook-critical): Qwen3-VL-Embedding is trained on ChatML (system=instruction,
// user=content, last-token pooling); raw unwrapped text embeds into a worse region, so we replicate the
// deterministic ChatML template client-side. MRL: slicing the leading `dim` coords then re-L2-normalizing
// matches the server's `dimensions: dim` truncation — but ONLY downward; a vector NARROWER than the request
// is a malformed response and is refused, never padded (`fitToDim`). L2-NORM (PD-122): delegates to `@orb/kit/vector-math`
// — the SAME primitive local-light uses (the local↔hosted embedding swap needs byte-identical L2-norm).

import { l2Normalize } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/index.ts";

/** Cookbook default instruction — documents / generic representation. */
export const DOC_INSTRUCTION = "Represent the user's input.";
/** Cookbook retrieval instruction — what queries embed with (asymmetric retrieval). */
export const QUERY_INSTRUCTION = "Retrieve images or text relevant to the user's query.";

/** The ChatML conversation Qwen3-VL-Embedding was trained on (see PROMPT SHAPE above). */
export function toEmbedPrompt(text: string, instruction: string): string {
  return `<|im_start|>system\n${instruction}<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`;
}

/** Fit an engine vector to the width the caller asked for — the ONE RULE for what reaches the store, and
 *  its two halves are deliberately NOT symmetric:
 *
 *  • LONGER than `dim` → truncate (the MRL client-side fallback). Slicing the leading coords is exactly what
 *    the server's own `dimensions:` truncation does, so this is a deliberate transform, not a fault.
 *  • EXACTLY `dim` → a copy, unchanged. We never expand.
 *  • SHORTER than `dim` → REFUSE. There is no honest recovery: padding invents coordinates, and accepting it
 *    stores a vector of a different WIDTH — i.e. of a different SPACE — which nothing downstream can detect,
 *    because a stored vector carries no evidence of the width it was supposed to be. It becomes a
 *    permanently wrong neighbour set. This half was a silent no-op before #1635, so a short vector from a
 *    misconfigured or partially-loaded engine reached the store while the OpenRouter decoder
 *    (`backends/kit/embedding-decode`) refused the identical shape one backend over.
 *
 *  `invalid` + non-retryable matches that decoder: the disagreement is deterministic, so a retry re-buys it.
 *  `prefix` is the caller's operator-facing coordinates, so a refusal names the surface and model. */
export function fitToDim(vec: readonly number[], dim: number, prefix: string): number[] {
  if (vec.length < dim) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${prefix}: the engine returned a vector narrower than the requested dimensions — expected ${dim}, got ${vec.length}`,
    });
  }
  return vec.length > dim ? vec.slice(0, dim) : [...vec];
}

/** L2-normalize into a cosine-ready `Float32Array` (a truncated vector is no longer unit-length);
 *  re-narrows `l2Normalize`'s widened `ArrayBufferLike` return to the true runtime type. */
export function normalizeVector(vec: readonly number[]): Float32Array<ArrayBuffer> {
  return l2Normalize(Float32Array.from(vec)) as Float32Array<ArrayBuffer>;
}
