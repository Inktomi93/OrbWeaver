// The EMBEDDING capability — the admission facts for a vector model. `dims` + `dtype` are what the space tag
// `(model, dim[@dtype])` is derived from (`embeddings.ts:22-28`'s law: two providers serving the same
// weights at the same dtype ARE one space, so there is deliberately no provider id here). `mrl` says a
// longer vector may be TRUNCATED to `EMBED_SPACE_DIMS`; a shorter one is REFUSED, never padded (#1635).

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";

export const embeddingCapabilitySchema = z.object({
  dims: z.number().int().positive(),
  /** Matryoshka: the model honours `dimensions` truncation. */
  mrl: z.boolean(),
  maxInputTokens: z.number().int().positive(),
  /** `text`, and `image` for a joint-space encoder (jina-clip-v2, a VL embedder on vLLM). */
  input: z.array(modalitySchema),
  output: z.tuple([z.literal("vector")]),
  /** Honours a per-task instruction prefix (the asymmetric query/document scaffold). */
  instructionAware: z.boolean(),
  /** The served precision (`q8`, `fp16`) — part of the space tag when present (#2417). */
  dtype: z.string().min(1).optional(),
  /** The text scaffold the encoder was trained on when served over a plain `/v1/embeddings` `input`:
   *  `chatml` = the Qwen3-VL-Embedding cookbook conversation (`<|im_start|>system … assistant\n`). A
   *  capability fact the curated row states, never a wire feature — a served OpenAI embedder has none. */
  promptScaffold: z.enum(["chatml"]).optional(),
  windowEstimated: z.boolean().optional(),
});
export type EmbeddingCapability = z.infer<typeof embeddingCapabilitySchema>;

export const EMBEDDING_FLOOR: EmbeddingCapability = {
  dims: 1024,
  mrl: false,
  maxInputTokens: 512,
  input: ["text"],
  output: ["vector"],
  instructionAware: false,
  windowEstimated: true,
};
