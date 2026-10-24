// Portable subject handles are resolved under the export owner, never from a bare character id.
import { portableCharacterHandle } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

const LIMIT_ONE = 1;

/** The handle the subject's exported card carries, so the restore re-links to the card it restored. A
 *  synthetic group row names no card, so it exports as no subject. */
export async function loadOwnedGalleryCharacterHandle(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CharacterHandle | null> {
  const rows = await db
    .select({ handle: characters.handle })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId), eq(characters.synthetic, false)))
    .limit(LIMIT_ONE);
  const handle = rows[0]?.handle;
  return handle === undefined ? null : portableCharacterHandle(handle);
}
