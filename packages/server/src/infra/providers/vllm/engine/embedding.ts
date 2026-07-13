// Shared embed-wire helpers for the Qwen3-VL-Embedding engine, at engine-level (not a surface) because
// text-embed AND image-embed share the same vector finalize + cookbook instructions, and a surface may
// not import a sibling surface (`vllm-surface-isolation`).
//
// PROMPT SHAPE (cookbook-critical): Qwen3-VL-Embedding is trained on ChatML (system=instruction,
// user=content, last-token pooling); raw unwrapped text embeds into a worse region, so we replicate the
// deterministic ChatML template client-side. MRL: slicing the leading `dim` coords then re-L2-normalizing
// matches the server's `dimensions: dim` truncation. L2-NORM (PD-122): delegates to `@orb/kit/vector-math`
// — the SAME primitive local-light uses (the local↔hosted embedding swap needs byte-identical L2-norm).

import { l2Normalize } from "@orb/kit/vector-math";

/** Cookbook default instruction — documents / generic representation. */
export const DOC_INSTRUCTION = "Represent the user's input.";
/** Cookbook retrieval instruction — what queries embed with (asymmetric retrieval). */
export const QUERY_INSTRUCTION = "Retrieve images or text relevant to the user's query.";

/** The ChatML conversation Qwen3-VL-Embedding was trained on (see PROMPT SHAPE above). */
export function toEmbedPrompt(text: string, instruction: string): string {
  return `<|im_start|>system\n${instruction}<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n`;
}

/** MRL client-side fallback: keep the leading `dim` coords (a no-op when the vector is already ≤ dim). */
export function truncateToDim(vec: readonly number[], dim: number): number[] {
  return vec.length > dim ? vec.slice(0, dim) : [...vec];
}

/** L2-normalize into a cosine-ready `Float32Array` (a truncated vector is no longer unit-length);
 *  re-narrows `l2Normalize`'s widened `ArrayBufferLike` return to the true runtime type. */
export function normalizeVector(vec: readonly number[]): Float32Array<ArrayBuffer> {
  return l2Normalize(Float32Array.from(vec)) as Float32Array<ArrayBuffer>;
}
