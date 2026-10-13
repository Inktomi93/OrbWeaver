// The owner is resolved before storing response-controlled bytes; magic and the live byte cap remain mandatory.
import type { StoreAsset } from "@orb/contracts/assets";
import type { GeneratedAssetStore, GeneratedStoreDeps, StoreGeneratedImage } from "../contract/generated-store.ts";

export function createGeneratedAssetStore(store: StoreAsset): GeneratedAssetStore {
  return (principal, bytes, kind, mime) => store({ principal, bytes, kind, mime, enforceMagic: true });
}

export function createStoreGeneratedImage(deps: GeneratedStoreDeps): StoreGeneratedImage {
  const store = createGeneratedAssetStore((params) => deps.store({ ...params, maxBytes: deps.maxBytes() }));
  return async (ownerId, bytes, mime): ReturnType<StoreGeneratedImage> => store(await deps.resolvePrincipal(ownerId), bytes, "generated", mime);
}
