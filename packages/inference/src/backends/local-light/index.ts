// The `local-light` wire's sealed backend (D39 — the keyless "any box" tier, in-process transformers.js/ONNX on
// its own worker thread). Serves ONLY embed / imageEmbed / rerank (the other methods are ABSENT — the
// dispatcher's typed refusal). The matte op and the prefetch handle ride beside the backend for the composition root.

import type { ModelId } from "@orb/kit/ids";
import type { ProviderBackend } from "../../contract/backend.ts";
import type { InferenceDeps } from "../../deps.ts";
import type { LocalLightModelCache } from "./model-cache.ts";
import { localLightEmbedSpaceTag, resolveEmbedDtype } from "./model-cache.ts";
import type { LocalLightPrefetchHandle } from "./prefetch.ts";
import { createLocalLightPrefetch } from "./prefetch.ts";
import { createScheduledCache } from "./scheduled-cache.ts";
import { createLocalLightEmbed, createLocalLightImageEmbed, createLocalLightMatte, createLocalLightRerank } from "./tasks.ts";
import { createWorkerModelCache } from "./worker-cache.ts";

export type { LocalLightModelSlot } from "../../contract/runtime.ts";
export { LOCAL_LIGHT_MODEL_SLOTS } from "../../contract/runtime.ts";
export type { LocalLightModelCache } from "./model-cache.ts";
export type { LocalLightPrefetchHandle, LocalLightPrefetchRecord, LocalLightPrefetchTarget } from "./prefetch.ts";
export { DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL } from "./tasks.ts";

export interface LocalLightBackendDeps {
  readonly now: () => number;
  readonly log: InferenceDeps["log"];
  readonly superviseDetached: InferenceDeps["superviseDetached"];
  readonly config: NonNullable<InferenceDeps["localLight"]> | undefined;
}

export interface LocalLightBackend {
  readonly backend: ProviderBackend;
  readonly prefetch: LocalLightPrefetchHandle;
  readonly matte: ReturnType<typeof createLocalLightMatte>;
  /** THE ACTIVE local-light embedding space tag for a model id — the same string the embed results carry. */
  readonly embedSpace: (modelId: ModelId) => string;
  readonly loadFailed: LocalLightModelCache["loadFailed"];
  /** Stop the inference worker (bounded); a no-op for an injected cache or a worker never started. */
  readonly close: () => Promise<void>;
}

function isModelCache(value: unknown): value is LocalLightModelCache {
  return value !== null && typeof value === "object" && "embedTexts" in value && "preload" in value;
}

export function createLocalLightBackend(deps: LocalLightBackendDeps): LocalLightBackend {
  const config = deps.config ?? {};
  const detach = (name: string, fn: () => Promise<void>): void => deps.superviseDetached(name, {}, fn);
  let cache: LocalLightModelCache;
  let close = (): Promise<void> => Promise.resolve();
  if (isModelCache(config.cache)) {
    cache = config.cache;
  } else {
    const workerCache = createWorkerModelCache({ ...config, log: deps.log, onProgress: (progress) => prefetch.onProgress(progress) });
    cache = workerCache;
    close = workerCache.close;
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
    matte: createLocalLightMatte(cache),
    embedSpace,
    loadFailed: (modelId): boolean => cache.loadFailed(modelId),
    close,
  };
}
