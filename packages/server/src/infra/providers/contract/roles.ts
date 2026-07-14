// Infra-internal REQUEST shapes for the non-chat roles (embed/rerank/imageEmbed/summarize/generateImage):
// the credential-free arg shape from `@orb/contracts/role-clients` plus the dispatcher-bound
// `credential`/`model`/`signal`. RESULT shapes live in `@orb/contracts/providers`, not redeclared here.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type {
  ImageEmbedInput,
  ImageInput,
  RepetitionDetection,
  RerankDocument,
  RerankQuery,
} from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";

interface RoleRequestCommon {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly signal?: AbortSignal | undefined;
}

/** Cross-family text embedding request. Empty/whitespace inputs filter to `null` in the result. */
export interface EmbedRequest extends RoleRequestCommon {
  readonly input: string | readonly string[];
  /** Output dimensionality (MRL models honor truncation). */
  readonly dimensions?: number | undefined;
  readonly inputType?: string | undefined;
  readonly instruction?: string | undefined;
}

/** Cross-family rerank request. Documents carry CALLER ids so results stay stable across reorderings. */
export interface RerankRequest extends RoleRequestCommon {
  readonly query: RerankQuery;
  readonly instruction?: string | undefined;
  readonly documents: readonly RerankDocument[];
  readonly topN?: number | undefined;
}

/** Cross-family joint image+text embedding request; vectors live in the model's shared image/text space. */
export interface ImageEmbedRequest extends RoleRequestCommon {
  readonly input: ImageEmbedInput;
}

/** One summarization task — an independent (system, user) pair so a batch can vary prompts. */
export interface SummarizeRequestItem {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly images?: readonly ImageInput[] | undefined;
}

/** Cross-family summarization request, always batch-shaped (single → `[item]`). */
export interface SummarizeRequest extends RoleRequestCommon {
  readonly inputs: readonly SummarizeRequestItem[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  readonly minP?: number | undefined;
  readonly repetitionDetection?: RepetitionDetection | undefined;
  /** Constrained output via guided decoding (vLLM family). */
  readonly jsonSchema?: object | undefined;
}

/** Text→image edit/img2img payload. Present on {@link ImageGenerateRequest.edit} ⇒ img2img/edit;
 *  dropped-with-warning by a runner whose model lacks `input.imageEdit`. */
interface ImageEditInput {
  /** bytes → data-URL at the runner; string → URL/data-URL. */
  readonly image: Uint8Array | string;
  readonly mask?: Uint8Array | string | undefined;
  /** Identity-consistency reference images; runners cap per backend. */
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

/** Cross-family image-generation request (text → image), distinct from imageEmbed. */
export interface ImageGenerateRequest extends RoleRequestCommon {
  readonly prompt: string;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field. */
  readonly negativePrompt?: string | undefined;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
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
