// infra/providers/contract/roles — the infra-internal REQUEST shapes for the non-chat inference roles
// (embed · rerank · imageEmbed · summarize · generateImage). Each = the credential-free call-argument
// shape (canonical in `@orb/contracts/role-clients`) PLUS the turn-time `credential` + resolved `model`
// + `signal` the dispatcher binds. The cross-boundary RESULT shapes (`EmbedResult`/`RerankResult`/…)
// live in `@orb/contracts/providers` (re-exported by the contract barrel) — they must NOT be redeclared
// here. Discriminated at the dispatcher by `credential.source` (roles/dispatch.ts).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type {
  ImageEmbedInput,
  ImageInput,
  RepetitionDetection,
  RerankDocument,
  RerankQuery,
} from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";

/** Fields every non-chat role request carries. */
interface RoleRequestCommon {
  /** Resolved by credentials, handed in — discriminated by `source` at the dispatcher. */
  readonly credential: ResolvedCredential;
  /** The model id for THIS backend (carried through to the result's `model` provenance). */
  readonly model: ModelId;
  /** Cross-role cancellation. */
  readonly signal?: AbortSignal | undefined;
}

/** Cross-family TEXT embedding request — `embed(req)` consumes this. Empty/whitespace inputs are
 *  filtered to `null` in the result (the local family filters; OpenRouter never emits null). */
export interface EmbedRequest extends RoleRequestCommon {
  /** Text(s) to embed. Single string → one vector; array → batched (one per input). */
  readonly input: string | readonly string[];
  /** Output dimensionality (MRL models honor truncation — used to match a shared vector space). */
  readonly dimensions?: number | undefined;
  /** Provider-side input-type hint ("query" vs "document" for asymmetric retrieval). */
  readonly inputType?: string | undefined;
  /** Per-task instruction (instruction-aware embedders); overrides the `inputType` default. */
  readonly instruction?: string | undefined;
}

/** Cross-family rerank request — `rerank(req)` consumes this. Documents carry CALLER ids (not array
 *  indices) so results stay stable across reorderings. Multimodal query/docs per the role-clients
 *  shapes (text-only families ignore images — no-op knob doctrine). */
export interface RerankRequest extends RoleRequestCommon {
  readonly query: RerankQuery;
  /** Per-task `<Instruct>` for instruction-aware rerankers; text-only families ignore it. */
  readonly instruction?: string | undefined;
  readonly documents: readonly RerankDocument[];
  /** Return only the top-N most relevant. Default = all scored documents, sorted descending. */
  readonly topN?: number | undefined;
}

/** Cross-family JOINT image+text embedding request — `imageEmbed(req)` consumes this. The output
 *  vectors live in the SHARED image/text space the model defines. The kind (image | text | multimodal)
 *  is carried by {@link ImageEmbedInput}. */
export interface ImageEmbedRequest extends RoleRequestCommon {
  readonly input: ImageEmbedInput;
}

/** One summarization task — an independent (system, user) pair so a batch can vary prompts. */
export interface SummarizeRequestItem {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  /** Optional image(s) on the user turn — vision families attach them; text-only families ignore. */
  readonly images?: readonly ImageInput[] | undefined;
}

/** Cross-family summarization request — `summarize(req)` consumes this. Always batch-shaped (single →
 *  `[item]`); the backend decides parallelism per family. A request-shaper over the chat role. */
export interface SummarizeRequest extends RoleRequestCommon {
  readonly inputs: readonly SummarizeRequestItem[];
  /** Sampling controls applied uniformly to every input; backends drop knobs they can't honor. */
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  readonly minP?: number | undefined;
  /** N-gram repetition guard (vLLM family). */
  readonly repetitionDetection?: RepetitionDetection | undefined;
  /** JSON Schema for constrained output (vLLM family enforces via guided decoding). */
  readonly jsonSchema?: object | undefined;
}

/** Cross-family image-GENERATION request — `generateImage(req)` consumes this (text → image).
 *  Distinct from imageEmbed (image|text → vector). Hosted-primary (OpenRouter image models). */
export interface ImageGenerateRequest extends RoleRequestCommon {
  /** Text prompt describing the desired image. */
  readonly prompt: string;
  /** Optional system-style instruction prepended. */
  readonly systemPrompt?: string | undefined;
  /** Number of images to produce; not all providers honor it. */
  readonly n?: number | undefined;
}

/** A single returned image — the provider decides between URL and inline base64. */
export interface GeneratedImage {
  readonly url: string | undefined;
  readonly base64: string | undefined;
  readonly mediaType: string | undefined;
}

/** Cross-family image-generation result. */
export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  readonly model: string;
  readonly usage: { readonly costUsd: number | null };
}
