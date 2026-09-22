// The `local-light` wire's sealed backend (D39 — the keyless "any box" tier, in-process transformers.js/ONNX).
// Serves ONLY embed / imageEmbed / rerank (the other methods are ABSENT — the dispatcher's typed refusal).
// The matte op and the prefetch handle ride beside the backend for the composition root.

import type { ModelId } from "@orb/kit/ids";
import type { ProviderBackend } from "../../contract/backend.ts";
import type { InferenceDeps } from "../../deps.ts";
import type { LocalLightModelCache } from "./model-cache.ts";
import { createModelCache, localLightEmbedSpaceTag, resolveEmbedDtype } from "./model-cache.ts";
import type { LocalLightPrefetchHandle } from "./prefetch.ts";
import { createLocalLightPrefetch } from "./prefetch.ts";
import { createLocalLightEmbed, createLocalLightImageEmbed, createLocalLightMatte, createLocalLightRerank } from "./tasks.ts";

export type { LocalLightModelSlot } from "../../contract/runtime.ts";
export { LOCAL_LIGHT_MODEL_SLOTS } from "../../contract/runtime.ts";
export type { LocalLightModelCache } from "./model-cache.ts";
export type { LocalLightPrefetchHandle, LocalLightPrefetchRecord, LocalLightPrefetchTarget } from "./prefetch.ts";
export { DEFAULT_EMBED_MODEL, DEFAULT_MATTE_MODEL, DEFAULT_RERANK_MODEL } from "./tasks.ts";

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
}

function isModelCache(value: unknown): value is LocalLightModelCache {
  return value !== null && typeof value === "object" && "embedTexts" in value && "preload" in value;
}

export function createLocalLightBackend(deps: LocalLightBackendDeps): LocalLightBackend {
  const config = deps.config ?? {};
  const detach = (name: string, fn: () => Promise<void>): void => deps.superviseDetached(name, {}, fn);
  let cacheRef: LocalLightModelCache | undefined;
  const prefetch = createLocalLightPrefetch({
    cache: () => cacheRef ?? createModelCache({ ...config, log: deps.log, detach }),
    now: deps.now,
    log: deps.log,
    detach,
  });
  const cache = isModelCache(config.cache) ? config.cache : createModelCache({ ...config, log: deps.log, detach, onProgress: prefetch.onProgress });
  cacheRef = cache;
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
  };
}
