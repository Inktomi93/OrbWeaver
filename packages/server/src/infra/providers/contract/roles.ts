// Infra-internal REQUEST shapes for the non-chat roles (embed/rerank/imageEmbed/summarize/generateImage):
// the credential-free arg shape from `@orb/contracts/role-clients` plus the dispatcher-bound
// `credential`/`model`/`signal`. RESULT shapes live in `@orb/contracts/providers`, not redeclared here.
// ALSO the server-side CALL seam for those same signals: `@orb/contracts` is isomorphic and DOM/node-free
// (`lib: es2025`), so an `AbortSignal` cannot live on `RoleClients`/`SummarizeOptions` there (the
// `PortableEntity.exportAll` precedent states the rule). The cancellation-carrying variants therefore live
// HERE — the lowest tier both `domain/` (the caller) and `entry/compose` (the binder) may import.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { SummarizeResult } from "@orb/contracts/providers";
import type {
  ImageEmbedInput,
  ImageInput,
  RepetitionDetection,
  RerankDocument,
  RerankQuery,
  ResponseFormat,
  RoleClients,
  SummarizeInput,
  SummarizeOptions,
} from "@orb/contracts/role-clients";
import type { ModelId, UserId } from "@orb/kit/ids";
import type { ResolvedWarning } from "./resolve";

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

/** Cross-family summarization request, always batch-shaped (single → `[item]`). SUMMARIZE IS SUMMARIZATION —
 *  a prose consumer role. One-shot SCHEMA-CONSTRAINED generation (rpg extraction, discovery narratives, any
 *  probe) is the DISTINCT `structured` role ({@link StructuredRequest}) — owner ruling 2026-07-27: `summarize`
 *  and structured output are separate concerns and must not be conflated on one role. */
export interface SummarizeRequest extends RoleRequestCommon {
  readonly inputs: readonly SummarizeRequestItem[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  readonly minP?: number | undefined;
  readonly repetitionDetection?: RepetitionDetection | undefined;
}

/** The `structured` role's request — the one-shot SCHEMA-CONSTRAINED generation PRIMITIVE (owner ruling
 *  2026-07-27, split out of `summarize`). Same batch shape as summarize (reuse: single → `[item]`), but
 *  `responseFormat` is REQUIRED — this role EXISTS to produce schema-conforming JSON. Consumers: rpg reliable
 *  extraction, discovery analyze/distill narratives, capability probes — anything that summarizes NOTHING but
 *  needs constrained output. Backends realize it over the SAME chat-completion core `summarize` uses, with
 *  `response_format` on the wire (vLLM guided decoding / OR strict json_schema). The result reuses
 *  {@link SummarizeResult} — each item's `text` is the JSON string the caller parses. */
export interface StructuredRequest extends RoleRequestCommon {
  readonly inputs: readonly SummarizeRequestItem[];
  readonly responseFormat: ResponseFormat;
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  readonly minP?: number | undefined;
  readonly repetitionDetection?: RepetitionDetection | undefined;
}

/** The `RoleClients.summarize` CALL options as the SERVER sees them: the isomorphic contracts vocabulary plus
 *  the caller's `AbortSignal`. The binder forwards it onto {@link SummarizeRequest.signal}, so a caller that
 *  already owns a cancellation (a chat turn's active-turn handle) can kill an in-flight side-LLM call instead
 *  of waiting on a box that accepted the socket and never answered. */
export interface SummarizeCallOptions extends SummarizeOptions {
  readonly signal?: AbortSignal | undefined;
}

/** The `RoleClients` bundle as the composition root actually mints it — identical to the isomorphic
 *  `RoleClients` except `summarize` accepts {@link SummarizeCallOptions}. A subtype of `RoleClients`
 *  (the extra option is optional), so every existing `RoleClients` consumer keeps working unchanged; only a
 *  caller typed against THIS can hand the summarizer a signal. Naming it is the enforcer: the binder's
 *  return type is what states the capability, so dropping the forward is a type change, not a silent lie. */
export interface RoleClientsWithSignal extends RoleClients {
  readonly summarize: (inputs: SummarizeInput[], opts?: SummarizeCallOptions) => Promise<SummarizeResult>;
}

/** Text→image edit/img2img payload. Present on {@link ImageGenerateRequest.edit} ⇒ img2img/edit;
 *  dropped-with-warning by a runner whose model lacks `input.imageEdit`. */
interface ImageEditInput {
  /** The init/img2img source. bytes → data-URL at the runner; string → URL/data-URL. */
  readonly image?: Uint8Array | string | undefined;
  readonly mask?: Uint8Array | string | undefined;
  /** Identity-consistency reference images; runners cap per backend. */
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

/** Cross-family image-generation request (text → image), distinct from imageEmbed. */
export interface ImageGenerateRequest extends RoleRequestCommon {
  readonly prompt: string;
  /** The generation owner (the caller's user id). Generic (every generation has an owner); the sealed
   *  runner has no principal, so the ownerId rides the request when a runner needs owner scope. */
  readonly owner?: UserId | undefined;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field. */
  readonly negativePrompt?: string | undefined;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  readonly edit?: ImageEditInput | undefined;
  /** The resolved model capability the runner reads for the edit belt (imagery-design/03 §1): an `edit`
   *  payload whose model lacks `input.imageEdit` is stripped + warned, never sent (the ChatRequest.capability
   *  precedent). Absent ⇒ treated as no-edit-capability by the belt. */
  readonly capability?: ModelCapability | undefined;
}

/** A single returned image — the provider decides between URL and inline base64. */
export interface GeneratedImage {
  readonly url: string | undefined;
  readonly base64: string | undefined;
  readonly mediaType: string | undefined;
}

/** Cross-family image-generation result. `warnings` carries the runner's edit-strip belt emissions
 *  (imagery-design/03 §2) — empty on the ordinary text→image path. */
export interface ImageGenerateResult {
  readonly images: readonly GeneratedImage[];
  readonly model: string;
  readonly usage: { readonly costUsd: number | null };
  readonly warnings: readonly ResolvedWarning[];
}
