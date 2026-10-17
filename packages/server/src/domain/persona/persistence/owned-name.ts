import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { findOwnedPersonaByName } from "./queries.ts";

/** Bind the same owned-name lookup the persona import uses, without exposing its query connection. */
export function createFindOwnedPersonaByName(handle: DatabaseHandle): (ownerId: UserId, name: string) => Promise<PersonaId | null> {
  const db = databaseForOwner(handle);
  return (ownerId, name) => findOwnedPersonaByName(db, ownerId, name);
}
