// The local-light task impls — PURE transforms over the model cache: `embed` (the jina-clip-v2 text encoder;
// empties → `null`, MRL truncation + re-L2, the space tag as `model`), `rerank` (the ONNX cross-encoder; caller
// ids preserved, raw logit as score, text-only), `imageEmbed` (the joint image/text space; the `multimodal`
// PAIR kind requires explicit text fallback — jina-clip has two encoders and defines no fused vector).

import type { Capability } from "@orb/contracts/inference";
import { LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import type { EmbedResult, ImageEmbedResult, RerankResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, ImageInput, RerankQuery } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import { clampToTokenBudget } from "@orb/kit/tokens";
import { ProviderError } from "../../contract/errors.ts";
import type { EmbedRequest, ImageEmbedRequest, RerankRequest } from "../../contract/roles.ts";
import type { LocalLightModelCache } from "./model-cache.ts";
import { abortableWait, normalizeVector, throwIfAborted } from "./model-cache.ts";

/** The bundled encoder and reranker share the canonical seed rows. */
export const DEFAULT_EMBED_MODEL = modelIdSchema.parse(LOCAL_LIGHT_SEED_ROWS[0].model);
export const DEFAULT_RERANK_MODEL = modelIdSchema.parse(LOCAL_LIGHT_SEED_ROWS[1].model);

interface KeptInput {
  readonly index: number;
  readonly text: string;
}

function selectInputs(inputs: readonly string[], instruction: string | undefined): KeptInput[] {
  const kept: KeptInput[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const text = inputs[i] ?? "";
    if (text.trim().length > 0) {
      kept.push({ index: i, text: instruction === undefined || instruction.length === 0 ? text : `${instruction} ${text}` });
    }
  }
  return kept;
}

/** MRL truncation + L2. A request for MORE dims than the model emits is refused — padding invents coordinates. */
function finalizeVector(vec: Float32Array, dimensions: number | undefined, modelId: ModelId): Float32Array<ArrayBuffer> {
  if (dimensions === undefined || dimensions === vec.length) {
    return normalizeVector(vec);
  }
  if (dimensions > vec.length) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `local-light model "${modelId}" emits ${vec.length}-dim vectors; cannot expand to the requested ${dimensions}`,
      width: { stated: dimensions, measured: vec.length },
    });
  }
  return normalizeVector(vec.slice(0, dimensions));
}

/** The width an MRL connection's vectors are cut to; `undefined` for a model whose vectors cannot be shortened. */
function declaredMrlWidth(capability: Capability): number | undefined {
  return capability.kind === "embedding" && capability.embedding.mrl ? capability.embedding.dims : undefined;
}

function scatter(
  total: number,
  kept: readonly KeptInput[],
  raw: readonly Float32Array[],
  finalize: (vec: Float32Array) => Float32Array<ArrayBuffer>,
): (Float32Array<ArrayBuffer> | null)[] {
  const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(total).fill(null);
  for (let j = 0; j < kept.length; j += 1) {
    const slot = kept[j];
    const vec = raw[j];
    if (slot !== undefined && vec !== undefined) {
      vectors[slot.index] = finalize(vec);
    }
  }
  return vectors;
}

/** `spaceTag` maps the loaded repo id to the VECTOR-SPACE identity reported as `result.model` (dtype folded in). */
export function createLocalLightEmbed(cache: LocalLightModelCache, spaceTag: (modelId: ModelId) => string): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = req.connection.model;
    const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
    const kept = selectInputs(inputs, req.instruction);
    const raw =
      kept.length > 0
        ? await abortableWait(
            cache.embedTexts(
              modelId,
              kept.map((k) => k.text),
              req.inputType,
            ),
            req.signal,
          )
        : [];
    throwIfAborted(req.signal);
    // A caller that asks for no width still writes into the connection's space, so a declared MRL width applies.
    const dims = req.dimensions ?? declaredMrlWidth(req.connection.capability);
    const vectors = scatter(inputs.length, kept, raw, (vec) => finalizeVector(vec, dims, modelId));
    return { vectors, model: spaceTag(modelId), usage: { promptTokens: null, totalTokens: null } };
  };
}

function rerankQueryText(query: RerankQuery): string {
  return (typeof query === "string" ? query : (query.text ?? "")).trim();
}

// A cheap first pass only: the worker cuts each pair to the window in the model's own tokens. This bound just keeps
// the tokenizer from encoding a huge input whole, so it is loose enough never to cut what the window could hold.
const PRETRIM_ESTIMATED_TOKENS_PER_WINDOW_TOKEN = 4;

export function createLocalLightRerank(cache: LocalLightModelCache): (req: RerankRequest) => Promise<RerankResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = req.connection.model;
    const baseQuery = rerankQueryText(req.query);
    if (baseQuery.length === 0) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "local-light rerank requires query text (the ONNX cross-encoder is text-only)" });
    }
    const { capability } = req.connection;
    if (capability.kind !== "rerank") {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `local-light rerank: the model "${modelId}" is a ${capability.kind} model, not a reranker`,
      });
    }
    const query = req.instruction !== undefined && req.instruction.length > 0 ? `${req.instruction} ${baseQuery}` : baseQuery;
    const kept = req.documents.filter((doc) => (doc.text ?? "").trim().length > 0);
    if (kept.length === 0) {
      return { hits: [], model: modelId, usage: { totalTokens: null } };
    }
    const { maxInputTokens, onnx } = capability.rerank;
    const pretrim = (text: string): string => clampToTokenBudget(text, maxInputTokens * PRETRIM_ESTIMATED_TOKENS_PER_WINDOW_TOKEN);
    const scores = await abortableWait(
      cache.scorePairs(
        modelId,
        pretrim(query),
        kept.map((doc) => pretrim(doc.text ?? "")),
        { maxInputTokens, onnx },
      ),
      req.signal,
    );
    throwIfAborted(req.signal);
    const hits = kept.map((doc, i) => ({ id: doc.id, score: scores[i] ?? 0 })).sort((a, b) => b.score - a.score);
    return { hits: req.topN === undefined ? hits : hits.slice(0, Math.max(0, req.topN)), model: modelId, usage: { totalTokens: null } };
  };
}

/** Shapes one raw vector into the space: L2 always, and an MRL cut to the connection's stated width. */
type Finalize = (vec: Float32Array) => Float32Array<ArrayBuffer>;

async function embedImageSide(
  cache: LocalLightModelCache,
  modelId: ModelId,
  input: ImageInput | readonly ImageInput[],
  finalize: Finalize,
): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  const images: readonly ImageInput[] = typeof input === "string" || input instanceof Uint8Array ? [input] : input;
  const raw = await cache.embedImages(modelId, images);
  if (raw.length !== images.length) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `local-light imageEmbed: the model returned a vector count that does not match the images — expected ${images.length}, got ${raw.length}`,
    });
  }
  return raw.map((vec) => finalize(vec));
}

async function embedTextSide(
  cache: LocalLightModelCache,
  modelId: ModelId,
  input: string | readonly string[],
  finalize: Finalize,
): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  const texts: readonly string[] = typeof input === "string" ? [input] : input;
  const kept = selectInputs(texts, undefined);
  if (kept.length === 0) {
    return new Array<Float32Array<ArrayBuffer> | null>(texts.length).fill(null);
  }
  const raw = await cache.embedClipTexts(
    modelId,
    kept.map((k) => k.text),
  );
  return scatter(texts.length, kept, raw, finalize);
}

function embedByKind(cache: LocalLightModelCache, modelId: ModelId, input: ImageEmbedInput, finalize: Finalize): Promise<(Float32Array<ArrayBuffer> | null)[]> {
  if (input.kind === "image") {
    return embedImageSide(cache, modelId, input.input, finalize);
  }
  if (input.kind === "text") {
    return embedTextSide(cache, modelId, input.input, finalize);
  }
  if (input.allowTextFallback === true) {
    const pairs = Array.isArray(input.input) ? input.input : [input.input];
    return embedTextSide(
      cache,
      modelId,
      pairs.map((pair) => pair.text),
      finalize,
    );
  }
  return Promise.reject(
    new ProviderError({
      kind: "invalid",
      retryable: false,
      message: 'local-light jina-clip does not support joint image+text PAIR embedding; use kind "image" or "text", or a natively-multimodal endpoint',
    }),
  );
}

export function createLocalLightImageEmbed(
  cache: LocalLightModelCache,
  spaceTag: (modelId: ModelId) => string,
): (req: ImageEmbedRequest) => Promise<ImageEmbedResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = req.connection.model;
    // The image side writes into the same space as the text side, so a declared shorter MRL width applies here too.
    const dims = declaredMrlWidth(req.connection.capability);
    const finalize: Finalize = (vec) => finalizeVector(vec, dims, modelId);
    const vectors = await abortableWait(embedByKind(cache, modelId, req.input, finalize), req.signal);
    throwIfAborted(req.signal);
    return { vectors, model: spaceTag(modelId) };
  };
}
