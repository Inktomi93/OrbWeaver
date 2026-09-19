// infra/providers/backends/local-light — the FAMILY BARREL for the in-process transformers.js/ONNX
// backend (D39 — the keyless "any box" tier, CPU+CUDA). Exports `createLocalLightBackend(deps)`, which
// returns a sealed {@link ProviderBackend} serving ONLY embed / rerank / imageEmbed (no chat / agent /
// summarize / generateImage — those methods are ABSENT, so the role dispatcher's `requireRoleImpl`
// throws a typed not-supported for them, matching the firewall policy that admits local-light for the
// three derive roles only). `entry/` wires the returned backend into the BackendRegistry under the
// "local-light" key.

import type { ProviderBackend } from "../../contract/index.ts";
import { createLocalLightEmbed, DEFAULT_EMBED_MODEL } from "./embed.ts";
import { createLocalLightImageEmbed } from "./image-embed.ts";
import type { LocalLightModelCache, ModelCacheConfig } from "./model-cache.ts";
import { createModelCache, localLightEmbedSpaceTag, resolveEmbedDtype, resolveModelId } from "./model-cache.ts";
import { createLocalLightRerank } from "./rerank.ts";

export { DEFAULT_EMBED_MODEL } from "./embed.ts";
export { DEFAULT_IMAGE_EMBED_MODEL } from "./image-embed.ts";
export { createLocalLightMatte, DEFAULT_MATTE_MODEL } from "./matte.ts";
export type { LocalLightLoadProgress, LocalLightModelCache, LocalLightModelSlot, ModelCacheConfig } from "./model-cache.ts";
// `localLightEmbedSpaceTag` / `resolveEmbedDtype` are deliberately NOT re-exported: `localLightEmbedSpace`
// below is the ONE door out of this family for the space tag, so no caller can assemble a half-derived one.
export { createModelCache, LOCAL_LIGHT_MODEL_SLOTS } from "./model-cache.ts";
export type { LocalLightPrefetchDeps, LocalLightPrefetchHandle, LocalLightPrefetchRecord, LocalLightPrefetchTarget } from "./prefetch.ts";
export {
  __resetLocalLightPrefetchForTest,
  allLocalLightPrefetchStatuses,
  createLocalLightPrefetch,
  LOCAL_LIGHT_PREFETCH_STATUSES,
  LOCAL_LIGHT_STATUS_PREFIX,
  recordLocalLightLoadProgress,
} from "./prefetch.ts";
export { DEFAULT_RERANK_MODEL } from "./rerank.ts";

/** THE ACTIVE local-light embedding space, for a caller that holds a resolved connection but no cache —
 *  i.e. the composition root's `embedModel`/`imageEmbedModel` getters, whose answer the `embeddings` and
 *  `search` domains use as "the space we are in" (the staleness key, and `purgeStaleVectors`'s survivor
 *  test). It reproduces exactly what `createLocalLightEmbed` will stamp on the result: the same
 *  `resolveModelId` fallback, then the same space tag.
 *
 *  THE `resolveModelId` HALF IS LOAD-BEARING, not defensive. A local-light role resolves with an EMPTY
 *  model id — `resolve-role.ts`'s vLLM fallback returns `model: ""` and the config-derived heal leaves it
 *  empty, because the in-process tier serves exactly its builtin and the user has no choice. The backend
 *  then self-defaults to `jinaai/jina-clip-v2`, so before this function the write side wrote that repo id
 *  while the active-space read answered `""` — every stored vector was in a space the box did not think it
 *  was in. Resolving the same fallback here is what makes the two sides agree. */
export function localLightEmbedSpace(requestedModel: string): string {
  return localLightEmbedSpaceTag(resolveModelId(requestedModel, DEFAULT_EMBED_MODEL), resolveEmbedDtype(undefined));
}

/** Deps for the local-light backend. Extends the model-cache runtime knobs (device/dtype/cacheDir/
 *  allowRemoteModels) and lets a caller inject a prebuilt cache — tests pass a deterministic fake;
 *  production omits it and gets the real transformers.js/ONNX cache built from the knobs. */
export interface LocalLightDeps extends ModelCacheConfig {
  readonly cache?: LocalLightModelCache | undefined;
}

/** Build the sealed local-light backend. One model cache is shared across the three role impls so a
 *  model loads once and is reused across embed/rerank/imageEmbed calls. */
export function createLocalLightBackend(deps: LocalLightDeps = {}): ProviderBackend {
  const cache = deps.cache ?? createModelCache(deps);
  // The two embedding roles report a VECTOR-SPACE identity, not the loader id: the encoder's dtype is part
  // of the space (#2417), and `resolveEmbedDtype` is the same resolution the cache above just made — an
  // injected `deps.cache` was built through the same door, so the tag describes the weights actually
  // loaded. ONE function serves both roles because jina-clip's two encoders share one joint space.
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  const spaceTag = (modelId: string): string => localLightEmbedSpaceTag(modelId, resolveEmbedDtype(deps.dtype));
  return {
    key: "local-light",
    embed: createLocalLightEmbed(cache, spaceTag),
    rerank: createLocalLightRerank(cache),
    imageEmbed: createLocalLightImageEmbed(cache, spaceTag),
  };
}
