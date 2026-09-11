// Lazy, memoized transformers.js/ONNX model loader + inference seam — the sole home for the
// @huggingface/transformers coupling, so the role files stay pure transforms and are unit-testable.
// Default embedder is jinaai/jina-clip-v2, one model whose text + image encoders share a 1024-dim joint
// space; one load serves both the embed and imageEmbed roles.

import { randomUUID } from "node:crypto";
import process from "node:process";
import type { DataType, DeviceType, Tensor } from "@huggingface/transformers";
import type { ImageInput } from "@orb/contracts/role-clients";
import { l2Normalize } from "@orb/kit/vector-math";
import { getLog, superviseDetached } from "#foundation/observability";
import { ProviderError } from "../../contract/index.ts";

// Small on purpose — each ONNX session holds native (off-heap) memory; the headroom just absorbs a deliberate model switch.
const MODEL_CACHE_CAP = 4;

type TransformersModule = typeof import("@huggingface/transformers");

// THE IMPORT IS DYNAMIC ON PURPOSE — this file's whole reason to exist is being the SOLE home of the
// @huggingface/transformers coupling, and a STATIC import made that containment a lie at module-graph level:
// `@huggingface/transformers` pulls `onnxruntime-node`, whose NAPI binding loads at import time, so merely
// importing anything that transitively reached this file paid a native-addon load. Measured cost of the eager
// spelling (2026-08-14): under a worker-thread pool 85 test files died on `Module did not self-register:
// onnxruntime_binding.node` — the entire infra/providers tree, all of domain/preset, entry/compose, entry/boot,
// chat engine + verbs — because a non-context-aware addon cannot load off the main thread. That is what kept
// the Stryker mutation gate from ever booting (its runner hardcodes `pool:'threads'`). Deferring the import to
// first model load keeps the header's "lazy, memoized" promise honest at the MODULE level too, and costs
// nothing: every consumer of this seam is already async. Keep it dynamic; a static import here is a regression.
let transformersPromise: Promise<TransformersModule> | undefined;

function loadTransformers(): Promise<TransformersModule> {
  transformersPromise ??= import("@huggingface/transformers");
  return transformersPromise;
}

const DEFAULT_DEVICE: DeviceType = "auto";
const CPU_DEVICE: DeviceType = "cpu";
const DEFAULT_DTYPE: DataType = "fp32";

/** The inference seam the role files depend on. Each method returns clean numeric data (no transformers
 *  Tensor leaks) — raw un-normalized Float32Arrays; role files own L2-normalization and MRL truncation. */
export interface LocalLightModelCache {
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly embedTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly scorePairs: (modelId: string, query: string, documents: readonly string[]) => Promise<number[]>;
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly embedImages: (modelId: string, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly embedClipTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  /** Alpha-matte an image via a `background-removal` segmentation model (RMBG-1.4 default; expressions-design/
   *  03 §4.1). Returns PNG bytes with the background driven to alpha-0. The whole transformers.js coupling
   *  (pipeline load + `putAlpha` composite + PNG encode) stays HERE — the role file (`matte.ts`) is a thin
   *  model-id/abort wrapper, mirroring the rerank/embed split. */
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly removeBackground: (modelId: string, image: ImageInput) => Promise<Uint8Array>;
}

export interface ModelCacheConfig {
  readonly device?: DeviceType | undefined;
  readonly dtype?: DataType | undefined;
  readonly cacheDir?: string | undefined;
  readonly allowRemoteModels?: boolean | undefined;
}

export function resolveModelId(requested: string, fallback: string): string {
  return requested.trim().length > 0 ? requested : fallback;
}

// l2Normalize's kit signature widens the buffer type to ArrayBufferLike; re-narrow to the true runtime type.
export function normalizeVector(v: Float32Array): Float32Array<ArrayBuffer> {
  return l2Normalize(v) as Float32Array<ArrayBuffer>;
}

// In-process ONNX inference can't be interrupted mid-run, so we check at role boundaries instead.
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ProviderError({
      kind: "aborted",
      retryable: false,
      message: "local-light request aborted",
    });
  }
}

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

// @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
// `Tensor` arrives as a PARAMETER, not a module binding: the class is only reachable after the dynamic
// import resolves, and every caller already holds the resolved module.
function requireTensor(out: Record<string, unknown>, key: string, modelId: string, TensorCtor: TransformersModule["Tensor"]): Tensor {
  const value = out[key];
  if (!(value instanceof TensorCtor)) {
    throw new ProviderError({
      kind: "server",
      retryable: false,
      message: `local-light model "${modelId}" produced no "${key}" output tensor`,
    });
  }
  return value;
}

// Uint8Array.from re-allocates onto a plain ArrayBuffer — the DOM lib's BlobPart rejects a SharedArrayBuffer-backed view.
function toImageSource(image: ImageInput): string | Blob {
  return typeof image === "string" ? image : new Blob([Uint8Array.from(image)]);
}

// @huggingface/transformers's getSession() can leave a detached loader promise that rejects unhandled
// (fatal in production) when a model file is missing — we can't patch the lib, so a scoped
// unhandledRejection listener (installed only while a load is in flight) converts that specific escape
// into a normal rejection of this load and re-raises anything else.
const TRANSFORMERS_LOADER_FRAMES = ["getModelFile", "getCoreModelFile", "loadResourceFile"];

// Matched on stack lib path + loader frame, not a brittle message string, so a future lib message tweak still classifies.
function isTransformersLoaderEscape(err: unknown): boolean {
  if (!(err instanceof Error) || typeof err.stack !== "string") {
    return false;
  }
  const { stack } = err;
  return stack.includes("@huggingface/transformers") && TRANSFORMERS_LOADER_FRAMES.some((frame) => stack.includes(frame));
}

// Installed lazily and kept for the process lifetime — a single hung getSession can emit multiple
// detached orphans across microtask turns, some after this load's promise already settled.
// ASSUMES(single-replica): these are live in-process promise `reject` closures tied to THIS process's
// in-flight `@huggingface/transformers` load calls — they cannot be DB-backed (a closure is not
// serializable data), and a replica restart legitimately drops them along with the loads they guard.
const inFlightLoadRejectors: ((err: Error) => void)[] = [];
let beltInstalled = false;

function onBeltRejection(err: unknown): void {
  if (isTransformersLoaderEscape(err)) {
    // FIFO: one orphan = one hung getSession; stragglers past that are the same benign lib orphan.
    inFlightLoadRejectors.shift()?.(err instanceof Error ? err : new Error(String(err)));
    return;
  }
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

async function ownModelLoad<T>(load: () => Promise<T>): Promise<T> {
  const { promise: orphanGuard, reject: rejectOrphan } = Promise.withResolvers<never>();
  const cleanup = registerBeltLoad(rejectOrphan);
  try {
    return await Promise.race([load(), orphanGuard]);
  } finally {
    cleanup();
  }
}

// On failure with a non-CPU device, retry once on CPU so a missing/broken CUDA EP never bricks embeddings.
async function loadWithCpuFallback<T>(device: DeviceType, build: (device: DeviceType) => Promise<T>): Promise<T> {
  try {
    return await ownModelLoad(() => build(device));
  } catch (err) {
    if (device === CPU_DEVICE) {
      throw err;
    }
    getLog().warn({ err: String(err), device }, "local-light: model load failed on device; retrying on cpu");
    return await ownModelLoad(() => build(CPU_DEVICE));
  }
}

/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
interface MemoEntry<T> {
  readonly promise: Promise<T>;
  refs: number;
  evictionPending: boolean;
  disposed: boolean;
}

interface ModelMemo<T> {
  (id: string): Promise<T>;
  withLease: <R>(id: string, use: (value: T) => Promise<R>) => Promise<R>;
}

/** The lease-counted single-flight memo every model slot below is built from.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function createMemo<T>(load: (id: string) => Promise<T>, dispose: (value: T) => void): ModelMemo<T> {
  const entries = new Map<string, MemoEntry<T>>();
  const disposeEntry = (entry: MemoEntry<T>): void => {
    if (entry.disposed || !entry.evictionPending || entry.refs > 0) {
      return;
    }
    entry.disposed = true;
    // @swallowed-ok(promise): disposal has no request result; a failure only costs RAM until exit. Ends if disposal gains a caller-visible result.
    // @orb-waive caught-failure-ownership(entry.promise): disposal has no request result; a failure only costs RAM until exit. Ends if disposal gains a caller-visible result.
    void entry.promise.then(dispose).catch(() => undefined);
  };
  const getEntry = (id: string): MemoEntry<T> => {
    const existing = entries.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const created = load(id);
    const entry: MemoEntry<T> = { promise: created, refs: 0, evictionPending: false, disposed: false };
    entries.set(id, entry);
    // The memo caches the RESOLVED model, never a rejection: a load failure is recoverable, so a
    // rejected entry evicts itself once settled instead of poisoning the model for the process lifetime.
    // @orb-waive caught-failure-ownership(created): this .catch is eviction bookkeeping only — a rejected load removes its own cache entry so it never poisons the model; the rejection is still delivered to every caller who awaits memo(id)'s promise, so nothing is swallowed. Ends if callers stop receiving the entry promise.
    void created.catch(() => {
      if (entries.get(id) === entry) {
        entries.delete(id);
      }
    });
    if (entries.size > MODEL_CACHE_CAP) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        const evicted = entries.get(oldest);
        entries.delete(oldest);
        if (evicted !== undefined) {
          evicted.evictionPending = true;
          disposeEntry(evicted);
        }
      }
    }
    return entry;
  };
  const memo = ((id: string): Promise<T> => getEntry(id).promise) as ModelMemo<T>;
  memo.withLease = async <R>(id: string, use: (value: T) => Promise<R>): Promise<R> => {
    const entry = getEntry(id);
    entry.refs += 1;
    try {
      return await use(await entry.promise);
    } finally {
      entry.refs -= 1;
      disposeEntry(entry);
    }
  };
  return memo;
}

export function createModelCache(config: ModelCacheConfig = {}): LocalLightModelCache {
  const device = config.device ?? DEFAULT_DEVICE;
  const dtype = config.dtype ?? DEFAULT_DTYPE;

  // The `env` writes used to run HERE, at construction — which is precisely what forced the eager import.
  // They now run once, on this cache's first model load, still before any `from_pretrained`: same ordering
  // guarantee (env is configured before the lib reads it), no import cost for a cache nobody ever uses.
  let configured = false;
  const transformers = async (): Promise<TransformersModule> => {
    const mod = await loadTransformers();
    if (!configured) {
      configured = true;
      if (config.allowRemoteModels !== undefined) {
        mod.env.allowRemoteModels = config.allowRemoteModels;
      }
      if (config.cacheDir !== undefined) {
        mod.env.cacheDir = config.cacheDir;
      }
    }
    return mod;
  };

  const jinaEmbedder = createMemo(
    async (id) => {
      const { AutoModel } = await transformers();
      return await loadWithCpuFallback(device, (dev) => AutoModel.from_pretrained(id, { device: dev, dtype }));
    },
    (m) => {
      superviseDetached(`local-light:dispose:jina:${randomUUID()}`, "local-light.model.dispose", { modelKind: "jina" }, () => m.dispose());
    },
  );
  const reranker = createMemo(
    async (id) => {
      const { AutoModelForSequenceClassification } = await transformers();
      return await loadWithCpuFallback(device, (dev) => AutoModelForSequenceClassification.from_pretrained(id, { device: dev, dtype }));
    },
    (m) => {
      superviseDetached(`local-light:dispose:reranker:${randomUUID()}`, "local-light.model.dispose", { modelKind: "reranker" }, () => m.dispose());
    },
  );
  const tokenizer = createMemo(
    async (id) => {
      const { AutoTokenizer } = await transformers();
      return await AutoTokenizer.from_pretrained(id);
    },
    () => undefined,
  );
  const processor = createMemo(
    async (id) => {
      const { AutoProcessor } = await transformers();
      return await AutoProcessor.from_pretrained(id);
    },
    () => undefined,
  );
  // The background-removal segmentation pipeline (RMBG-1.4 by default) — a SEPARATE lazy model from the
  // embed/rerank sessions, loaded through the same device/dtype/CPU-fallback mechanics + LRU cap.
  const bgRemover = createMemo(
    async (id) => {
      const { pipeline } = await transformers();
      return await loadWithCpuFallback(device, (dev) => pipeline("background-removal", id, { device: dev, dtype }));
    },
    (p) => {
      superviseDetached(`local-light:dispose:background-removal:${randomUUID()}`, "local-light.model.dispose", { modelKind: "background-removal" }, () =>
        p.dispose(),
      );
    },
  );

  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  const embedJinaTexts = async (modelId: string, texts: readonly string[]): Promise<Float32Array[]> =>
    processor.withLease(modelId, (proc) =>
      jinaEmbedder.withLease(modelId, async (model) => {
        const { Tensor: TensorCtor } = await transformers();
        const inputs = await proc([...texts], null, { padding: true, truncation: true });
        const out = (await model(inputs)) as Record<string, unknown>;
        return tensorRows(requireTensor(out, "text_embeddings", modelId, TensorCtor));
      }),
    );

  return {
    embedTexts(modelId, texts): Promise<Float32Array[]> {
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
    },

    async scorePairs(modelId, query, documents): Promise<number[]> {
      if (documents.length === 0) {
        return [];
      }
      return await tokenizer.withLease(modelId, (tok) =>
        reranker.withLease(modelId, async (model) => {
          const { Tensor: TensorCtor } = await transformers();
          const queries = documents.map(() => query);
          const inputs = tok(queries, { text_pair: [...documents], padding: true, truncation: true });
          const out = (await model(inputs)) as Record<string, unknown>;
          return tensorRows(requireTensor(out, "logits", modelId, TensorCtor)).map((row) => row.at(-1) ?? 0);
        }),
      );
    },

    async embedImages(modelId, images): Promise<Float32Array[]> {
      if (images.length === 0) {
        return [];
      }
      return await processor.withLease(modelId, (proc) =>
        jinaEmbedder.withLease(modelId, async (model) => {
          const { RawImage, Tensor: TensorCtor } = await transformers();
          const raws = await Promise.all(images.map((image) => RawImage.read(toImageSource(image))));
          const inputs = await proc(null, raws);
          const out = (await model(inputs)) as Record<string, unknown>;
          return tensorRows(requireTensor(out, "image_embeddings", modelId, TensorCtor));
        }),
      );
    },

    embedClipTexts(modelId, texts): Promise<Float32Array[]> {
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
    },

    async removeBackground(modelId, image): Promise<Uint8Array> {
      // Single ImageInput → a single alpha-matted RawImage (the pipeline clones the input and applies the
      // segmentation mask as alpha). `toSharp()` gives us the PNG encoder without leaking a RawImage upward.
      return await bgRemover.withLease(modelId, async (segmenter) => {
        const matted = await segmenter(toImageSource(image));
        const buf = await matted.toSharp().png().toBuffer();
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      });
    },
  };
}
