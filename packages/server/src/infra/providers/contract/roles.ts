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
/** The edit/img2img payload (imagery-design/01 §4). Present on {@link ImageGenerateRequest.edit} ⇒
 *  img2img/edit; absent ⇒ text→image. Dropped-with-warning by a runner whose model lacks
 *  `input.imageEdit` (doc 03 §2 — the belt behind the domain gate). */
export interface ImageEditInput {
  /** The primary init image (edit/inpaint subject). bytes → data-URL at the runner; string → URL/data-URL. */
  readonly image: Uint8Array | string;
  /** Inpaint mask (transparent = editable region). Only meaningful with a mask-capable backend. */
  readonly mask?: Uint8Array | string | undefined;
  /** Additional conditioning/reference images (identity consistency). Runners cap per backend
   *  (doc 03 §2.3). rpg-design/08 §2 consumes up to 4 — the field exists because that consumer is law. */
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

export interface ImageGenerateRequest extends RoleRequestCommon {
  /** Text prompt describing the desired image. */
  readonly prompt: string;
  /** Optional system-style instruction prepended. */
  readonly systemPrompt?: string | undefined;
  /** Number of images to produce; not all providers honor it. */
  readonly n?: number | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field (doc 03 §2.3). */
  readonly negativePrompt?: string | undefined;
  /** A hint, same posture as `n` ("not all providers honor it") — passed where the wire supports it. */
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  /** Present ⇒ img2img/edit; absent ⇒ text→image. Dropped-with-warning by a runner whose model
   *  lacks `input.imageEdit` (doc 03 §2 — the belt behind the domain gate). */
  readonly edit?: ImageEditInput | undefined;
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
