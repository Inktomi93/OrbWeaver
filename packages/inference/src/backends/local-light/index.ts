// The `local-light` wire's sealed backend (D39 — the keyless "any box" tier, in-process transformers.js/ONNX on
// its own worker thread). Serves ONLY embed / imageEmbed / rerank (the other methods are ABSENT — the
// dispatcher's typed refusal). The prefetch handle rides beside the backend for the composition root.

import type { ModelId } from "@orb/kit/ids";
import type { LocalLightBackend, LocalLightBackendDeps, LocalLightModelCache } from "../../contract/local-light.ts";
import { localLightEmbedSpaceTag, resolveEmbedDtype } from "./model-cache.ts";
import { createLocalLightPrefetch } from "./prefetch.ts";
import { createScheduledCache } from "./scheduled-cache.ts";
import { createLocalLightEmbed, createLocalLightImageEmbed, createLocalLightRerank } from "./tasks.ts";
import { createWorkerModelCache } from "./worker-cache.ts";

export type { LocalLightModelSlot } from "#contract";
export { LOCAL_LIGHT_MODEL_SLOTS } from "#contract";
export type { LocalLightModelCache } from "./model-cache.ts";
export type { LocalLightPrefetchHandle, LocalLightPrefetchRecord, LocalLightPrefetchTarget } from "./prefetch.ts";
export { DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL } from "./tasks.ts";

function isModelCache(value: unknown): value is LocalLightModelCache {
  return value !== null && typeof value === "object" && "embedTexts" in value && "preload" in value;
}

export function createLocalLightBackend(deps: LocalLightBackendDeps): LocalLightBackend {
  const config = deps.config ?? {};
  const detach = (name: string, fn: () => Promise<void>): void => deps.superviseDetached(name, {}, fn);
  let cache: LocalLightModelCache;
  let close = (): Promise<void> => Promise.resolve();
  let settle = (): Promise<void> => Promise.resolve();
  if (isModelCache(config.cache)) {
    cache = config.cache;
  } else {
    const workerCache = createWorkerModelCache({
      ...config,
      scheduleTimeout: deps.scheduleTimeout,
      log: deps.log,
      onProgress: (progress) => prefetch.onProgress(progress),
    });
    cache = workerCache;
    close = workerCache.close;
    settle = workerCache.settle;
  }
  cache = createScheduledCache(cache);
  const prefetch = createLocalLightPrefetch({ cache: () => cache, now: deps.now, log: deps.log, detach });
  const embedSpace = (modelId: ModelId): string => localLightEmbedSpaceTag(modelId, resolveEmbedDtype(config.embedDtype));
  return {
    backend: {
      wire: "local-light",
      embed: createLocalLightEmbed(cache, embedSpace),
      rerank: createLocalLightRerank(cache),
      imageEmbed: createLocalLightImageEmbed(cache, embedSpace),
    },
    prefetch,
    embedSpace,
    loadFailed: (modelId): boolean => cache.loadFailed(modelId),
    close,
    settle,
  };
}

export type { LocalLightBackend, LocalLightBackendDeps } from "../../contract/local-light.ts";
