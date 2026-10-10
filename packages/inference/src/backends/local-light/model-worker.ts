// The local-light worker thread: runs the in-thread model cache and answers the host's calls
// (`worker-cache.ts`). Vector rows go back as transferred buffers, never as copies.

import process from "node:process";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import type { MessagePort, Transferable } from "node:worker_threads";
import { parentPort, workerData } from "node:worker_threads";
import type {
  LocalLightHostMessage,
  LocalLightLogLevel,
  LocalLightWorkerCall,
  LocalLightWorkerMessage,
  LocalLightWorkerOptions,
  LocalLightWorkerValue,
} from "../../contract/local-light-worker.ts";
import type { InferenceLog } from "../../deps.ts";
import type { LocalLightModelCache, ModelCacheConfig } from "./model-cache.ts";
import { toWorkerFailure } from "./worker-cache.ts";

// While idle, the worker collects garbage this often: a finished model load keeps allocating for tens of seconds.
const IDLE_COLLECT_MS = 10_000;

interface CacheModule {
  readonly createModelCache: (config: ModelCacheConfig) => LocalLightModelCache;
}

function run(cache: LocalLightModelCache, call: LocalLightWorkerCall): Promise<LocalLightWorkerValue> {
  switch (call.op) {
    case "embedTexts":
      return cache.embedTexts(call.modelId, call.texts, undefined, call.encoding);
    case "embedClipTexts":
      return cache.embedClipTexts(call.modelId, call.texts, call.encoding);
    case "embedImages":
      return cache.embedImages(call.modelId, call.images);
    case "scorePairs":
      return cache.scorePairs(call.modelId, call.query, call.documents, call.serving);
    case "preload":
      return cache.preload(call.slot, call.modelId, call.onnx).then(() => null);
    default: {
      const exhaustive: never = call;
      return exhaustive;
    }
  }
}

// A model load leaves the weight file behind as garbage ArrayBuffers, hundreds of MB for the encoder. An idle
// worker never allocates enough to trigger a GC, so it would hold them indefinitely.
// SECURITY: `--expose-gc` is a process-wide V8 flag. While it is set, every new context on any thread and every
// new Worker gains a `gc` global, so it is cleared again the moment this one context has captured `gc`.
function idleCollector(): () => void {
  setFlagsFromString("--expose-gc");
  const collect = runInNewContext("gc") as () => void;
  setFlagsFromString("--no-expose-gc");
  return collect;
}

// Only whole-buffer rows are transferred: a view into a shared or pooled buffer would detach bytes it does not own.
function transfers(value: LocalLightWorkerValue): Transferable[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row) =>
    row instanceof Float32Array && row.buffer instanceof ArrayBuffer && row.byteOffset === 0 && row.byteLength === row.buffer.byteLength ? [row.buffer] : [],
  );
}

async function main(port: MessagePort, options: LocalLightWorkerOptions): Promise<void> {
  const post = (message: LocalLightWorkerMessage, transferList: Transferable[] = []): void => {
    port.postMessage(message, transferList);
  };
  const logAt =
    (level: LocalLightLogLevel) =>
    (fields: Readonly<Record<string, unknown>>, message: string): void => {
      post({ type: "log", level, fields: { ...fields }, message });
    };
  const log: InferenceLog = { debug: logAt("debug"), info: logAt("info"), warn: logAt("warn"), error: logAt("error") };
  const { createModelCache } = (await import(options.cacheModule)) as CacheModule;
  const cache = createModelCache({
    cpuPercent: options.cpuPercent,
    device: options.device,
    embedDtype: options.embedDtype,
    cacheDir: options.cacheDir,
    allowRemoteModels: options.allowRemoteModels,
    log,
    onProgress: (progress) => {
      post({ type: "progress", progress });
    },
    detach: (name, fn) => {
      // @orb-waive caught-failure-ownership(fn): a detached model disposal inside the worker has no caller; the failure is logged as a structured warning that crosses to the host logger. Precedent: packages/inference/src/backends/local-light/prefetch.ts owns a speculative model failure through a warning. Ends if a disposal gains a caller.
      fn().catch((err: unknown) => {
        log.warn({ name, err: String(err) }, "local-light: a detached model task failed");
      });
    },
  });
  const collect = idleCollector();
  let inFlight = 0;
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  const settle = (): void => {
    inFlight -= 1;
    if (inFlight === 0) {
      idleTimer = setInterval(collect, IDLE_COLLECT_MS);
    }
  };
  port.on("message", (message: LocalLightHostMessage) => {
    clearInterval(idleTimer);
    // A message is only read between native calls, never inside one, so exiting here is always safe.
    if (message.type === "close") {
      process.exit(0);
    }
    const { id, call } = message;
    inFlight += 1;
    // @orb-waive caught-failure-ownership(run): the rejection arm posts the failure to the host thread, which rejects the waiting caller with the same error (ProviderError fields kept), so the failure propagates across the thread boundary. Precedent: the gate mustFlag fixture packages/server/src/domain/probe/opaque-rethrow-helper.ts documents the same real but syntactically opaque propagation. Ends if the failure message stops rejecting the host call.
    run(cache, call)
      .then(
        (value) => {
          post({ type: "reply", id, loadFailed: cache.loadFailed(call.modelId), value }, transfers(value));
        },
        (err: unknown) => {
          post({ type: "failure", id, loadFailed: cache.loadFailed(call.modelId), failure: toWorkerFailure(err) });
        },
      )
      .finally(settle);
  });
}

if (parentPort !== null) {
  await main(parentPort, workerData as LocalLightWorkerOptions);
}
