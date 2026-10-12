// The owner-scoped character reads other domains gate on: the gallery subject, imagery's auto-add and a saved
// party's members. A foreign key proves the row exists, never that the caller owns it.

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";

const LIMIT_ONE = 1;

/** Does `ownerId` own `characterId`? Absent and foreign both answer `false`. */
export function createCharacterOwned(db: Db): (ownerId: UserId, characterId: CharacterId) => Promise<boolean> {
  return async (ownerId, characterId) => {
    const rows = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
      .limit(LIMIT_ONE);
    return rows.length > 0;
  };
}

/** The subset of `characterIds` that `ownerId` owns; absent and foreign ids drop out. */
export function createOwnedCharacterIds(db: Db): (ownerId: UserId, characterIds: readonly CharacterId[]) => Promise<readonly CharacterId[]> {
  return async (ownerId, characterIds) => {
    if (characterIds.length === 0) {
      return [];
    }
    const rows = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(inArray(characters.id, [...characterIds]), eq(characters.ownerId, ownerId)));
    return rows.map((row) => row.id);
  };
}
