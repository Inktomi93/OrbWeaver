// `@orb/contracts/role-clients` — the `RoleClients` composition seam: the bundle of BOUND-CALLABLE
// inference role functions the composition root mints ONCE at boot and threads through every
// consumer's deps. Downstream code never sees a credential literal or picks a model — it calls
// `clients.embed(text)` and gets a result.
// Type-only: a bundle of functions isn't wire-serializable, so no zod schemas here. Call-argument
// shapes (`RerankQuery`/`ImageEmbedInput`/`SummarizeInput`) live here rather than `contracts/providers`
// because that node holds only result shapes; the infra request shapes stay infra-internal.
// FLAG: only the four DERIVE roles below are buildable — chat/agent/generateImage join when their
// result contracts land (confirm with lead before wiring a chat member here).

import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "#providers";

/** Image bytes or a filesystem path. Lib-clean: `Uint8Array | string` (a node `Buffer` IS a
 *  `Uint8Array`, so it still satisfies this; `string` = a path the image family reads). */
export type ImageInput = Uint8Array | string;

/** The query side of a rerank — a plain string, or text / image / combo for multimodal rerankers
 *  (Qwen3-VL-Reranker). Text-only families score on `text` and ignore `image` (no-op knob doctrine). */
export type RerankQuery = string | { text?: string | undefined; image?: ImageInput | undefined };

/** One rerank document: a CALLER-supplied id (not an array index — results stay stable across
 *  reorderings) plus at least one of text / image. */
export interface RerankDocument {
  id: string;
  text?: string | undefined;
  image?: ImageInput | undefined;
}

/** A joint image+text pair embedded into ONE vector (e.g. a card PNG plus its caption); only
 *  natively-multimodal families honor it. */
export interface ImageEmbedPair {
  image: ImageInput;
  text: string;
}

/** The credential-free call argument for `imageEmbed` — `Omit<ImageEmbedRequest, "credential" | "model" | "signal">`
 *  from the infra request, re-expressed as the cross-boundary input. Discriminate
 *  via `kind`: image-side / text-side (text→image search) / joint multimodal. `instruction` is the
 *  per-task hint for instruction-aware families; others ignore it. */
export type ImageEmbedInput =
  | { kind: "image"; input: ImageInput | ImageInput[]; instruction?: string | undefined }
  | { kind: "text"; input: string | string[]; instruction?: string | undefined }
  | {
      kind: "multimodal";
      input: ImageEmbedPair | ImageEmbedPair[];
      instruction?: string | undefined;
    };

/** N-gram repetition guard (vLLM family) — stops a degenerate loop before `maxTokens`. Families that
 *  don't honor it drop it (no-op knob doctrine). */
export interface RepetitionDetection {
  maxPatternSize: number;
  minPatternSize?: number | undefined;
  minCount: number;
}

/** One summarization task — an independent (system, user) pair so a batch can vary prompts. The
 *  credential-free counterpart of the infra `SummarizeRequestItem`. */
export interface SummarizeInput {
  systemPrompt: string;
  userPrompt: string;
  /** Optional image(s) on the user turn — vision-capable families attach them; text-only families
   *  ignore them. Bytes or a filesystem path. */
  images?: ImageInput[] | undefined;
}

/** Per-call sampling overrides for `summarize` — applied uniformly to every input; runners that can't
 *  honor a knob drop it silently (cross-family summarize is fire-and-forget for these). */
export interface SummarizeOptions {
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  minP?: number | undefined;
  /** JSON Schema for constrained output (vLLM family enforces via guided decoding). */
  jsonSchema?: object | undefined;
  repetitionDetection?: RepetitionDetection | undefined;
}

/** Bound-callable role clients — the composition root binds credential + model id ONCE at boot. The
 *  `*Model` fields carry the model id baked into each callable, for DB provenance columns. */
export interface RoleClients {
  /** Text-embedding. Single string or array — result vectors are index-aligned. `inputType` is the
   *  asymmetric-retrieval hint ("query" vs "document"); symmetric embedders ignore it. */
  embed: (
    input: string | string[],
    opts?: { inputType?: "query" | "document"; instruction?: string },
  ) => Promise<EmbedResult>;
  /** Cross-encoder rerank. Documents carry caller ids; hits preserve them. `opts.instruction` is the
   *  per-task `<Instruct>` for instruction-aware rerankers; text-only families ignore it. */
  rerank: (
    query: RerankQuery,
    documents: RerankDocument[],
    opts?: { instruction?: string },
  ) => Promise<RerankResult>;
  /** Joint image+text embedding (image + text in one shared space). Discriminate via `kind`. */
  imageEmbed: (req: ImageEmbedInput) => Promise<ImageEmbedResult>;
  /** Batched summarization. Returns one item per input; pass non-empty user prompts only. */
  summarize: (inputs: SummarizeInput[], opts?: SummarizeOptions) => Promise<SummarizeResult>;

  /** Model id baked into `embed` — stored on every embedding row's `model` column. */
  embedModel: string;
  /** Model id baked into `rerank` — provenance only (rerank scores aren't persisted long-term). */
  rerankModel: string;
  /** Model id baked into `imageEmbed` — stored on `image_embeddings.model`. */
  imageEmbedModel: string;
  /** Model id baked into `summarize` — stored on `chat_digests.summarizerModel`. */
  summarizerModel: string;
  /** The summarizer model's resolved context window in tokens. The memory build's token-guard reads
   *  this to fit each summarizer call to the user's actual context — trim-to-fit, never silent truncation. */
  summarizerContextTokens: number;
}
