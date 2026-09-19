// infra/providers/backends/local-light/embed — the local-light TEXT-embedding role (the jina-clip-v2
// text encoder via transformers.js). A PURE transform over the model cache: filter empty inputs to
// `null` (the EmbedResult contract — the local family filters; OpenRouter never emits null), apply an
// optional instruction prefix, honor MRL `dimensions` truncation (slice the leading coords + re-L2-
// normalize, since truncation breaks unit length), and carry `model` provenance so `embeddings` can tag
// the vector space. The model DEFINES the space; the dim is the vector length. No vector COMPARISON here.

import type { EmbedRequest, EmbedResult } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import type { LocalLightModelCache } from "./model-cache.ts";
import { normalizeVector, resolveModelId, throwIfAborted } from "./model-cache.ts";

/** The "any box" default text embedder — the jina-clip-v2 text encoder, 1024-dim into the unified
 *  text↔image joint space (fits the `F32_BLOB(1024)` column; the SAME model serves imageEmbed, so a
 *  text embed and an image embed are cosine-comparable — the Qwen3-VL property, on CPU). Overridable via
 *  `req.model` (the connection/binder picks the model; this is the fallback when none was resolved). */
export const DEFAULT_EMBED_MODEL = "jinaai/jina-clip-v2";

/** A non-empty input paired with its slot in the original request order. */
interface KeptInput {
  readonly index: number;
  readonly text: string;
}

/** Apply an instruction prefix when the request carried one. Instruction-aware embedders (e5 / BGE /
 *  Instructor) consume a literal textual prefix; the symmetric default here (jina-clip-v2) gets identity
 *  when no instruction is supplied. `inputType` (query|document) is intentionally a NO-OP for the
 *  symmetric default — there is no model-agnostic prefix to apply without per-model config (the no-op
 *  knob doctrine); an instruction-aware connection passes the prefix explicitly via `instruction`. */
function applyInstruction(text: string, instruction: string | undefined): string {
  return instruction === undefined || instruction.length === 0 ? text : `${instruction} ${text}`;
}

/** Keep only non-empty/whitespace inputs (with their original index); empties become `null` slots. */
function selectInputs(inputs: readonly string[], instruction: string | undefined): KeptInput[] {
  const kept: KeptInput[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const text = inputs[i] ?? "";
    if (text.trim().length > 0) {
      kept.push({ index: i, text: applyInstruction(text, instruction) });
    }
  }
  return kept;
}

/** Truncate (MRL) + L2-normalize one raw vector into its final stored form. */
// @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
function finalizeVector(vec: Float32Array, dimensions: number | undefined, modelId: string): Float32Array<ArrayBuffer> {
  if (dimensions === undefined || dimensions === vec.length) {
    return normalizeVector(vec);
  }
  if (dimensions > vec.length) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `local-light model "${modelId}" emits ${vec.length}-dim vectors; cannot expand to the requested ${dimensions}`,
    });
  }
  // Matryoshka truncation: keep the leading `dimensions` coords, THEN re-L2-normalize (a truncated
  // unit vector is no longer unit-length; comparisons assume normalized vectors).
  return normalizeVector(vec.slice(0, dimensions));
}

/** Scatter the dense `raw` vectors (one per kept input) back into their original slots, finalized. */
function assembleVectors(
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

/** Bind the embed role to a model cache (the real transformers.js cache, or a test fake).
 *
 *  `spaceTag` maps the loaded repo id to the VECTOR-SPACE identity reported as `result.model` — the string
 *  the `embeddings` domain stamps on every row and compares against the active space. It arrives as a
 *  function rather than being derived here so this file stays free of the `@huggingface/transformers`
 *  vocabulary (the dtype it folds in is transformers.js's); `model-cache.ts` owns both the coupling and the
 *  derivation, and `index.ts` binds them. REQUIRED on purpose: a default would let a future call site ship
 *  vectors tagged with a space they were not produced in, and nothing downstream could tell. */
// @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
export function createLocalLightEmbed(cache: LocalLightModelCache, spaceTag: (modelId: string) => string): (req: EmbedRequest) => Promise<EmbedResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = resolveModelId(req.model, DEFAULT_EMBED_MODEL);
    const inputs: readonly string[] = typeof req.input === "string" ? [req.input] : req.input;
    const kept = selectInputs(inputs, req.instruction);

    const raw =
      kept.length > 0
        ? await cache.embedTexts(
            modelId,
            kept.map((k) => k.text),
          )
        : [];
    throwIfAborted(req.signal);

    const vectors = assembleVectors(inputs.length, kept, raw, (vec) => finalizeVector(vec, req.dimensions, modelId));
    // In-process inference is unmetered → null token usage (the EmbedResult contract). `model` is the SPACE
    // tag, not the loader id: it carries the dtype, because a re-quantised encoder is a different space
    // (model-cache.ts's `localLightEmbedSpaceTag`).
    return { vectors, model: spaceTag(modelId), usage: { promptTokens: null, totalTokens: null } };
  };
}
