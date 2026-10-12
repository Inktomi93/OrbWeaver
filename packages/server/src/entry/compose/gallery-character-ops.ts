// The character id <-> handle ops the gallery export and import verbs need. Kept apart from the assets seam so
// the gallery tests run these exact ops instead of copies.

import type { Db } from "@orb/db";
import { characters as charactersTable } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { AssetsContext } from "#domain/assets";
import type { CharacterService } from "#domain/character";

const LIMIT_ONE = 1;

/**
 * Export resolves a subject id to its handle; import re-links a handle to the importing OWNER's character, so a
 * handle another user owns never re-links (the owner scope rides `character.findByHandle`).
 */
export function createGalleryCharacterOps(
  db: Db,
  character: Pick<CharacterService, "findByHandle">,
): Required<Pick<AssetsContext, "resolveCharacterHandle" | "findCharacterByHandle">> {
  return {
    // @orb-waive compose-wiring-only(resolveCharacterHandle): baselined when the gate landed; burn-down item 964.
    resolveCharacterHandle: async (characterId): Promise<string | null> => {
      // @orb-waive owner-scoped-reads(charactersTable): the ids are the exporting owner's own `gallery_items` subjects, written only by `addToGallery` (gated by `assertCharacterOwned`, assets-character compose) and by the gallery import (`restoreItem` relinks a handle through the owner-scoped `findCharacterByHandle({ ownerId, handle })`), so they are already-authorized canon, never caller input. Ends if a gallery subject can be written another way.
      const rows = await db.select({ handle: charactersTable.handle }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(LIMIT_ONE);
      return rows[0]?.handle ?? null;
    },
    // @orb-waive compose-wiring-only(findCharacterByHandle): baselined when the gate landed; burn-down item 964.
    findCharacterByHandle: async ({ ownerId, handle }): Promise<CharacterId | null> => {
      const ref = await character.findByHandle({ ownerId, handle });
      return ref?.characterId ?? null;
    },
  };
}
