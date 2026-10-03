// The RERANK capability — a cross-encoder's window and modalities. `maxInputTokens` bounds the query+doc
// pair the #173 client-side clamp fits (rerank is scoring-only, nothing persisted, so clamping is
// legitimate); `input ∋ image` admits the multimodal data-URI body.

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";

/** Where an ONNX reranker's score comes from. `sequence-classification`: the export ends in the logits head.
 *  `sentence-transformers`: the export ends at the encoder's hidden states, and the repo's `2_Dense`,
 *  `3_LayerNorm` and `4_Dense` modules score the CLS token. */
export const RERANK_ONNX_HEADS = ["sequence-classification", "sentence-transformers"] as const;

// A bare file stem: it is joined under the repo's `onnx/` directory, so it never carries a path separator.
const ONNX_FILE_STEM = /^[\w.-]+$/u;

// A full git commit id: a branch or tag can move under a shipped row and silently change its scores.
const HUB_REVISION = /^[0-9a-f]{40}$/u;

/** How the in-process backend runs a reranker's ONNX export. Curated data only (a `declared` block cannot state it).
 *  `files` names the file per CPU architecture (`process.arch`) for a repo whose quantized files do not follow the
 *  dtype-suffix convention; an architecture with no entry is refused rather than served another file. `revision`
 *  pins every file the backend reads. `dynamicQuantized` says the file quantizes activations per forward pass, so a
 *  pair's score depends on its batch neighbours unless each pair runs alone. */
export const rerankOnnxSchema = z.object({
  head: z.enum(RERANK_ONNX_HEADS),
  dtype: z.string().min(1),
  files: z.record(z.string(), z.string().regex(ONNX_FILE_STEM)).optional(),
  revision: z.string().regex(HUB_REVISION).optional(),
  dynamicQuantized: z.boolean().optional(),
});
export type RerankOnnx = z.infer<typeof rerankOnnxSchema>;

export const rerankCapabilitySchema = z.object({
  maxInputTokens: z.number().int().positive(),
  input: z.array(modalitySchema),
  instructionAware: z.boolean(),
  windowEstimated: z.boolean().optional(),
  onnx: rerankOnnxSchema.optional(),
});
export type RerankCapability = z.infer<typeof rerankCapabilitySchema>;

/** The smallest window a resolved reranker is given, whatever a row or a declared block states: room for a pair's
 *  special tokens plus a few tokens of query and of document. A smaller one leaves a side nothing to score. */
export const RERANK_MIN_WINDOW_TOKENS = 16;

export const RERANK_FLOOR: RerankCapability = {
  maxInputTokens: 512,
  input: ["text"],
  instructionAware: false,
  windowEstimated: true,
};
