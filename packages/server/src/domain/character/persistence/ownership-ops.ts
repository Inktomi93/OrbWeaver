// The owner-scoped character reads other domains gate on: the gallery subject, imagery's auto-add and a saved
// party's members. A foreign key proves the row exists, never that the caller owns it.

import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { listOwnedCharacterRows, loadOwnedCharacterRow } from "./queries.ts";

/** Does `ownerId` own `characterId`? Absent and foreign both answer `false`. */
export function createCharacterOwned(handle: DatabaseHandle): (ownerId: UserId, characterId: CharacterId) => Promise<boolean> {
  const db = databaseForOwner(handle);
  return async (ownerId, characterId) => (await loadOwnedCharacterRow(db, ownerId, characterId)) !== undefined;
}

/** The subset of `characterIds` that `ownerId` owns; absent and foreign ids drop out. */
export function createOwnedCharacterIds(handle: DatabaseHandle): (ownerId: UserId, characterIds: readonly CharacterId[]) => Promise<readonly CharacterId[]> {
  const db = databaseForOwner(handle);
  return async (ownerId, characterIds) => (await listOwnedCharacterRows(db, ownerId, characterIds)).map((row) => row.id);
}
