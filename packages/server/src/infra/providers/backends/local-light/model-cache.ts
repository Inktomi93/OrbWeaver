// infra/providers/backends/local-light/model-cache — the lazy, memoized transformers.js/ONNX model
// loader + the inference seam. THE single home for the `@huggingface/transformers` coupling: every raw
// model / tokenizer / processor load + run lives here, so the role files (embed/rerank/image-embed)
// stay pure transforms over `Float32Array`/`number` and are unit-testable with an injected fake cache
// (no network, no ONNX session). Load-once-reuse: a model loads on first use and is memoized (bounded —
// see MODEL_CACHE_CAP); concurrent first calls share the one in-flight load promise (the map stores the
// promise, not the resolved model).
//
// THE EMBED SPACE (decided 2026-06-28): the default text+image embedder is the ONE multimodal model
// `jinaai/jina-clip-v2` (AutoModel → JinaCLIPModel) — a single model with a text encoder AND an image
// encoder trained into the SAME 1024-dim joint space (text↔image cosine-comparable). It mirrors, on
// CPU, vLLM's "one Qwen3-VL serves both embed + imageEmbed" design and fits the `F32_BLOB(1024)` column
// (domains/memory.md §1). One load serves BOTH roles: text features back the embed role, image
// features back the imageEmbed role. (rerank stays a separate text-only cross-encoder — dim-agnostic.)
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

import process from "node:process";
import type { DataType, DeviceType } from "@huggingface/transformers";
import {
  AutoModel,
  AutoModelForSequenceClassification,
  AutoProcessor,
  AutoTokenizer,
  env,
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
  /** RAW (un-normalized) text embeddings from the unified jina-clip text encoder — one `Float32Array`
   *  per input, native 1024 dim. Same encoder as {@link embedClipTexts} (one model, one joint space). */
  readonly embedTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  /** Raw cross-encoder relevance logits — one score per document, index-aligned to `documents`. */
  readonly scorePairs: (
    modelId: string,
    query: string,
    documents: readonly string[],
  ) => Promise<number[]>;
  /** RAW image embeddings from the unified jina-clip image encoder — the SAME 1024 joint space as the
   *  text side (image↔text cosine-comparable) — one `Float32Array` per image. */
  readonly embedImages: (modelId: string, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  /** RAW jina-clip TEXT embeddings into the joint image/text space — one `Float32Array` per input.
   *  Identical encoder to {@link embedTexts}; a distinct seam method for the imageEmbed role caller. */
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

/** transformers.js `RawImage.read` accepts a path/URL string or a `Blob`; wrap raw bytes in a `Blob`.
 *  `Uint8Array.from` re-allocates onto a plain `ArrayBuffer` — the DOM lib's `BlobPart` rejects a
 *  `SharedArrayBuffer`-backed view, and this file is type-traversed under the client's DOM libs too
 *  (a type-only AppRouter chain), so the copy keeps both lib worlds green. */
function toImageSource(image: ImageInput): string | Blob {
  return typeof image === "string" ? image : new Blob([Uint8Array.from(image)]);
}

// ── lib-boundary belt: @huggingface/transformers 4.2.0 model-loader escape ──────────────────────────────
// Their `getSession()` (transformers.node.mjs ~22414) spawns `getCoreModelFile(...)` WITHOUT awaiting it, then
// `await getModelDataFiles(...)` — and `getModelDataFiles` fetches ONNX external-data via
// `new Promise(async (resolve, reject) => { await getModelFile(...) })`, an async executor whose rejection
// never calls `reject`, so the outer promise HANGS forever → `getSession` hangs → the un-awaited
// `getCoreModelFile` promise is orphaned. When a model file is missing (un-fetched / partial cache / offline)
// that orphan REJECTS UNHANDLED, and with no process listener (production) an unhandled rejection is FATAL —
// and OUR `await from_pretrained` never sees it (getSession is still hung), so an ordinary try/catch cannot
// reach it (confirmed: the process dies before the awaiting catch runs). We cannot patch the lib, so we OWN
// the escape at our ONE call boundary into it: while a load runs, a scoped `unhandledRejection` listener turns
// a transformers model-loader escape into a proper rejection of THIS load (loadWithCpuFallback + the store
// then see a normal typed failure) and RE-RAISES anything it can't attribute. This is neither a
// lifetime-global handler nor a swallow-all — the listener exists only while a model load is in flight and
// only intercepts the lib's own loader frames.
const TRANSFORMERS_LOADER_FRAMES = ["getModelFile", "getCoreModelFile", "loadResourceFile"];

/** True for an escape thrown from the transformers.js model-file loader (both the offline
 *  `local_files_only`/`allowRemoteModels=false` message and the remote "Unable to get model file path or
 *  buffer" message originate there) — matched on the stack's lib path + a loader frame, not a brittle
 *  message string, so a future lib message tweak still classifies. */
function isTransformersLoaderEscape(err: unknown): boolean {
  if (!(err instanceof Error) || typeof err.stack !== "string") {
    return false;
  }
  const { stack } = err;
  return (
    stack.includes("@huggingface/transformers") &&
    TRANSFORMERS_LOADER_FRAMES.some((frame) => stack.includes(frame))
  );
}

// The belt listener is installed LAZILY on the first model load and then kept for the process lifetime. This
// is deliberate, NOT a lifetime swallow-all: a SINGLE hung `getSession` emits MULTIPLE detached orphans (the
// core `model.onnx` PLUS each missing `model.onnx_data` external-data chunk), and they fire at different
// microtask turns — some AFTER our load's promise has already settled (verified: a scoped listener that
// uninstalls when its load ends still crashes on the straggler). "Own everything the lib call can emit"
// therefore requires coverage that outlives any one load. The handler absorbs ONLY transformers model-loader
// orphans (a class NOTHING but this module can produce — we are the lib's sole caller) and RE-RAISES every
// other rejection, so an unrelated future escape still crashes exactly as Node's default would (no masking).
const inFlightLoadRejectors: ((err: Error) => void)[] = [];
let beltInstalled = false;

function onBeltRejection(err: unknown): void {
  if (isTransformersLoaderEscape(err)) {
    // Fail the oldest still-awaiting load (one orphan ⇒ one hung getSession; FIFO is exact for the realistic
    // single-load case). Stragglers past that (extra chunk orphans, or a load already failed) are absorbed —
    // they are the SAME benign lib orphan, never an unrelated bug.
    inFlightLoadRejectors.shift()?.(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  // Anything that is NOT a transformers loader orphan is re-raised, restoring Node's default fatal behavior
  // (a listener's mere presence would otherwise suppress the crash and hide the unrelated escape).
  throw err;
}

function registerBeltLoad(reject: (err: Error) => void): () => void {
  inFlightLoadRejectors.push(reject);
  if (!beltInstalled) {
    beltInstalled = true;
    process.on("unhandledRejection", onBeltRejection);
  }
  return (): void => {
    const idx = inFlightLoadRejectors.indexOf(reject);
    if (idx >= 0) {
      inFlightLoadRejectors.splice(idx, 1);
    }
  };
}

/** Run one transformers.js model load under the lib-boundary belt (see the note above): the lib's detached
 *  loader orphan is converted into a rejection of THIS load instead of a fatal unhandled rejection. */
async function ownModelLoad<T>(load: () => Promise<T>): Promise<T> {
  let rejectOrphan: (err: Error) => void = () => undefined;
  const orphanGuard = new Promise<never>((_, reject) => {
    rejectOrphan = reject;
  });
  const cleanup = registerBeltLoad(rejectOrphan);
  try {
    // The hung `load()` promise (a leaked lib orphan) never settles; `orphanGuard` wins and we degrade cleanly.
    return await Promise.race([load(), orphanGuard]);
  } finally {
    cleanup();
  }
}

/** Try `build(device)`; on failure with a non-CPU device, warn and retry once on CPU — the GPU-less
 *  backstop so the in-process tier always works (a missing/broken CUDA EP must not brick embeddings). Both
 *  attempts run under {@link ownModelLoad} so a transformers loader orphan degrades to a caught failure. */
async function loadWithCpuFallback<T>(
  device: DeviceType,
  build: (device: DeviceType) => Promise<T>,
): Promise<T> {
  try {
    return await ownModelLoad(() => build(device));
  } catch (err) {
    if (device === CPU_DEVICE) {
      throw err;
    }
    getLog().warn(
      { err: String(err), device },
      "local-light: model load failed on device; retrying on cpu",
    );
    return await ownModelLoad(() => build(CPU_DEVICE));
  }
}

/** Bounded, promise-memoized loader for one model kind. Stores the in-flight promise (concurrent first
 *  calls share one load); evicts + disposes the oldest entry past the cap (insertion-order Map). */
export function createMemo<T>(
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
    // The memo caches the RESOLVED model, never a rejection: a transformers.js load failure (an
    // un-fetched/partial model, an offline box, a transient network fault) is RECOVERABLE, so a rejected
    // entry is evicted once it settles — the next embed/rerank trigger retries the load instead of the
    // first failure poisoning the model for the whole process lifetime. The `=== created` guard leaves a
    // newer in-flight load untouched. (This `.catch` also owns the memoized promise's rejection; the role
    // helpers that read it already await it, so it can never mask a caller's failure.)
    void created.catch(() => {
      if (entries.get(id) === created) {
        entries.delete(id);
      }
    });
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

  // The unified multimodal embedder (AutoModel → JinaCLIPModel for a jina-clip id): ONE model, two
  // encoders into ONE 1024-dim joint space. One load serves BOTH the embed role (text features) and the
  // imageEmbed role (image features) — mirroring vLLM's "one Qwen3-VL serves both" on CPU.
  const jinaEmbedder = createMemo(
    (id) =>
      loadWithCpuFallback(device, (dev) => AutoModel.from_pretrained(id, { device: dev, dtype })),
    (m) => {
      void m.dispose();
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
  // Tokenizers + processors are CPU-only preprocessing (no ONNX EP), so no device/fallback needed. The
  // tokenizer serves rerank (the text-only cross-encoder); the processor (a JinaCLIPProcessor for a
  // jina-clip id) tokenizes text AND preprocesses images for the unified embedder.
  const tokenizer = createMemo(
    (id) => AutoTokenizer.from_pretrained(id),
    () => undefined,
  );
  const processor = createMemo(
    (id) => AutoProcessor.from_pretrained(id),
    () => undefined,
  );

  // Run the unified jina-clip TEXT encoder → RAW (un-normalized) 1024-dim `text_embeddings`. Both the
  // embed role and the imageEmbed text side share this ONE encoder (one model, one joint space). A
  // text-only call passes no images; JinaCLIPModel fills a zero-sized dummy image tensor and returns
  // only the text head.
  const embedJinaTexts = async (
    modelId: string,
    texts: readonly string[],
  ): Promise<Float32Array[]> => {
    const [proc, model] = await Promise.all([processor(modelId), jinaEmbedder(modelId)]);
    const inputs = await proc([...texts], null, { padding: true, truncation: true });
    const out = (await model(inputs)) as Record<string, unknown>;
    return tensorRows(requireTensor(out, "text_embeddings", modelId));
  };

  return {
    embedTexts(modelId, texts): Promise<Float32Array[]> {
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
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
      const [proc, model] = await Promise.all([processor(modelId), jinaEmbedder(modelId)]);
      const raws = await Promise.all(images.map((image) => RawImage.read(toImageSource(image))));
      // Image-only call (no text): the processor preprocesses pixels; JinaCLIPModel fills a zero-sized
      // dummy text tensor and returns only the image head — the SAME 1024 joint space as the text side.
      const inputs = await proc(null, raws);
      const out = (await model(inputs)) as Record<string, unknown>;
      return tensorRows(requireTensor(out, "image_embeddings", modelId));
    },

    embedClipTexts(modelId, texts): Promise<Float32Array[]> {
      // Identical encoder to embedTexts — the imageEmbed text side embeds into the joint space via the
      // SAME jina-clip text head (text↔image comparable).
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
    },
  };
}
