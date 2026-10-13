// Shipped readers are injected; this consumer derives the bytes/mime it actually passes to the asset store.

import type { SeededPlateAsset, StoreParams } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterHandle, CharacterId } from "@orb/kit/ids";
import type { AssetsService } from "./service.ts";

export interface SeedArtDeps {
  readonly store: AssetsService["store"];
  readonly addToGallery: AssetsService["addToGallery"];
  readonly readAvatar: (handle: CharacterHandle) => Promise<Pick<StoreParams, "bytes" | "mime"> | null>;
}
export interface SeedAvatarOps {
  readonly character: {
    readonly storeAvatar: (principal: Principal, handle: CharacterHandle) => Promise<AssetId | null>;
    readonly seedGallery: (principal: Principal, characterId: CharacterId, handle: CharacterHandle) => Promise<void>;
  };
  readonly persona: {
    readonly storeAvatar: (principal: Principal) => Promise<AssetId | null>;
  };
}
export interface SeedPlateStoreDeps {
  readonly store: AssetsService["store"];
  readonly readPlate: (slug: string) => Promise<Pick<StoreParams, "bytes" | "mime"> | null>;
}
export type StoreSeedPlate = (principal: Principal, slug: string) => Promise<SeededPlateAsset | null>;
