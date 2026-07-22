// Infra-internal REQUEST shapes for the non-chat roles (embed/rerank/imageEmbed/summarize/generateImage):
// the credential-free arg shape from `@orb/contracts/role-clients` plus the dispatcher-bound
// `credential`/`model`/`signal`. RESULT shapes live in `@orb/contracts/providers`, not redeclared here.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ImageDiffusionParams } from "@orb/contracts/imagery";
import type { ImageEmbedInput, ImageInput, RepetitionDetection, RerankDocument, RerankQuery, ResponseFormat } from "@orb/contracts/role-clients";
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

/** Cross-family summarization request, always batch-shaped (single → `[item]`). */
export interface SummarizeRequest extends RoleRequestCommon {
  readonly inputs: readonly SummarizeRequestItem[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Min-p nucleus floor (vLLM family). */
  readonly minP?: number | undefined;
  readonly repetitionDetection?: RepetitionDetection | undefined;
  /** Structured output (D79) — vLLM enforces via guided decoding; the agent-sdk via its native output
   *  format. Realized per backend; a family that can't honor it drops it. */
  readonly responseFormat?: ResponseFormat | undefined;
}

/** Text→image edit/img2img payload. Present on {@link ImageGenerateRequest.edit} ⇒ img2img/edit;
 *  dropped-with-warning by a runner whose model lacks `input.imageEdit`. */
interface ImageEditInput {
  /** The init/img2img source. OPTIONAL: a pose-only ControlNet drive (comfyui-control §4.12, C6d) carries
   *  just `poseControl` and NO init — the ComfyUI arch builders fall back to a fresh empty latent (txt2img +
   *  controlnet). bytes → data-URL at the runner; string → URL/data-URL. */
  readonly image?: Uint8Array | string | undefined;
  readonly mask?: Uint8Array | string | undefined;
  /** Identity-consistency reference images; runners cap per backend. */
  readonly references?: readonly (Uint8Array | string)[] | undefined;
  /** An OpenPose SKELETON control map (the picked/imported pose, already a control image — NOT a photo) the
   *  ComfyUI curated arm feeds into the family's ControlNet (comfyui-control spec §4.6/§4.12, C6). Distinct from
   *  `references` (identity faces): this is a structural pose guide, not an identity lock. Producers resolve a
   *  pose selection (curated pose id / BYO `poseAssetId`) to these bytes; runners without controlnet ignore it.
   *  bytes / data-URL only (the local arm uploads it to ComfyUI — a bare URL is not a control-map source). */
  readonly poseControl?: Uint8Array | string | undefined;
}

/** Cross-family image-generation request (text → image), distinct from imageEmbed. */
export interface ImageGenerateRequest extends RoleRequestCommon {
  readonly prompt: string;
  /** The generation owner (the caller's user id). Generic (every generation has an owner); today read ONLY by
   *  the ComfyUI BYO arm to owner-scope the `byo:<name>` workflow load (comfyui-control §4.11 — the sealed
   *  runner has no principal, so the ownerId rides the request). Absent ⇒ a `byo:` selection typed-refuses. */
  readonly owner?: UserId | undefined;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  /** Folded into the prompt text by runners whose wire has no native negative field. */
  readonly negativePrompt?: string | undefined;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  readonly edit?: ImageEditInput | undefined;
  /** The optional diffusion knobs a LOCAL image engine (ComfyUI, MA-8/D96) honors — steps/cfg/sampler/
   *  scheduler/seed. A runner whose model lacks the knob (`capability.imageGen` absent) ignores them with
   *  honesty (the ComfyUI runner fills its own defaults for any absent knob; hosted runners read none of
   *  them). Never silently dropped — the capability advertises which knobs exist (D95). */
  readonly imageParams?: ImageDiffusionParams | undefined;
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
