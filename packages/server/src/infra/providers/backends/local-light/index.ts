// infra/providers/backends/local-light — the FAMILY BARREL for the in-process transformers.js/ONNX
// backend (D39 — the keyless "any box" tier, CPU+CUDA). Exports `createLocalLightBackend(deps)`, which
// returns a sealed {@link ProviderBackend} serving ONLY embed / rerank / imageEmbed (no chat / agent /
// summarize / generateImage — those methods are ABSENT, so the role dispatcher's `requireRoleImpl`
// throws a typed not-supported for them, matching the firewall policy that admits local-light for the
// three derive roles only). `entry/` wires the returned backend into the BackendRegistry under the
// "local-light" key.

import type { ProviderBackend } from "../../contract";
import { createLocalLightEmbed } from "./embed";
import { createLocalLightImageEmbed } from "./image-embed";
import type { LocalLightModelCache, ModelCacheConfig } from "./model-cache";
import { createModelCache } from "./model-cache";
import { createLocalLightRerank } from "./rerank";

export { DEFAULT_EMBED_MODEL } from "./embed";
export { DEFAULT_IMAGE_EMBED_MODEL } from "./image-embed";
export { createLocalLightMatte, DEFAULT_MATTE_MODEL } from "./matte";
export type { LocalLightModelCache, ModelCacheConfig } from "./model-cache";
export { createModelCache } from "./model-cache";
export { DEFAULT_RERANK_MODEL } from "./rerank";

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
  return {
    key: "local-light",
    embed: createLocalLightEmbed(cache),
    rerank: createLocalLightRerank(cache),
    imageEmbed: createLocalLightImageEmbed(cache),
  };
}
