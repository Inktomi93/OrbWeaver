// Lazy, memoized transformers.js/ONNX model loader + inference seam — the SOLE home of the
// `@huggingface/transformers` coupling, so the task files stay pure transforms. Default embedder is
// jinaai/jina-clip-v2, one model whose text + image encoders share a 1024-dim joint space.
//
// THE IMPORT IS DYNAMIC ON PURPOSE: `@huggingface/transformers` pulls `onnxruntime-node`, whose NAPI binding
// loads at import time and cannot load off the main thread (a worker-thread test pool died 85 files deep on
// `Module did not self-register`). Deferring to first model load keeps "lazy" honest at the module level.

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import type { DataType, DeviceType, Tensor } from "@huggingface/transformers";
import { embedSpaceOf } from "@orb/contracts/inference";
import type { ImageInput } from "@orb/contracts/role-clients";
import { l2Normalize } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/errors.ts";
import type { InferenceLog } from "../../deps.ts";

// Small on purpose — each ONNX session holds native (off-heap) memory.
const MODEL_CACHE_CAP = 4;

type TransformersModule = typeof import("@huggingface/transformers");

let transformersPromise: Promise<TransformersModule> | undefined;
function loadTransformers(): Promise<TransformersModule> {
  transformersPromise ??= import("@huggingface/transformers");
  return transformersPromise;
}

const DEFAULT_DEVICE: DeviceType = "auto";
const CPU_DEVICE: DeviceType = "cpu";
const DEFAULT_DTYPE: DataType = "fp32";
/** The encoder's own dtype axis (#2417): the ENCODER is quantized (fp32 is 3.455 GB; q8 874 MB); rerank/matte
 *  are small enough that their fp32 weights cost nothing worth trading accuracy for. */
const DEFAULT_EMBED_DTYPE: DataType = "q8";
const DEVICE_TYPES: readonly DeviceType[] = ["auto", "gpu", "cpu", "wasm", "webgpu", "cuda", "dml", "webnn", "webnn-npu", "webnn-gpu", "webnn-cpu"];
const DATA_TYPES: readonly DataType[] = ["auto", "fp32", "fp16", "q8", "int8", "uint8", "q4", "bnb4", "q4f16"];

/** Narrow a configured string onto the lib's own vocabulary — the two vocabularies are checked HERE, the one
 *  file that may import the lib's types. */
function resolveDevice(configured: string | undefined): DeviceType {
  return DEVICE_TYPES.find((candidate) => candidate === configured) ?? DEFAULT_DEVICE;
}

export function resolveEmbedDtype(configured: string | undefined): DataType {
  return DATA_TYPES.find((candidate) => candidate === configured) ?? DEFAULT_EMBED_DTYPE;
}

/** This backend's SERVED space tag — the deployment's resolved dtype folded through the ONE shared
 *  derivation (`@orb/contracts/inference` `embedSpaceOf`). It is deliberately not a second spelling of
 *  `${modelId}@${dtype}`: the read side derives the same tag from the owner's resolved capability, and a
 *  private copy here is how the two sides silently drifted apart once already (§10-2). This function
 *  survives only to narrow `DataType` onto the derivation's `string | undefined`. */
export function localLightEmbedSpaceTag(modelId: string, dtype: DataType): string {
  return embedSpaceOf(modelId, dtype);
}

/** The MODEL SLOTS this cache loads, in PREFETCH ORDER — smallest weights first. */
export const LOCAL_LIGHT_MODEL_SLOTS = ["rerank", "embed", "matte"] as const;
export type LocalLightModelSlot = (typeof LOCAL_LIGHT_MODEL_SLOTS)[number];

export interface LocalLightLoadProgress {
  readonly modelId: string;
  readonly loaded: number;
  readonly total: number;
}

interface TransformersProgressInfo {
  readonly status: string;
  readonly name?: string | undefined;
  readonly loaded?: number | undefined;
  readonly total?: number | undefined;
}

function toLoadProgress(info: TransformersProgressInfo): LocalLightLoadProgress | null {
  if (info.status !== "progress_total" || info.name === undefined) {
    return null;
  }
  const loaded = Number.isFinite(info.loaded) ? Math.max(0, info.loaded ?? 0) : 0;
  const total = Number.isFinite(info.total) ? Math.max(0, info.total ?? 0) : 0;
  return { modelId: info.name, loaded, total };
}

/** The inference seam the task files depend on — raw un-normalized vectors; task files own L2 + MRL. */
export interface LocalLightModelCache {
  readonly embedTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  readonly scorePairs: (modelId: string, query: string, documents: readonly string[]) => Promise<number[]>;
  readonly embedImages: (modelId: string, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  readonly embedClipTexts: (modelId: string, texts: readonly string[]) => Promise<Float32Array[]>;
  readonly removeBackground: (modelId: string, image: ImageInput) => Promise<Uint8Array>;
  /** Warm a slot's memos WITHOUT running inference — the prefetch's whole surface. */
  readonly preload: (slot: LocalLightModelSlot, modelId: string) => Promise<void>;
}

export interface ModelCacheConfig {
  readonly device?: string | undefined;
  readonly embedDtype?: string | undefined;
  readonly cacheDir?: string | undefined;
  readonly allowRemoteModels?: boolean | undefined;
  readonly onProgress?: ((progress: LocalLightLoadProgress) => void) | undefined;
  readonly log: InferenceLog;
  /** Owned fire-and-forget for a model disposal. */
  readonly detach: (name: string, fn: () => Promise<void>) => void;
}

export function normalizeVector(v: Float32Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(v.length);
  out.set(l2Normalize(v));
  return out;
}

// In-process ONNX inference can't be interrupted mid-run, so we check at task boundaries instead.
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ProviderError({ kind: "aborted", retryable: false, message: "local-light request aborted" });
  }
}

function tensorRows(t: Tensor): Float32Array[] {
  const lastDim = t.dims.at(-1) ?? 0;
  if (lastDim === 0) {
    return [];
  }
  // The lib's `DataArray` union includes bigint-backed arrays; every model here emits floats, so a bigint
  // tensor is a wrong-model defect, not a case to widen for.
  const flat = t.data;
  if (flat instanceof BigInt64Array || flat instanceof BigUint64Array) {
    throw new ProviderError({
      kind: "server",
      retryable: false,
      message: "local-light: a model produced an integer tensor where float embeddings/logits were expected",
    });
  }
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

function requireTensor(out: Record<string, unknown>, key: string, modelId: string, TensorCtor: TransformersModule["Tensor"]): Tensor {
  const value = out[key];
  if (!(value instanceof TensorCtor)) {
    throw new ProviderError({ kind: "server", retryable: false, message: `local-light model "${modelId}" produced no "${key}" output tensor` });
  }
  return value;
}

function toImageSource(image: ImageInput): string | Blob {
  return typeof image === "string" ? image : new Blob([Uint8Array.from(image)]);
}

// The lib's getSession() can leave a detached loader promise that rejects unhandled when a model file is
// missing — a scoped listener converts that specific escape into a rejection of this load.
const TRANSFORMERS_LOADER_FRAMES = ["getModelFile", "getCoreModelFile", "loadResourceFile"];

function isTransformersLoaderEscape(err: unknown): boolean {
  if (!(err instanceof Error) || typeof err.stack !== "string") {
    return false;
  }
  const { stack } = err;
  return stack.includes("@huggingface/transformers") && TRANSFORMERS_LOADER_FRAMES.some((frame) => stack.includes(frame));
}

// ASSUMES(single-replica): live in-process promise rejectors tied to THIS process's in-flight loads.
const inFlightLoadRejectors: ((err: Error) => void)[] = [];
let beltInstalled = false;

function onBeltRejection(err: unknown): void {
  if (isTransformersLoaderEscape(err)) {
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
async function loadWithCpuFallback<T>(device: DeviceType, log: InferenceLog, build: (device: DeviceType) => Promise<T>): Promise<T> {
  try {
    return await ownModelLoad(() => build(device));
  } catch (err) {
    if (device === CPU_DEVICE) {
      throw err;
    }
    log.warn({ err: String(err), device }, "local-light: model load failed on device; retrying on cpu");
    return await ownModelLoad(() => build(CPU_DEVICE));
  }
}

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

/** The lease-counted single-flight memo every model slot below is built from. */
function createMemo<T>(load: (id: string) => Promise<T>, dispose: (value: T) => void): ModelMemo<T> {
  const entries = new Map<string, MemoEntry<T>>();
  const disposeEntry = (entry: MemoEntry<T>): void => {
    if (entry.disposed || !entry.evictionPending || entry.refs > 0) {
      return;
    }
    entry.disposed = true;
    // @orb-waive caught-failure-ownership(entry.promise): terminal cleanup after eviction; a load rejection has no value, while every concrete dispose callback is a no-op or delegates to the sync-safe, warning-owned detach root. Precedent: the gate mustPass fixture packages/server/src/infra/probe/cleanup.ts proves the same terminal cleanup absorber. Ends if a dispose callback can throw outside detach or cleanup gains an acknowledgement contract.
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
    // The memo caches the RESOLVED model, never a rejection: a rejected entry evicts itself once settled.
    // @orb-waive caught-failure-ownership(created): the rejection arm deletes the failed single-flight entry, while every awaiting caller still receives the original rejection. Precedent: the gate mustFlag fixture packages/server/src/domain/probe/opaque-rethrow-helper.ts documents the same real but syntactically opaque propagation. Ends if either behavior changes.
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

/**
 * THE RESOLVED PATH GOES TO THE LOG, NEVER INTO THE MESSAGE (2026-09-20).
 *
 * This message used to interpolate `dir` — the RESOLVED absolute host path — plus node's mkdir errno,
 * which repeats that path a second time. A `ProviderError.message` reaches the tRPC wire (it is the
 * message the transport classifier may carry, and before that classifier existed it rode every unmapped
 * 500 verbatim), and an absolute host path is the same information-disclosure class as the absolute stack
 * frames the 2026-08-09 incident put in front of anonymous callers — it discloses the deployment layout
 * and, under `/home/<user>/…`, the OS account.
 *
 * The caller keeps the ACTIONABLE half: which env var to set, and to what. The operator keeps the
 * DIAGNOSTIC half on the log line {@link ensureCacheDir} writes beside the throw, and `cause` stays
 * attached so an err-serializing logger further up loses nothing either.
 */
function cacheDirError(cause: unknown): ProviderError {
  return new ProviderError({
    kind: "server",
    retryable: false,
    message: "local-light: the model cache directory is not creatable — set LOCAL_LIGHT_CACHE_DIR to a writable path under the data root",
    cause,
  });
}

// Creating the root up front turns the read-only-rootfs case into one typed failure. The path it failed on
// is operator-only and is logged here rather than carried on the error — see cacheDirError.
async function ensureCacheDir(dir: string, log: InferenceLog): Promise<void> {
  await mkdir(dir, { recursive: true }).catch((err: unknown) => {
    log.error({ err, cacheDir: dir }, "local-light: the model cache directory is not creatable");
    throw cacheDirError(err);
  });
}

export function createModelCache(config: ModelCacheConfig): LocalLightModelCache {
  const device = resolveDevice(config.device);
  const dtype = DEFAULT_DTYPE;
  const embedDtype = resolveEmbedDtype(config.embedDtype);
  const cacheDir = config.cacheDir === undefined ? undefined : resolve(config.cacheDir);
  let configured = false;
  const transformers = async (): Promise<TransformersModule> => {
    const mod = await loadTransformers();
    if (!configured) {
      configured = true;
      if (config.allowRemoteModels !== undefined) {
        mod.env.allowRemoteModels = config.allowRemoteModels;
      }
      if (cacheDir !== undefined) {
        await ensureCacheDir(cacheDir, config.log);
        mod.env.cacheDir = cacheDir;
      }
    }
    return mod;
  };
  const { onProgress, log } = config;
  const loadOpts =
    onProgress === undefined
      ? {}
      : {
          progress_callback: (info: TransformersProgressInfo): void => {
            const progress = toLoadProgress(info);
            if (progress !== null) {
              onProgress(progress);
            }
          },
        };

  const jinaEmbedder = createMemo(
    async (id) => {
      const { AutoModel } = await transformers();
      return await loadWithCpuFallback(device, log, (dev) => AutoModel.from_pretrained(id, { device: dev, dtype: embedDtype, ...loadOpts }));
    },
    (m) =>
      config.detach("local-light.model.dispose:jina", async () => {
        await m.dispose();
      }),
  );
  const reranker = createMemo(
    async (id) => {
      const { AutoModelForSequenceClassification } = await transformers();
      return await loadWithCpuFallback(device, log, (dev) => AutoModelForSequenceClassification.from_pretrained(id, { device: dev, dtype, ...loadOpts }));
    },
    (m) =>
      config.detach("local-light.model.dispose:reranker", async () => {
        await m.dispose();
      }),
  );
  const tokenizer = createMemo(
    async (id) => {
      const { AutoTokenizer } = await transformers();
      return await AutoTokenizer.from_pretrained(id, loadOpts);
    },
    () => undefined,
  );
  const processor = createMemo(
    async (id) => {
      const { AutoProcessor } = await transformers();
      return await AutoProcessor.from_pretrained(id, loadOpts);
    },
    () => undefined,
  );
  const bgRemover = createMemo(
    async (id) => {
      const { pipeline } = await transformers();
      return await loadWithCpuFallback(device, log, (dev) => pipeline("background-removal", id, { device: dev, dtype, ...loadOpts }));
    },
    (p) =>
      config.detach("local-light.model.dispose:background-removal", async () => {
        await p.dispose();
      }),
  );

  const embedJinaTexts = async (modelId: string, texts: readonly string[]): Promise<Float32Array[]> =>
    processor.withLease(modelId, (proc) =>
      jinaEmbedder.withLease(modelId, async (model) => {
        const { Tensor: TensorCtor } = await transformers();
        const inputs = await proc([...texts], null, { padding: true, truncation: true });
        const out: Record<string, unknown> = await model(inputs);
        return tensorRows(requireTensor(out, "text_embeddings", modelId, TensorCtor));
      }),
    );

  const slotLoaders: { readonly [K in LocalLightModelSlot]: (modelId: string) => Promise<void> } = {
    rerank: async (modelId) => {
      await Promise.all([tokenizer(modelId), reranker(modelId)]);
    },
    embed: async (modelId) => {
      await Promise.all([processor(modelId), jinaEmbedder(modelId)]);
    },
    matte: async (modelId) => {
      await bgRemover(modelId);
    },
  };

  return {
    async preload(slot, modelId): Promise<void> {
      await slotLoaders[slot](modelId);
    },
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
          const inputs = tok(
            documents.map(() => query),
            { text_pair: [...documents], padding: true, truncation: true },
          );
          const out: Record<string, unknown> = await model(inputs);
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
          const out: Record<string, unknown> = await model(inputs);
          return tensorRows(requireTensor(out, "image_embeddings", modelId, TensorCtor));
        }),
      );
    },
    embedClipTexts(modelId, texts): Promise<Float32Array[]> {
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
    },
    async removeBackground(modelId, image): Promise<Uint8Array> {
      return await bgRemover.withLease(modelId, async (segmenter) => {
        const matted = await segmenter(toImageSource(image));
        const buf = await matted.toSharp().png().toBuffer();
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      });
    },
  };
}
