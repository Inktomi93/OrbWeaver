// Shipped readers are injected; this consumer derives the bytes/mime it actually passes to the asset store.

import type { SeedCharacterGallery, StoreParams, StoreSeedCharacterAvatar, StoreSeedPersonaAvatar } from "@orb/contracts/assets";
import type { CharacterHandle } from "@orb/kit/ids";
import type { AssetsService } from "./service.ts";

export interface SeedArtDeps {
  readonly store: AssetsService["store"];
  readonly addToGallery: AssetsService["addToGallery"];
  readonly readAvatar: (handle: CharacterHandle) => Promise<Pick<StoreParams, "bytes" | "mime"> | null>;
}
export interface SeedAvatarOps {
  readonly character: {
    readonly storeAvatar: StoreSeedCharacterAvatar;
    readonly seedGallery: SeedCharacterGallery;
  };
  readonly persona: {
    readonly storeAvatar: StoreSeedPersonaAvatar;
  };
}
export interface SeedPlateStoreDeps {
  readonly store: AssetsService["store"];
  readonly readPlate: (slug: string) => Promise<Pick<StoreParams, "bytes" | "mime"> | null>;
}
