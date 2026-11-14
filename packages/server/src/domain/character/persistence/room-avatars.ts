// The character read behind chat's co-participant art gate: the avatar of each rostered character chat names. It takes
// no owner term because the gate serves a co-member's card art to the room; it answers only for the ids it is given,
// and the room scope is the gate's.

import { characters } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { inArray } from "drizzle-orm";

/** The avatar of each of `characterIds` that has one. */
export function createLoadCharacterAvatars(handle: DatabaseHandle): (characterIds: readonly CharacterId[]) => Promise<ReadonlyMap<CharacterId, AssetId>> {
  const db = databaseForOwner(handle);
  return async (characterIds) => {
    const avatars = new Map<CharacterId, AssetId>();
    if (characterIds.length === 0) {
      return avatars;
    }
    const rows = await db
      .select({ id: characters.id, avatarAssetId: characters.avatarAssetId })
      .from(characters)
      .where(inArray(characters.id, [...characterIds]));
    for (const row of rows) {
      if (row.avatarAssetId !== null) {
        avatars.set(row.id, row.avatarAssetId);
      }
    }
    return avatars;
  };
}
