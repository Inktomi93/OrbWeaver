// infra/providers/backends/local-light/matte — the local-light background-removal (alpha-matte) op
// (expressions-design/03 §4.1). A thin transform over the shared model cache, mirroring
// `createLocalLightRerank(cache)`: resolve the model id (RMBG-1.4 default), honor the AbortSignal at the call
// boundaries, and delegate the transformers.js segmentation + PNG encode to the cache. NOT a `PROVIDER_ROLES`
// member (the §4.1 LEAN — one backend, one consumer, no dispatch choice): compose binds it as a narrow
// local-light op and passes it to expressions ONLY when local-light is configured. If a SECOND matte backend
// ever matters, the D39 role-add template applies and `matte` becomes a real role.

import type { LocalLightModelCache } from "./model-cache";
import { resolveModelId, throwIfAborted } from "./model-cache";

/** The canonical transformers.js background-removal ONNX model (image-segmentation; marinara's
 *  `tryRemoveBackgroundWithBackgroundRemover` capability analog). Overridable via `opts.model`. */
export const DEFAULT_MATTE_MODEL = "briaai/RMBG-1.4";

/** Bind the alpha-matte op to a model cache (the real transformers.js cache, or a test fake). The op is
 *  expressions' `MatteModelOp` structural twin (infra declares no domain type + no exported alias — the return
 *  type is inlined, mirroring `createLocalLightRerank`): image bytes in → alpha-matted PNG bytes out. */
export function createLocalLightMatte(
  cache: LocalLightModelCache,
): (bytes: Uint8Array, opts?: { model?: string; signal?: AbortSignal }) => Promise<Uint8Array> {
  return async (bytes, opts) => {
    throwIfAborted(opts?.signal);
    const modelId = resolveModelId(opts?.model ?? "", DEFAULT_MATTE_MODEL);
    const out = await cache.removeBackground(modelId, bytes);
    throwIfAborted(opts?.signal);
    return out;
  };
}
