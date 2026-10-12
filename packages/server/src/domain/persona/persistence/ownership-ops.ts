// The owner-scoped persona read other domains gate on: a room's persona reattribution and a saved party's
// anchor persona. A foreign key proves the row exists, never that the caller owns it.

import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

/** Does `ownerId` own `personaId`? Absent and foreign both answer `false`, so the answer leaks nothing. */
export function createPersonaOwned(db: Db): (ownerId: UserId, personaId: PersonaId) => Promise<boolean> {
  return async (ownerId, personaId) => {
    const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(LIMIT_ONE);
    return rows[0]?.ownerId === ownerId;
  };
}
