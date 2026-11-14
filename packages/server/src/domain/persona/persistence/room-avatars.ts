// The persona read behind chat's co-participant art gate: the avatar of each worn or pinned persona chat names. It
// takes no owner term because the gate serves a co-member's persona art to the room, and a held pin's art past its
// owner (D315); it answers only for the ids it is given, and the room scope is the gate's.

import { personas } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, PersonaId } from "@orb/kit/ids";
import { inArray } from "drizzle-orm";

/** The avatar of each of `personaIds` that has one. */
export function createLoadPersonaAvatars(handle: DatabaseHandle): (personaIds: readonly PersonaId[]) => Promise<ReadonlyMap<PersonaId, AssetId>> {
  const db = databaseForOwner(handle);
  return async (personaIds) => {
    const avatars = new Map<PersonaId, AssetId>();
    if (personaIds.length === 0) {
      return avatars;
    }
    const rows = await db
      .select({ id: personas.id, avatarAssetId: personas.avatarAssetId })
      .from(personas)
      .where(inArray(personas.id, [...personaIds]));
    for (const row of rows) {
      if (row.avatarAssetId !== null) {
        avatars.set(row.id, row.avatarAssetId);
      }
    }
    return avatars;
  };
}
