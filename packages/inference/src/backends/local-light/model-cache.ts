// Lazy, memoized transformers.js/ONNX model loader + inference seam — the SOLE home of the
// `@huggingface/transformers` coupling, so the task files stay pure transforms. Default embedder is
// jinaai/jina-clip-v2, one model whose text + image encoders share a 1024-dim joint space.
//
// THE IMPORT IS DYNAMIC ON PURPOSE: `@huggingface/transformers` pulls `onnxruntime-node`, whose NAPI binding
// loads at import time. This module runs inside the local-light worker (`model-worker.ts`); deferring the import
// to the first model load keeps a thread that never runs a model from loading the binding at all.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import type { DataType, DeviceType, Tensor } from "@huggingface/transformers";
import type { RerankOnnx } from "@orb/contracts/inference";
import { embedSpaceOf, modelIdSchema } from "@orb/contracts/inference";
import type { ImageInput } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import { l2Normalize } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/errors.ts";
import type { LocalLightLoadProgress, LocalLightRerankServing } from "../../contract/local-light-worker.ts";
import type { EmbedRequest } from "../../contract/roles.ts";
import type { LocalLightModelSlot } from "../../contract/runtime.ts";
import type { InferenceLog } from "../../deps.ts";
import { localLightCpuThreads } from "./cpu-budget.ts";
import type { StHead } from "./st-head.ts";
import { loadStHead, scoreHiddenStates } from "./st-head.ts";

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
/** How a reranker whose capability names no `onnx` serving runs: the transformers.js export convention at fp32,
 *  exactly as every reranker ran before servings existed (an offline box may hold only `onnx/model.onnx`). */
const DEFAULT_RERANK_ONNX: RerankOnnx = { head: "sequence-classification", dtype: "fp32" };
/** The encoder's own dtype axis (#2417): the ENCODER is quantized (fp32 is 3.455 GB; q8 874 MB). */
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
export function localLightEmbedSpaceTag(modelId: ModelId, dtype: DataType): string {
  return embedSpaceOf(modelId, dtype);
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
  return { modelId: modelIdSchema.parse(info.name), loaded, total };
}

/** The inference seam the task files depend on — raw un-normalized vectors; task files own L2 + MRL. */
export interface LocalLightModelCache {
  readonly embedTexts: (modelId: ModelId, texts: readonly string[], inputType?: EmbedRequest["inputType"]) => Promise<Float32Array[]>;
  /** Every pair is cut to `serving.maxInputTokens` real tokens; `serving.onnx` picks the head, file and dtype. */
  readonly scorePairs: (modelId: ModelId, query: string, documents: readonly string[], serving: LocalLightRerankServing) => Promise<number[]>;
  readonly embedImages: (modelId: ModelId, images: readonly ImageInput[]) => Promise<Float32Array[]>;
  readonly embedClipTexts: (modelId: ModelId, texts: readonly string[]) => Promise<Float32Array[]>;
  /** Warm a slot's memos WITHOUT running inference — the prefetch's whole surface. `onnx` as in `scorePairs`. */
  readonly preload: (slot: LocalLightModelSlot, modelId: ModelId, onnx?: RerankOnnx) => Promise<void>;
  /** Whether the latest load of any part of this model (weights, tokenizer, processor) failed and no later
   *  load of that part has succeeded — the availability verdict's input. */
  readonly loadFailed: (modelId: ModelId) => boolean;
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
  /** Replaces the lib's dynamic import. Only tests set it, to drive the rerank servings without model weights. */
  readonly __loadTransformersForTest?: (() => Promise<TransformersModule>) | undefined;
}

export function normalizeVector(v: Float32Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(v.length);
  out.set(l2Normalize(v));
  return out;
}

function abortedError(): ProviderError {
  return new ProviderError({ kind: "aborted", retryable: false, message: "local-light request aborted" });
}

// In-process ONNX work can't be interrupted mid-run, so a request checks at task boundaries and stops WAITING on
// the model (see `abortableWait`) rather than stopping the model.
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortedError();
  }
}

/** Wait on in-process model work (a model load or an inference run) until it settles or `signal` aborts. On an
 *  abort the request rejects at once and the work keeps running: a load settles into the cache unread, as a
 *  prefetch does at shutdown. This is what lets an aborted workload finish while its model is still loading. */
export function abortableWait<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return work;
  }
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(abortedError());
  };
  // An already-fired signal still goes through the race, never a synchronous throw: the race subscribes to the
  // work, so a load that fails after the caller stopped waiting is handled rather than an unhandled rejection.
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }
  // The abort is listed first so it wins over work that has also settled already.
  return Promise.race([aborted.promise, work]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
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

function requireTensor(out: Record<string, unknown>, key: string, modelId: ModelId, TensorCtor: TransformersModule["Tensor"]): Tensor {
  const value = out[key];
  if (!(value instanceof TensorCtor)) {
    throw new ProviderError({ kind: "server", retryable: false, message: `local-light model "${modelId}" produced no "${key}" output tensor` });
  }
  return value;
}

/** Token cells (pairs × padded length) one rerank forward pass may hold. Activation memory grows with the batch
 *  and faster than linearly with length, so one padded batch of long pairs can take gigabytes; the probe in
 *  scripts/probes/reranker-swap measured a 2048-token pair at about 0.7 GB over the loaded model. */
const RERANK_BATCH_TOKENS = 2048;

/** Document indexes grouped into forward passes under {@link RERANK_BATCH_TOKENS}, shortest first so a batch
 *  pads to a similar length. A pair longer than the budget runs alone, and so does every pair of a dynamically
 *  quantized file, whose activation scales come from the whole batch and would make a score depend on its neighbours. */
export function rerankBatches(pairLengths: readonly number[], dynamicQuantized = false): number[][] {
  const order = pairLengths.map((_, i) => i).sort((a, b) => (pairLengths[a] ?? 0) - (pairLengths[b] ?? 0));
  if (dynamicQuantized) {
    return order.map((index) => [index]);
  }
  const batches: number[][] = [];
  let current: number[] = [];
  for (const index of order) {
    // Sorted ascending, so this pair is the batch's longest and sets its padded length.
    const padded = pairLengths[index] ?? 0;
    if (current.length > 0 && (current.length + 1) * padded > RERANK_BATCH_TOKENS) {
      batches.push(current);
      current = [];
    }
    current.push(index);
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
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
  /** Whether the id's most recent load rejected, until a later load of it succeeds. */
  failed: (id: string) => boolean;
  /** Record that a loaded entry cannot serve (its outputs do not match its serving) and drop it, so the
   *  availability verdict says so and the next call loads afresh. */
  markFailed: (id: string) => void;
}

/** The lease-counted single-flight memo every model slot below is built from. */
function createMemo<T>(
  load: (id: string) => Promise<T>,
  dispose: (value: T) => Promise<void>,
  detach: ModelCacheConfig["detach"],
  disposeName: string,
): ModelMemo<T> {
  const entries = new Map<string, MemoEntry<T>>();
  const failedIds = new Set<string>();
  const disposeEntry = (entry: MemoEntry<T>): void => {
    if (entry.disposed || !entry.evictionPending || entry.refs > 0) {
      return;
    }
    entry.disposed = true;
    detach(disposeName, async () => {
      await dispose(await entry.promise);
    });
  };
  const getEntry = (id: string): MemoEntry<T> => {
    const existing = entries.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const created = load(id);
    const entry: MemoEntry<T> = { promise: created, refs: 0, evictionPending: false, disposed: false };
    entries.set(id, entry);
    // The memo caches the RESOLVED model, never a rejection: a rejected entry evicts itself once settled, so the
    // next call retries the load.
    // @orb-waive caught-failure-ownership(created): the rejection arm records the failure for the availability verdict and deletes the failed single-flight entry, while every awaiting caller still receives the original rejection. Precedent: the gate mustFlag fixture packages/server/src/domain/probe/opaque-rethrow-helper.ts documents the same real but syntactically opaque propagation. Ends if either behavior changes.
    void created.then(
      () => {
        failedIds.delete(id);
      },
      () => {
        failedIds.add(id);
        if (entries.get(id) === entry) {
          entries.delete(id);
        }
      },
    );
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
  memo.failed = (id: string): boolean => failedIds.has(id);
  memo.markFailed = (id: string): void => {
    failedIds.add(id);
    const entry = entries.get(id);
    if (entry !== undefined) {
      entries.delete(id);
      entry.evictionPending = true;
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

/** The tokenizer surface the pair fit needs; the lib's tokenizer satisfies it. */
export interface PairTokenizer {
  readonly encode: (text: string, options?: { text_pair?: string | null; add_special_tokens?: boolean }) => number[];
  readonly decode: (ids: number[], options: { skip_special_tokens: boolean }) => string;
}

/** Cut one query/document pair to `maxTokens` real tokens: the query to at most half of what the special tokens
 *  leave, the document to the rest. The tokenizer's own truncation would instead cut the joined pair's tail, and at
 *  the model's full length rather than the served window. A cut decodes with special tokens KEPT: skipping them would
 *  delete every unknown-token piece (`[UNK]`) from the text, and the pair would under-fill its window. The batch call
 *  still passes `max_length`, so a re-encode that drifts by a token can never exceed the window. */
export function fitPairToWindow(tok: PairTokenizer, query: string, document: string, maxTokens: number): { query: string; document: string } {
  const plain = { add_special_tokens: false };
  const specials = tok.encode("a", { text_pair: "b" }).length - tok.encode("a", plain).length - tok.encode("b", plain).length;
  const budget = Math.max(0, maxTokens - specials);
  const cut = (text: string, limit: number): string => {
    if (limit <= 0) {
      return "";
    }
    const ids = tok.encode(text, plain);
    return ids.length <= limit ? text : tok.decode(ids.slice(0, limit), { skip_special_tokens: false });
  };
  const fittedQuery = cut(query, Math.floor(budget / 2));
  return { query: fittedQuery, document: cut(document, budget - tok.encode(fittedQuery, plain).length) };
}

function tokenizerError(modelId: ModelId, cause: unknown): ProviderError {
  return new ProviderError({ kind: "server", retryable: false, message: `local-light reranker "${modelId}": tokenizing the pairs failed`, cause });
}

/** Run tokenizer work, surfacing a failure as a typed provider error naming the model. */
function tokenizeBatch<T>(modelId: ModelId, run: () => T): T {
  try {
    return run();
  } catch (err) {
    throw tokenizerError(modelId, err);
  }
}

function rerankLoadError(modelId: string, detail: string): ProviderError {
  return new ProviderError({ kind: "invalid", retryable: false, message: `local-light reranker "${modelId}": ${detail}` });
}

/** The lib options a reranker's ONNX serving selects. An architecture the row names no file for is refused: serving
 *  another architecture's quantized kernels, or silently the fp32 file, is a different model on this box. */
function rerankFileOptions(modelId: string, onnx: RerankOnnx): { dtype: DataType; model_file_name?: string; revision?: string } {
  const dtype = DATA_TYPES.find((candidate) => candidate === onnx.dtype);
  if (dtype === undefined) {
    throw rerankLoadError(modelId, `the dtype "${onnx.dtype}" is not one this backend loads`);
  }
  const revision = onnx.revision === undefined ? {} : { revision: onnx.revision };
  if (onnx.files === undefined) {
    return { dtype, ...revision };
  }
  const file = onnx.files[process.arch];
  if (file === undefined) {
    throw rerankLoadError(modelId, `no ONNX file is listed for this CPU architecture (${process.arch})`);
  }
  return { dtype, model_file_name: file, ...revision };
}

/** Read one file of a model repo through the lib's own cache layout (`<cacheDir>/<id>/[<revision>/]<file>`),
 *  downloading it at that revision when remote models are allowed. The head modules are files the lib never fetches. */
async function readRepoFile(
  mod: TransformersModule,
  repo: { readonly modelId: string; readonly revision: string | undefined },
  file: string,
  onCacheHit: (path: string) => void,
): Promise<Uint8Array> {
  const { modelId, revision } = repo;
  const cached = mod.env.cacheDir === null ? null : join(mod.env.cacheDir, modelId, ...(revision === undefined ? [] : [revision]), file);
  if (cached !== null && existsSync(cached)) {
    onCacheHit(cached);
    return await readFile(cached);
  }
  if (!mod.env.allowRemoteModels) {
    throw rerankLoadError(modelId, `${file} is not in the model cache and remote models are off`);
  }
  const url = `${mod.env.remoteHost}${mod.env.remotePathTemplate.replace("{model}", modelId).replace("{revision}", revision ?? "main")}${file}`;
  // The lib's own transport, so these files take the same path (and the same egress rules) as the weights do.
  const res = (await mod.env.fetch(url)) as Response;
  if (!res.ok) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `local-light reranker "${modelId}": ${file} download failed (HTTP ${String(res.status)})`,
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (cached !== null) {
    // Write beside the target and rename over it, as the lib's own file cache does, so a crash mid-write can never
    // leave a half file that reads as cached.
    await mkdir(dirname(cached), { recursive: true });
    const partial = `${cached}.${String(process.pid)}.${randomUUID()}.part`;
    try {
      await writeFile(partial, bytes);
      await rename(partial, cached);
    } finally {
      // After a successful rename there is nothing at this path; after a failed write or rename this drops the stray.
      await rm(partial, { force: true });
    }
  }
  return bytes;
}

/** Load a CrossEncoder head, repairing a damaged cache once: when a head built from cached files fails to parse or
 *  to fit, those files are deleted and fetched again before the load is reported failed. */
async function loadHeadRepairing(
  mod: TransformersModule,
  repo: { readonly modelId: string; readonly revision: string | undefined },
  log: InferenceLog,
): Promise<StHead> {
  const cachedFiles = new Set<string>();
  const read = (file: string): Promise<Uint8Array> => readRepoFile(mod, repo, file, (path) => cachedFiles.add(path));
  try {
    return await loadStHead(read);
  } catch (err) {
    if (cachedFiles.size === 0 || !mod.env.allowRemoteModels) {
      throw err;
    }
    log.warn({ modelId: repo.modelId, err: String(err) }, "local-light: a cached reranker head did not load; fetching its files again");
    await Promise.all([...cachedFiles].map((path) => rm(path, { force: true })));
    return await loadStHead((file) => readRepoFile(mod, repo, file, () => undefined));
  }
}

type RerankModel = Awaited<ReturnType<TransformersModule["AutoModel"]["from_pretrained"]>>;

type LoadedReranker =
  | { readonly head: "sequence-classification"; readonly model: RerankModel }
  | { readonly head: "sentence-transformers"; readonly model: RerankModel; readonly scorer: StHead };

/** One score per batch row, read the way the serving's head says. A missing or misshapen output throws. */
function readScores(loaded: LoadedReranker, out: Record<string, unknown>, modelId: ModelId, TensorCtor: TransformersModule["Tensor"]): number[] {
  if (loaded.head === "sequence-classification") {
    return tensorRows(requireTensor(out, "logits", modelId, TensorCtor)).map((row) => row.at(-1) ?? 0);
  }
  const hidden = requireTensor(out, "last_hidden_state", modelId, TensorCtor);
  if (!(hidden.data instanceof Float32Array)) {
    throw new ProviderError({ kind: "server", retryable: false, message: `local-light model "${modelId}" produced non-f32 hidden states` });
  }
  return scoreHiddenStates(loaded.scorer, hidden.data, hidden.dims);
}

interface RerankServingKey {
  readonly modelId: ModelId;
  readonly onnx: RerankOnnx;
}

/** The memo key for one serving of one model: two servings of an id never share a loaded session. */
function servingKey(modelId: ModelId, onnx: RerankOnnx): string {
  return `${modelId}\n${JSON.stringify(onnx)}`;
}

export function createModelCache(config: ModelCacheConfig): LocalLightModelCache {
  const sessionOptions = { intraOpNumThreads: localLightCpuThreads(), interOpNumThreads: 1 };
  const device = resolveDevice(config.device);
  const embedDtype = resolveEmbedDtype(config.embedDtype);
  const cacheDir = config.cacheDir === undefined ? undefined : resolve(config.cacheDir);
  const configure = async (): Promise<TransformersModule> => {
    const mod = await (config.__loadTransformersForTest ?? loadTransformers)();
    if (config.allowRemoteModels !== undefined) {
      mod.env.allowRemoteModels = config.allowRemoteModels;
    }
    // SECURITY: local models on makes the lib read `<localModelPath>/<id>/` from this host's disk before the Hub, for
    // any id a plugin provider row names. Weights live in `cacheDir`, which the lib reads either way. An offline
    // deployment keeps it on, because the lib refuses to load with both sources off.
    mod.env.allowLocalModels = !mod.env.allowRemoteModels;
    if (cacheDir !== undefined) {
      await ensureCacheDir(cacheDir, config.log);
      mod.env.cacheDir = cacheDir;
    }
    return mod;
  };
  // Every caller awaits the ONE configuration: a caller that ran ahead of it would load with the lib's default
  // cache dir (inside node_modules). A failed configuration is dropped so the next load retries it.
  let configured: Promise<TransformersModule> | undefined;
  const transformers = (): Promise<TransformersModule> => {
    configured ??= configure().catch((err: unknown) => {
      configured = undefined;
      throw err;
    });
    return configured;
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
      return await loadWithCpuFallback(device, log, (dev) =>
        AutoModel.from_pretrained(id, { device: dev, dtype: embedDtype, session_options: sessionOptions, ...loadOpts }),
      );
    },
    async (m) => {
      await m.dispose();
    },
    config.detach,
    "local-light.model.dispose:jina",
  );
  // Every reranker serving this cache has been asked for, by memo key; `loadFailed` reads them per model id.
  const servings = new Map<string, RerankServingKey>();
  const servingOf = (modelId: ModelId, onnx: RerankOnnx | undefined): string => {
    const resolved = onnx ?? DEFAULT_RERANK_ONNX;
    const key = servingKey(modelId, resolved);
    servings.set(key, { modelId, onnx: resolved });
    return key;
  };
  const servingFor = (key: string): RerankServingKey => {
    const serving = servings.get(key);
    if (serving === undefined) {
      throw new ProviderError({ kind: "server", retryable: false, message: "local-light: a reranker load ran for an unregistered serving" });
    }
    return serving;
  };
  const reranker = createMemo(
    async (key): Promise<LoadedReranker> => {
      const { modelId: id, onnx } = servingFor(key);
      const files = rerankFileOptions(id, onnx);
      const mod = await transformers();
      const opts = { ...files, session_options: sessionOptions, ...loadOpts };
      if (onnx.head === "sequence-classification") {
        const model = await loadWithCpuFallback(device, log, (dev) => mod.AutoModelForSequenceClassification.from_pretrained(id, { ...opts, device: dev }));
        return { head: onnx.head, model };
      }
      const [model, scorer] = await Promise.all([
        loadWithCpuFallback(device, log, (dev) => mod.AutoModel.from_pretrained(id, { ...opts, device: dev })),
        loadHeadRepairing(mod, { modelId: id, revision: onnx.revision }, log),
      ]);
      const hiddenSize: unknown = (model.config as { hidden_size?: unknown }).hidden_size;
      if (hiddenSize !== scorer.inputDim) {
        await model.dispose();
        throw rerankLoadError(id, `the encoder's hidden size ${String(hiddenSize)} does not feed the ${String(scorer.inputDim)}-wide scoring head`);
      }
      return { head: onnx.head, model, scorer };
    },
    async (loaded) => {
      await loaded.model.dispose();
    },
    config.detach,
    "local-light.model.dispose:reranker",
  );
  const tokenizer = createMemo(
    async (key) => {
      const { modelId, onnx } = servingFor(key);
      const { AutoTokenizer } = await transformers();
      return await AutoTokenizer.from_pretrained(modelId, { ...loadOpts, ...(onnx.revision === undefined ? {} : { revision: onnx.revision }) });
    },
    () => Promise.resolve(),
    config.detach,
    "local-light.model.dispose:tokenizer",
  );
  const processor = createMemo(
    async (id) => {
      const { AutoProcessor } = await transformers();
      return await AutoProcessor.from_pretrained(id, loadOpts);
    },
    () => Promise.resolve(),
    config.detach,
    "local-light.model.dispose:processor",
  );
  const embedJinaTexts = async (modelId: ModelId, texts: readonly string[]): Promise<Float32Array[]> =>
    processor.withLease(modelId, (proc) =>
      jinaEmbedder.withLease(modelId, async (model) => {
        const { Tensor: TensorCtor } = await transformers();
        const inputs = await proc([...texts], null, { padding: true, truncation: true });
        const out: Record<string, unknown> = await model(inputs);
        return tensorRows(requireTensor(out, "text_embeddings", modelId, TensorCtor));
      }),
    );

  const slotLoaders: { readonly [K in LocalLightModelSlot]: (modelId: ModelId, onnx: RerankOnnx | undefined) => Promise<void> } = {
    rerank: async (modelId, onnx) => {
      const key = servingOf(modelId, onnx);
      await Promise.all([tokenizer(key), reranker(key)]);
    },
    embed: async (modelId) => {
      await Promise.all([processor(modelId), jinaEmbedder(modelId)]);
    },
  };

  const modelParts: readonly Pick<ModelMemo<unknown>, "failed">[] = [jinaEmbedder, processor];
  const rerankFailed = (modelId: ModelId): boolean =>
    [...servings].some(([key, serving]) => serving.modelId === modelId && (reranker.failed(key) || tokenizer.failed(key)));

  return {
    async preload(slot, modelId, onnx): Promise<void> {
      await slotLoaders[slot](modelId, onnx);
    },
    loadFailed: (modelId): boolean => modelParts.some((part) => part.failed(modelId)) || rerankFailed(modelId),
    embedTexts(modelId, texts): Promise<Float32Array[]> {
      return texts.length === 0 ? Promise.resolve([]) : embedJinaTexts(modelId, texts);
    },
    async scorePairs(modelId, query, documents, serving): Promise<number[]> {
      if (documents.length === 0) {
        return [];
      }
      const key = servingOf(modelId, serving.onnx);
      const maxLength = serving.maxInputTokens;
      return await tokenizer.withLease(key, (tok) =>
        reranker.withLease(key, async (loaded) => {
          const { Tensor: TensorCtor } = await transformers();
          const pairs = tokenizeBatch(modelId, () => documents.map((doc) => fitPairToWindow(tok, query, doc, maxLength)));
          const lengths = tokenizeBatch(modelId, () => pairs.map((pair) => Math.min(tok.encode(pair.query, { text_pair: pair.document }).length, maxLength)));
          const scores = new Array<number>(documents.length).fill(0);
          for (const batch of rerankBatches(lengths, serving.onnx?.dynamicQuantized === true)) {
            const inputs = tokenizeBatch(modelId, () =>
              tok(
                batch.map((i) => pairs[i]?.query ?? ""),
                { text_pair: batch.map((i) => pairs[i]?.document ?? ""), padding: true, truncation: true, max_length: maxLength },
              ),
            );
            const out: Record<string, unknown> = await loaded.model(inputs);
            let batchScores: number[];
            try {
              batchScores = readScores(loaded, out, modelId, TensorCtor);
            } catch (err) {
              // The session loaded but cannot serve: report it unavailable rather than failing every rerank silently.
              reranker.markFailed(key);
              throw err;
            }
            batch.forEach((docIndex, row) => {
              scores[docIndex] = batchScores[row] ?? 0;
            });
          }
          return scores;
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
  };
}
