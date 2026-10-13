// The owner is resolved before storing response-controlled bytes; magic and the live byte cap remain mandatory.
import type { GeneratedStoreDeps, StoreGeneratedImage } from "../contract/generated-store.ts";

export function createStoreGeneratedImage(deps: GeneratedStoreDeps): StoreGeneratedImage {
  return async (ownerId, bytes, mime): ReturnType<StoreGeneratedImage> =>
    deps.store({ principal: await deps.resolvePrincipal(ownerId), bytes, kind: "generated", mime, enforceMagic: true, maxBytes: deps.maxBytes() });
}
