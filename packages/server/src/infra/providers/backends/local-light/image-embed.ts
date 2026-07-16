// infra/providers/backends/local-light/image-embed — the local-light JOINT image+text embedding role
// (the jina-clip-v2 multimodal model via transformers.js). A PURE transform over the model cache: image
// and text inputs are embedded into the ONE shared 1024-dim image/text space jina-clip defines (an image
// embed and a text embed from the SAME model compare directly), then L2-normalized (one home:
// `@orb/kit/vector-math`). Empty text inputs filter to `null` (aligned to request order). Carries
// `model` provenance so `embeddings` can tag the space (a CPU jina-clip space is its OWN space — never
// compared with a vLLM/Qwen space). No vector COMPARISON here.
//
// FLAGGED not-supported: the `multimodal` kind (a joint image+text PAIR → one vector) is reserved for
// natively-multimodal families (vLLM Qwen3-VL). jina-clip has two separate encoders (text + image) and
// does NOT define a single fused image+text vector, so this backend throws a typed not-supported rather
// than inventing a fusion the model never learned (providers.md: flag, don't fake).

import type { ImageEmbedInput, ImageInput } from "@orb/contracts/role-clients";
import type { ImageEmbedRequest, ImageEmbedResult } from "../../contract";
import { ProviderError } from "../../contract";
import type { LocalLightModelCache } from "./model-cache";
import { normalizeVector, resolveModelId, throwIfAborted } from "./model-cache";

/** The "any box" default joint image+text embedder — jina-clip-v2, 1024-dim shared space (the SAME model
 *  the embed role defaults to: one model, both modalities, ONE joint space → text↔image comparable, and
 *  it fits the `F32_BLOB(1024)` column). Overridable via `req.model`. */
export const DEFAULT_IMAGE_EMBED_MODEL = "jinaai/jina-clip-v2";

/** Compile-time exhaustiveness: an unhandled `kind` makes this a type error AND fails loud at runtime. */
function assertNeverKind(value: never): never {
  throw new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `local-light imageEmbed: unhandled input kind ${JSON.stringify(value)}`,
  });
}

/** Embed images → one normalized vector each (no filtering — every image is attempted). A lone
 *  `Uint8Array`/string image is NOT a JS Array, so `Array.isArray` correctly wraps it. */
async function embedImageSide(
  cache: LocalLightModelCache,
  modelId: string,
  input: ImageInput | readonly ImageInput[],
): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  // A lone image is a `string` (path/URL) or `Uint8Array` (bytes) — neither is a JS Array, so a single
  // image wraps cleanly instead of being treated as an array of items.
  const images: readonly ImageInput[] = typeof input === "string" || input instanceof Uint8Array ? [input] : input;
  const raw = await cache.embedImages(modelId, images);
  return raw.map((vec) => normalizeVector(vec));
}

/** Embed texts → one normalized vector each; empty/whitespace texts filter to `null` (aligned). */
async function embedTextSide(cache: LocalLightModelCache, modelId: string, input: string | readonly string[]): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  const texts: readonly string[] = typeof input === "string" ? [input] : input;
  const kept: { index: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i] ?? "";
    if (text.trim().length > 0) {
      kept.push({ index: i, text });
    }
  }
  const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(texts.length).fill(null);
  if (kept.length === 0) {
    return vectors;
  }
  const raw = await cache.embedClipTexts(
    modelId,
    kept.map((k) => k.text),
  );
  for (let j = 0; j < kept.length; j += 1) {
    const slot = kept[j];
    const vec = raw[j];
    if (slot !== undefined && vec !== undefined) {
      vectors[slot.index] = normalizeVector(vec);
    }
  }
  return vectors;
}

/** Dispatch on the discriminated `kind` of the joint-embed input. */
async function embedByKind(cache: LocalLightModelCache, modelId: string, input: ImageEmbedInput): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  switch (input.kind) {
    case "image":
      return await embedImageSide(cache, modelId, input.input);
    case "text":
      return await embedTextSide(cache, modelId, input.input);
    case "multimodal":
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message:
          'local-light jina-clip does not support joint image+text PAIR embedding; use kind "image" or "text", or a natively-multimodal backend (vLLM Qwen3-VL)',
      });
    default:
      return assertNeverKind(input);
  }
}

/** Bind the imageEmbed role to a model cache (the real transformers.js cache, or a test fake). */
export function createLocalLightImageEmbed(cache: LocalLightModelCache): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = resolveModelId(req.model, DEFAULT_IMAGE_EMBED_MODEL);
    const vectors = await embedByKind(cache, modelId, req.input);
    throwIfAborted(req.signal);
    return { vectors, model: modelId };
  };
}
