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

/** THE VECTOR-SPACE IDENTITY of an embedding — `<model>` or `<model>@<dtype>`. THE ONE derivation of the
 *  space tag every vector row is keyed on, every retrieval scan filters on, and `purgeStaleVectors` compares
 *  against. It lives here, in contracts, because BOTH sides must spell it identically or the box breaks
 *  silently: the backend stamps the tag on its `EmbedResult.model` (issue-724 `0fed0b3ee` — the provider's
 *  own report is the truth of what geometry a vector is in), while the read side derives it from the owner's
 *  resolved connection. Two private copies of `${model}@${dtype}` is exactly the shape that shipped a corpus
 *  written as `jina-clip-v2@q8` and read back on `jina-clip-v2`: search answered empty forever and the
 *  old-space purge reclaimed the live rows, with no error on any path.
 *
 *  The dtype rides INSIDE the tag rather than in a column because a re-quantised encoder produces different
 *  vectors — it is a different space, and a flip must re-index through the model-change machinery (#2417,
 *  §10-2). `@` cannot occur in a HuggingFace repo id, so the tag never collides with a real model id.
 *
 *  The two sides read their dtype from two different facts (the deployment's served precision vs the curated
 *  capability row), which they are expected to agree on; `embeddings.store` refuses a write where they do
 *  not, so a disagreement is LOUD rather than a silently split corpus. */
export function embedSpaceOf(model: string, dtype: string | undefined): string {
  return dtype === undefined ? model : `${model}@${dtype}`;
}

export const EMBEDDING_FLOOR: EmbeddingCapability = {
  dims: 1024,
  mrl: false,
  maxInputTokens: 512,
  input: ["text"],
  output: ["vector"],
  instructionAware: false,
  windowEstimated: true,
};
