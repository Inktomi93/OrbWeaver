// Bundled avatars and galleries pass through the same Principal and magic-byte guard as an upload.

import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SeedArtDeps, SeedAvatarOps, SeedPlateStoreDeps, StoreSeedPlate } from "../contract/seed-art.ts";

// A shipped file key, not a persona name; changing it requires a pack migration.
const PERSONA_SEED_AVATAR = castId<CharacterHandle>("persona-you");

export function createSeedAvatarOps(deps: SeedArtDeps): SeedAvatarOps {
  const storeSeedAvatar = async (principal: Principal, handle: CharacterHandle): Promise<AssetId | null> => {
    const art = await deps.readAvatar(handle);
    if (art === null) {
      return null;
    }
    const stored = await deps.store({ principal, bytes: art.bytes, kind: "avatar", mime: art.mime, enforceMagic: true });
    return stored.assetId;
  };
  return {
    character: {
      storeAvatar: storeSeedAvatar,
      seedGallery: async (principal, characterId, handle): Promise<void> => {
        const assetId = await storeSeedAvatar(principal, handle);
        if (assetId !== null) {
          await deps.addToGallery({ principal, assetId, subjectCharacterId: characterId });
        }
      },
    },
    persona: { storeAvatar: (principal) => storeSeedAvatar(principal, PERSONA_SEED_AVATAR) },
  };
}

export function createSeedPlateStore(deps: SeedPlateStoreDeps): StoreSeedPlate {
  return async (principal, slug) => {
    const art = await deps.readPlate(slug);
    if (art === null) {
      return null;
    }
    const stored = await deps.store({ principal, bytes: art.bytes, kind: "background", mime: art.mime, enforceMagic: true });
    return { assetId: stored.assetId, assetHash: stored.hash, mime: art.mime };
  };
}
