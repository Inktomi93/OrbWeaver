// Bind the real shipped reader to the asset owner's art policy; no filesystem or storage rule lives here.

import { readSeedAvatar } from "@orb/default-content";
import type { AssetsService, SeedAvatarOps } from "#domain/assets";
import { createSeedAvatarOps as createOwnedSeedAvatarOps } from "#domain/assets";

export function createSeedAvatarOps(assets: Pick<AssetsService, "store" | "addToGallery">): SeedAvatarOps {
  return createOwnedSeedAvatarOps({
    readAvatar: readSeedAvatar,
    store: (params) => assets.store(params),
    addToGallery: (params) => assets.addToGallery(params),
  });
}
