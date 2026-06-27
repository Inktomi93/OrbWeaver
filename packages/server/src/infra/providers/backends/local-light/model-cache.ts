// infra/providers/backends/local-light/model-cache — the lazy, memoized transformers.js/ONNX model
// loader + the inference seam. THE single home for the `@huggingface/transformers` coupling: every raw
// pipeline / model / tokenizer / processor load + run lives here, so the role files
// (embed/rerank/image-embed) stay pure transforms over `Float32Array`/`number` and are unit-testable
// with an injected fake cache (no network, no ONNX session). Load-once-reuse: a model loads on first
// use and is memoized (bounded — see MODEL_CACHE_CAP); concurrent first calls share the one in-flight
// load promise (the map stores the promise, not the resolved model).
//
// DEVICE SELECTION (D39 — the CPU+CUDA "any box" tier): the resolved device (default "auto") is handed
// straight to transformers.js, which maps it to an ONNX execution-provider list — on linux-x64 that is
// [cuda, webgpu, cpu], so ONNX Runtime uses the CUDA EP when a GPU + driver are present and falls
// through to CPU otherwise. As a hard backstop for the GPU-less user, a load that THROWS on a non-CPU
// device is retried once on "cpu" — the in-process tier must work on ANY box, GPU or not.
//
// This module ALSO homes the two tiny request helpers the three role files share (`resolveModelId` /
// `throwIfAborted`) — they are the local-light slice's only shared infra, and the disjoint-file-set
// rule keeps the slice to its enumerated files, so this (already shared-by-all-three) module is their
// one home rather than a copy in each role file.

import type { DataType, DeviceType } from "@huggingface/transformers";
import {
  AutoModelForSequenceClassification,
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  pipeline,
  RawImage,
  Tensor,
} from "@huggingface/transformers";
import type { ImageInput } from "@orb/contracts/role-clients";
import { l2Normalize } from "@orb/kit/vector-math";
import { getLog } from "#foundation/observability";
import { ProviderError } from "../../contract";

// How many distinct models to keep resident PER KIND before evicting + disposing the oldest. A role
// normally pins ONE model (its role default); the headroom absorbs a deliberate model switch without
// reload thrash. Small on purpose — each ONNX session holds native (off-heap) memory.
const MODEL_CACHE_CAP = 4;

// Hand "auto" to transformers.js so IT resolves the platform EP list (CUDA→CPU on linux-x64); the
// load-time CPU fallback below is the backstop if a non-CPU EP fails to initialize at runtime.
const DEFAULT_DEVICE: DeviceType = "auto";
const CPU_DEVICE: DeviceType = "cpu";
// Full precision by default: deterministic vectors (stable cosine self-similarity) and the fp32 ONNX
// file ships for every default model. A caller may down-cast (q8 / fp16) via deps for speed/footprint.
const DEFAULT_DTYPE: DataType = "fp32";

/**
 * The inference seam the role files depend on. Each method returns CLEAN numeric data (no transformers
 * `Tensor` leaks): embeddings are RAW (un-normalized) `Float32Array`s at the model's native dimension —
 * the role files own L2-normalization (one home: `@orb/kit/vector-math`) and MRL truncation. Tests
 * inject a deterministic fake implementing this interface; the real one is {@link createModelCache}.
 */
export interface LocalLightModelCache {
  /** Mean-pooled, RAW (un-normalized) text embeddings — one `Float32Array` per input, native dim. */
  readonly embedTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  /** Raw cross-encoder relevance logits — one score per document, index-aligned to `documents`. */
  readonly scorePairs: (
    modelId: string,
    query: string,
    documents: readonly string[],
  ) => Promise<number[]>;
  /** RAW CLIP image-projection embeddings (joint space) — one `Float32Array` per image. */
  readonly embedImages: (modelId: string, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  /** RAW CLIP text-projection embeddings (joint space) — one `Float32Array` per input. */
  readonly embedClipTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
}

/** Runtime knobs for the real cache. All optional — `createModelCache()` is a working "any box" default. */
export interface ModelCacheConfig {
  /** ONNX execution device. Default `"auto"` → CUDA-when-present, else CPU (with a load-time fallback). */
  readonly device?: DeviceType | undefined;
  /** Weight precision. Default `"fp32"` (deterministic + universally shipped). */
  readonly dtype?: DataType | undefined;
  /** Where transformers.js caches downloaded weights. Default is the library's `./.cache`. */
  readonly cacheDir?: string | undefined;
  /** When `false`, only local (already-cached) weights load — offline mode. Default: library default (true). */
  readonly allowRemoteModels?: boolean | undefined;
}

// --- shared request helpers (the slice's one home — see header) --------------

/** Use the resolved request model id, or the role's default when the request carried no model. */
export function resolveModelId(requested: string, fallback: string): string {
  return requested.trim().length > 0 ? requested : fallback;
}

/** L2-normalize into an OWNED, ArrayBuffer-backed vector — the result-contract vector type
 *  (`z.instanceof(Float32Array)` → `Float32Array<ArrayBuffer>`). `l2Normalize` allocates a fresh
 *  `new Float32Array(dim)` (genuinely ArrayBuffer-backed) but its kit signature widens the buffer type
 *  to `ArrayBufferLike`; this re-narrows to the true runtime type so producers match the contract. */
export function normalizeVector(v: Float32Array): Float32Array<ArrayBuffer> {
  return l2Normalize(v) as Float32Array<ArrayBuffer>;
}

/** Fail-fast on a cancelled request. In-process ONNX inference can't be interrupted mid-run, so we
 *  check at the role boundaries (before load + after each heavy step) and throw a typed `aborted`. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ProviderError({
      kind: "aborted",
      retryable: false,
      message: "local-light request aborted",
    });
  }
}

// --- internal helpers --------------------------------------------------------

/** Split a 2-D (or 1-D) tensor into one `Float32Array` per row along the LAST dimension. The model
 *  output is fp32 (default dtype), so `data` is numeric; we copy into owned `Float32Array`s so callers
 *  can store/normalize without aliasing the tensor's backing buffer. */
function tensorRows(t: Tensor): Float32Array[] {
  const { dims } = t;
  const lastDim = dims.at(-1) ?? 0;
  if (lastDim === 0) {
    return [];
  }
  const flat = t.data as ArrayLike<number>;
  const rows: Float32Array[] = [];
  for (let base = 0; base + lastDim <= flat.length; base += lastDim) {
    const row = new Float32Array(lastDim);
    for (let d = 0; d < lastDim; d += 1) {
      row[d] = flat[base + d] ?? 0;
    }
    rows.push(row);
  }
  return rows;
}

/** Pull a named output tensor off a model result, or fail loud — a model variant that doesn't emit the
 *  expected head (e.g. `image_embeds` / `logits`) is a wiring error, not a silent empty result. */
function requireTensor(out: Record<string, unknown>, key: string, modelId: string): Tensor {
  const value = out[key];
  if (!(value instanceof Tensor)) {
    throw new ProviderError({
      kind: "server",
      retryable: false,
      message: `local-light model "${modelId}" produced no "${key}" output tensor`,
    });
  }
  return value;
}

/** transformers.js `RawImage.read` accepts a path/URL string or a `Blob`; wrap raw bytes in a `Blob`. */
function toImageSource(image: ImageInput): string | Blob {
  return typeof image === "string" ? image : new Blob([image]);
}

/** Try `build(device)`; on failure with a non-CPU device, warn and retry once on CPU — the GPU-less
 *  backstop so the in-process tier always works (a missing/broken CUDA EP must not brick embeddings). */
async function loadWithCpuFallback<T>(
  device: DeviceType,
  build: (device: DeviceType) => Promise<T>,
): Promise<T> {
  try {
    return await build(device);
  } catch (err) {
    if (device === CPU_DEVICE) {
      throw err;
    }
    getLog().warn(
      { err: String(err), device },
      "local-light: model load failed on device; retrying on cpu",
    );
    return await build(CPU_DEVICE);
  }
}

/** Bounded, promise-memoized loader for one model kind. Stores the in-flight promise (concurrent first
 *  calls share one load); evicts + disposes the oldest entry past the cap (insertion-order Map). */
function createMemo<T>(
  load: (id: string) => Promise<T>,
  dispose: (value: T) => void,
): (id: string) => Promise<T> {
  const entries = new Map<string, Promise<T>>();
  return (id) => {
    const existing = entries.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const created = load(id);
    entries.set(id, created);
    if (entries.size > MODEL_CACHE_CAP) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        const evicted = entries.get(oldest);
        entries.delete(oldest);
        if (evicted !== undefined) {
          void evicted.then(dispose).catch(() => undefined);
        }
      }
    }
    return created;
  };
}

// --- the real cache ----------------------------------------------------------

/**
 * Build the real transformers.js/ONNX model cache. Configures the process-global transformers `env`
 * from `config` once, then returns memoized, device-fallback-guarded loaders bound into the
 * {@link LocalLightModelCache} run methods.
 */
export function createModelCache(config: ModelCacheConfig = {}): LocalLightModelCache {
  const device = config.device ?? DEFAULT_DEVICE;
  const dtype = config.dtype ?? DEFAULT_DTYPE;

  if (config.allowRemoteModels !== undefined) {
    env.allowRemoteModels = config.allowRemoteModels;
  }
  if (config.cacheDir !== undefined) {
    env.cacheDir = config.cacheDir;
  }

  const embedder = createMemo(
    (id) =>
      loadWithCpuFallback(device, (dev) =>
        pipeline("feature-extraction", id, { device: dev, dtype }),
      ),
    (p) => {
      void p.dispose();
    },
  );
  const reranker = createMemo(
    (id) =>
      loadWithCpuFallback(device, (dev) =>
        AutoModelForSequenceClassification.from_pretrained(id, { device: dev, dtype }),
      ),
    (m) => {
      void m.dispose();
    },
  );
  const clipText = createMemo(
    (id) =>
      loadWithCpuFallback(device, (dev) =>
        CLIPTextModelWithProjection.from_pretrained(id, { device: dev, dtype }),
      ),
    (m) => {
      void m.dispose();
    },
  );
  const clipVision = createMemo(
    (id) =>
      loadWithCpuFallback(device, (dev) =>
        CLIPVisionModelWithProjection.from_pretrained(id, { device: dev, dtype }),
      ),
    (m) => {
      void m.dispose();
    },
  );
  // Tokenizers + processors are CPU-only preprocessing (no ONNX EP), so no device/fallback needed.
  const tokenizer = createMemo(
    (id) => AutoTokenizer.from_pretrained(id),
    () => undefined,
  );
  const processor = createMemo(
    (id) => AutoProcessor.from_pretrained(id),
    () => undefined,
  );

  return {
    async embedTexts(modelId, texts): Promise<Float32Array[]> {
      if (texts.length === 0) {
        return [];
      }
      const extractor = await embedder(modelId);
      // RAW pooled vectors (normalize:false) — the embed role L2-normalizes after any MRL truncation.
      const output = await extractor([...texts], { pooling: "mean", normalize: false });
      return tensorRows(output);
    },

    async scorePairs(modelId, query, documents): Promise<number[]> {
      if (documents.length === 0) {
        return [];
      }
      const [tok, model] = await Promise.all([tokenizer(modelId), reranker(modelId)]);
      // One forward over all (query, doc) pairs — rerank shortlists are small (a retrieval top-K), so
      // a single batch is right-sized; the caller bounds candidate count upstream.
      const queries = documents.map(() => query);
      const inputs = tok(queries, { text_pair: [...documents], padding: true, truncation: true });
      const out = (await model(inputs)) as Record<string, unknown>;
      // Cross-encoder relevance = the single-label logit, or the positive class of a 2-label head (last
      // index). Raw monotonic logit — the embed-space invariant: scores are never normalized here.
      return tensorRows(requireTensor(out, "logits", modelId)).map((row) => row.at(-1) ?? 0);
    },

    async embedImages(modelId, images): Promise<Float32Array[]> {
      if (images.length === 0) {
        return [];
      }
      const [proc, model] = await Promise.all([processor(modelId), clipVision(modelId)]);
      const raws = await Promise.all(images.map((image) => RawImage.read(toImageSource(image))));
      const inputs = await proc(raws);
      const out = (await model(inputs)) as Record<string, unknown>;
      return tensorRows(requireTensor(out, "image_embeds", modelId));
    },

    async embedClipTexts(modelId, texts): Promise<Float32Array[]> {
      if (texts.length === 0) {
        return [];
      }
      const [tok, model] = await Promise.all([tokenizer(modelId), clipText(modelId)]);
      const inputs = tok([...texts], { padding: true, truncation: true });
      const out = (await model(inputs)) as Record<string, unknown>;
      return tensorRows(requireTensor(out, "text_embeds", modelId));
    },
  };
}
