// Portable gallery subjects resolve in the owner's character library in both directions.
import type { Db } from "@orb/db";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import type { GalleryCharacterOps } from "../contract/gallery-character-ops.ts";
import type { FindByHandleParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { loadOwnedGalleryCharacterHandle } from "../persistence/gallery-character.ts";

export function createGalleryCharacterOps(db: Db, character: Pick<CharacterService, "findByHandle">): GalleryCharacterOps {
  return {
    resolveCharacterHandle: (ownerId: UserId, characterId: CharacterId): Promise<CharacterHandle | null> =>
      loadOwnedGalleryCharacterHandle(db, ownerId, characterId),
    findCharacterByHandle: async (params: FindByHandleParams): Promise<CharacterId | null> => {
      const ref = await character.findByHandle(params);
      return ref?.characterId ?? null;
    },
  };
}
