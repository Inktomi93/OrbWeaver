// The EMBEDDING capability — the admission facts for a vector model. `dtype` folds into the space tag
// `model[@dtype]` (two providers serving the same weights at the same dtype ARE one space, so there is
// deliberately no provider id here). `dims` IS the owner's space width; it rides the generation identity, not
// the tag. A vector is never padded. An MRL model is asked for exactly `dims` and only its longer vector is
// cut to that width; any other width mismatch is refused, which is how a declared shorter width is honoured.

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";

const NATIVE_TEXT_WINDOW_TOKENS = 512;
export const localTextEncodingSchema = z.object({
  version: z.literal(1),
  maxTokens: z.literal(NATIVE_TEXT_WINDOW_TOKENS),
  pooling: z.literal("mean-normalized"),
});
export type LocalTextEncoding = z.infer<typeof localTextEncodingSchema>;

/** Native text attention is bounded independently of the model's accepted input window. */
export const LOCAL_TEXT_ENCODING = { version: 1, maxTokens: NATIVE_TEXT_WINDOW_TOKENS, pooling: "mean-normalized" } as const satisfies LocalTextEncoding;

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
  /** The local encoder's lossless window/centroid recipe; changing it moves the vector generation. */
  localTextEncoding: localTextEncodingSchema.optional(),
  /** The text scaffold the encoder was trained on when served over a plain `/v1/embeddings` `input`:
   *  `chatml` = the Qwen3-VL-Embedding cookbook conversation (`<|im_start|>system … assistant\n`). A
   *  capability fact the curated row states, never a wire feature — a served OpenAI embedder has none. */
  promptScaffold: z.enum(["chatml", "gemini-retrieval"]).optional(),
  /** The model supports retrieval task types through a native embedding API. */
  retrievalTaskType: z.boolean().optional(),
  windowEstimated: z.boolean().optional(),
  /** `dims` is the kind floor's guess: no tier above it stated a width, so the space fit is unproven. */
  dimsEstimated: z.boolean().optional(),
});
export type EmbeddingCapability = z.infer<typeof embeddingCapabilitySchema>;

/** The connection-row fields a vector space's identity is derived from. A patch touching none of them cannot move
 *  an owner to a new embedding generation, so neither the server preview nor the pane's confirm needs to ask. */
export const EMBED_SPACE_FIELDS = ["providerId", "baseUrl", "model", "api", "declared", "extras", "transport"] as const;

/** THE VECTOR-SPACE IDENTITY of an embedding — `<model>` or `<model>@<dtype>`. THE ONE derivation of the
 *  space tag every vector row is keyed on, every retrieval scan filters on, and a generation's identity is
 *  minted from. It lives here, in contracts, because BOTH sides must spell it identically or the box breaks
 *  silently: the backend stamps the tag on its `EmbedResult.model` (issue-724 `088209c8be` — the provider's
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
