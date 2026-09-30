// The local-light model cache hosted on ONE worker thread. onnxruntime-node runs every inference and session
// load synchronously on its calling thread, so an in-thread cache blocks the server's request loop for seconds
// per embed. The main thread never imports transformers.js; the weights load once, inside the worker.

import { Worker } from "node:worker_threads";
import type { ModelId } from "@orb/kit/ids";
import type { ProviderErrorInit } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type {
  LocalLightHostMessage,
  LocalLightLoadProgress,
  LocalLightWorkerCall,
  LocalLightWorkerFailure,
  LocalLightWorkerMessage,
  LocalLightWorkerOptions,
  LocalLightWorkerValue,
} from "../../contract/local-light-worker.ts";
import type { InferenceLog } from "../../deps.ts";
import type { LocalLightModelCache } from "./model-cache.ts";

// How long `close` waits for the worker to exit: at most one native model call must return first.
const LOCAL_LIGHT_WORKER_CLOSE_MS = 10_000;

interface WorkerModelCacheConfig extends Omit<LocalLightWorkerOptions, "cacheModule"> {
  readonly cacheModule?: string | undefined;
  readonly closeWaitMs?: number | undefined;
  readonly onProgress?: ((progress: LocalLightLoadProgress) => void) | undefined;
  readonly log: InferenceLog;
}

export interface WorkerModelCache extends LocalLightModelCache {
  /** Stop the worker and reject its pending calls, waiting a bounded time for it to exit. Later calls start a new one. */
  readonly close: () => Promise<void>;
}

// Every provenance field a ProviderError may carry; `rewrap` in contract/errors.ts lists the same set.
function providerFields(err: ProviderError): Omit<ProviderErrorInit, "kind" | "retryable" | "message" | "cause"> {
  return {
    ...(err.resetsAt !== undefined ? { resetsAt: err.resetsAt } : {}),
    ...(err.apiErrorStatus !== undefined ? { apiErrorStatus: err.apiErrorStatus } : {}),
    ...(err.model !== undefined ? { model: err.model } : {}),
    ...(err.terminalReason !== undefined ? { terminalReason: err.terminalReason } : {}),
    ...(err.detail !== undefined ? { detail: err.detail } : {}),
    ...(err.sessionId !== undefined ? { sessionId: err.sessionId } : {}),
    ...(err.requestId !== undefined ? { requestId: err.requestId } : {}),
  };
}

export function toWorkerFailure(err: unknown): LocalLightWorkerFailure {
  if (err instanceof ProviderError) {
    return { kind: "provider", init: { kind: err.kind, retryable: err.retryable, message: err.message, ...providerFields(err) } };
  }
  return { kind: "error", message: err instanceof Error ? err.message : String(err) };
}

function fromWorkerFailure(failure: LocalLightWorkerFailure): Error {
  return failure.kind === "provider" ? new ProviderError(failure.init) : new Error(failure.message);
}

function workerLostError(detail: string): ProviderError {
  return new ProviderError({
    kind: "server",
    retryable: true,
    message: `local-light: the inference worker stopped (${detail}); the next call starts a new one`,
  });
}

interface Pending {
  readonly modelId: ModelId;
  readonly resolve: (value: LocalLightWorkerValue) => void;
  readonly reject: (err: Error) => void;
}

interface Live {
  readonly worker: Worker;
  readonly pending: Map<number, Pending>;
  /** Set once the worker is lost, so a second exit signal settles nothing twice. */
  ended: boolean;
  /** Set by `close`: the worker's exit is expected, not a crash. */
  closing: boolean;
}

const DEFAULT_CACHE_MODULE = new URL("./model-cache.ts", import.meta.url).href;

export function createWorkerModelCache(config: WorkerModelCacheConfig): WorkerModelCache {
  const { log, onProgress } = config;
  const options: LocalLightWorkerOptions = {
    device: config.device,
    embedDtype: config.embedDtype,
    cacheDir: config.cacheDir,
    allowRemoteModels: config.allowRemoteModels,
    cacheModule: config.cacheModule ?? DEFAULT_CACHE_MODULE,
  };
  const failedModels = new Set<ModelId>();
  let live: Live | null = null;
  let nextId = 0;

  const settleAll = (state: Live, err: Error): void => {
    for (const pending of state.pending.values()) {
      pending.reject(err);
    }
    state.pending.clear();
  };

  const onMessage = (state: Live, message: LocalLightWorkerMessage): void => {
    if (message.type === "log") {
      log[message.level](message.fields, message.message);
      return;
    }
    if (message.type === "progress") {
      onProgress?.(message.progress);
      return;
    }
    const pending = state.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    state.pending.delete(message.id);
    if (message.loadFailed) {
      failedModels.add(pending.modelId);
    } else {
      failedModels.delete(pending.modelId);
    }
    if (message.type === "reply") {
      pending.resolve(message.value);
    } else {
      pending.reject(fromWorkerFailure(message.failure));
    }
  };

  const lose = (state: Live, detail: string): void => {
    if (live === state) {
      live = null;
    }
    if (state.ended) {
      return;
    }
    state.ended = true;
    if (!state.closing) {
      log.error({ detail, pending: state.pending.size }, "local-light: the inference worker stopped unexpectedly");
    }
    settleAll(state, workerLostError(state.closing ? "closed" : detail));
  };

  const start = (): Live => {
    const worker = new Worker(new URL("./model-worker.ts", import.meta.url), { workerData: options });
    // An idle worker must never hold the process open; shutdown closes it explicitly.
    worker.unref();
    const state: Live = { worker, pending: new Map(), ended: false, closing: false };
    worker.on("message", (message: LocalLightWorkerMessage) => {
      onMessage(state, message);
    });
    worker.on("error", (err: Error) => {
      lose(state, err.message);
    });
    worker.on("exit", (code: number) => {
      lose(state, `exit code ${String(code)}`);
    });
    return state;
  };

  function call(request: LocalLightWorkerCall): Promise<LocalLightWorkerValue> {
    live ??= start();
    const state = live;
    const id = nextId;
    nextId += 1;
    const { promise, resolve, reject } = Promise.withResolvers<LocalLightWorkerValue>();
    state.pending.set(id, { modelId: request.modelId, resolve, reject });
    // A pending call holds the process open, exactly as an in-thread inference did.
    state.worker.ref();
    const message: LocalLightHostMessage = { type: "call", id, call: request };
    state.worker.postMessage(message);
    return promise.finally(() => {
      if (state.pending.size === 0) {
        state.worker.unref();
      }
    });
  }

  const vectors = async (request: LocalLightWorkerCall): Promise<Float32Array[]> => (await call(request)) as Float32Array[];

  return {
    embedTexts: (modelId, texts): Promise<Float32Array[]> => (texts.length === 0 ? Promise.resolve([]) : vectors({ op: "embedTexts", modelId, texts })),
    embedClipTexts: (modelId, texts): Promise<Float32Array[]> => (texts.length === 0 ? Promise.resolve([]) : vectors({ op: "embedClipTexts", modelId, texts })),
    embedImages: (modelId, images): Promise<Float32Array[]> => (images.length === 0 ? Promise.resolve([]) : vectors({ op: "embedImages", modelId, images })),
    scorePairs: async (modelId, query, documents): Promise<number[]> =>
      documents.length === 0 ? [] : ((await call({ op: "scorePairs", modelId, query, documents })) as number[]),
    removeBackground: async (modelId, image): Promise<Uint8Array> => (await call({ op: "removeBackground", modelId, image })) as Uint8Array,
    preload: async (slot, modelId): Promise<void> => {
      await call({ op: "preload", modelId, slot });
    },
    loadFailed: (modelId): boolean => failedModels.has(modelId),
    // Never `terminate()`: stopping the thread while onnxruntime-node is inside a run makes its binding throw a
    // C++ exception nothing can catch, and that aborts the whole process. The worker exits itself instead.
    close: async (): Promise<void> => {
      const state = live;
      if (state === null) {
        return;
      }
      live = null;
      state.closing = true;
      const exited = Promise.withResolvers<"exited">();
      state.worker.once("exit", () => exited.resolve("exited"));
      const bound = Promise.withResolvers<"timeout">();
      const waitMs = config.closeWaitMs ?? LOCAL_LIGHT_WORKER_CLOSE_MS;
      const timer = setTimeout(() => bound.resolve("timeout"), waitMs);
      const closeMessage: LocalLightHostMessage = { type: "close" };
      state.worker.postMessage(closeMessage);
      const outcome = await Promise.race([exited.promise, bound.promise]);
      clearTimeout(timer);
      if (outcome === "timeout") {
        state.worker.unref();
        log.warn({ waitedMs: waitMs }, "local-light: the inference worker is still inside a model call; shutdown continues without it");
      }
      settleAll(state, workerLostError("closed"));
    },
  };
}
