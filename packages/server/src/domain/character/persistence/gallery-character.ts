// Portable subject handles are resolved under the export owner, never from a bare character id.
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

const LIMIT_ONE = 1;

export async function loadOwnedGalleryCharacterHandle(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CharacterHandle | null> {
  const rows = await db
    .select({ handle: characters.handle })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0]?.handle ?? null;
}
