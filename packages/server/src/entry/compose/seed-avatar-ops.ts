// The bundled-art ops the default character and persona seeders store their avatars and starter gallery
// through. Kept apart from the assets seam so the seeder suites run these exact ops instead of copies.

import type { Principal } from "@orb/contracts/identity";
import { readSeedAvatar } from "@orb/default-content";
import type { AssetId, CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AssetsService } from "#domain/assets";
import type { DefaultCharacterSeederDeps } from "#domain/character";
import type { DefaultPersonaSeederDeps } from "../boot/index.ts";

// A FILE key in the shipped art, not a display name: renaming it would be a pack migration.
const PERSONA_SEED_AVATAR = castId<CharacterHandle>("persona-you");

/** The seeders' art ops. A missing bundled file answers `null` or stores nothing, so a seed never blocks on art. */
export function createSeedAvatarOps(assets: Pick<AssetsService, "store" | "addToGallery">): {
  readonly character: Required<Pick<DefaultCharacterSeederDeps, "storeAvatar" | "seedGallery">>;
  readonly persona: Pick<DefaultPersonaSeederDeps, "storeAvatar">;
} {
  // `enforceMagic`: the shipped bytes pass the same sniff an upload does.
  // @orb-waive compose-wiring-only(storeSeedAvatar): baselined when the gate landed; burn-down item 964.
  const storeSeedAvatar = async (principal: Principal, handle: CharacterHandle): Promise<AssetId | null> => {
    const art = await readSeedAvatar(handle);
    if (art === null) {
      return null;
    }
    const stored = await assets.store({ principal, bytes: art.bytes, kind: "avatar", mime: art.mime, enforceMagic: true });
    return stored.assetId;
  };
  return {
    character: {
      storeAvatar: storeSeedAvatar,
      // @orb-waive compose-wiring-only(seedGallery): baselined when the gate landed; burn-down item 964.
      seedGallery: async (principal, characterId, handle): Promise<void> => {
        const assetId = await storeSeedAvatar(principal, handle);
        if (assetId !== null) {
          await assets.addToGallery({ principal, assetId, subjectCharacterId: characterId });
        }
      },
    },
    persona: { storeAvatar: (principal) => storeSeedAvatar(principal, PERSONA_SEED_AVATAR) },
  };
}
