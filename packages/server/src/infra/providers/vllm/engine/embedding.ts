// infra/providers/vllm/engine/embedding — shared embed-wire helpers for the Qwen3-VL-Embedding engine.
//
// WHY ENGINE-LEVEL (not in a surface): the text-embed AND image-embed surfaces share the same vector
// finalize (MRL truncate + L2-normalize) and the same cookbook instructions. A surface may not import a
// sibling surface (`vllm-surface-isolation`), so the shared pieces live DOWN in engine/. Pure transforms.
//
// PROMPT SHAPE (cookbook-critical): Qwen3-VL-Embedding is trained on the ChatML conversation — system =
// instruction, user = content, then the generation prompt (pooling is last-token). Raw unwrapped text
// embeds into a different (worse) region of the space. We replicate the deterministic ChatML template
// string client-side so chunked `input: string[]` batching keeps working — the server's tokenizer parses
// the special tokens exactly as the offline path does.
//
// MRL: vectors are matryoshka — slicing the leading `dim` coords then re-L2-normalizing yields the same
// vector the server would return for `dimensions: dim` (truncation-valid by construction).
//
// L2-NORM (PD-122): the normalize step delegates to `@orb/kit/vector-math`'s `l2Normalize` — the SAME
// primitive the local-light backend uses. The knowledge-cluster local↔hosted embedding swap depends on
// byte-identical L2-norm on both paths (a cosine≈1.0 probe guards exactly this divergence); two
// hand-rolled copies was the risk the probe fears.

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

/** L2-normalize into a cosine-ready `Float32Array` (a truncated vector is no longer unit-length). The
 *  `<ArrayBuffer>` arg matches the EmbedResult contract's vector type (libSQL's `vector_idx` format);
 *  `l2Normalize` allocates a fresh `new Float32Array(dim)` (genuinely ArrayBuffer-backed) but its kit
 *  signature widens the buffer type to `ArrayBufferLike`, so this re-narrows to the true runtime type
 *  (same pattern as local-light's `normalizeVector` — the other consumer of this ONE primitive). */
export function normalizeVector(vec: readonly number[]): Float32Array<ArrayBuffer> {
  return l2Normalize(Float32Array.from(vec)) as Float32Array<ArrayBuffer>;
}
