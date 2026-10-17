// The owner-scoped persona read other domains gate on: a room's persona reattribution and a saved party's
// anchor persona. A foreign key proves the row exists, never that the caller owns it.

import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { isPersonaOwned } from "./queries.ts";

/** Does `ownerId` own `personaId`? Absent and foreign both answer `false`, so the answer leaks nothing. */
export function createPersonaOwned(handle: DatabaseHandle): (ownerId: UserId, personaId: PersonaId) => Promise<boolean> {
  const db = databaseForOwner(handle);
  return (ownerId, personaId) => isPersonaOwned(db, ownerId, personaId);
}
