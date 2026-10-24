// The one gate every seat writer runs before a character row is seated, including a fork's copied seats.
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import { chunkRows } from "@orb/db/query";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";

// Budget a scope bind alongside each varying value, so the statement's fixed scope always fits too.
const SCOPED_FILTER_BIND_BUDGET = 2;

/** The subset of `characterIds` that are `ownerId`'s own non-synthetic characters.
 *  SECURITY: a synthetic group row is room machinery whose id narrator messages expose; seated, it becomes a
 *  card a handoff copies and the room's narrator identity squats a seat. */
export async function seatableCharacterIds(db: Db, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<ReadonlySet<CharacterId>> {
  // query-local membership Set over the returned rows. Ends if it outlives the call.
  const seatable = new Set<CharacterId>();
  for (const ids of chunkRows(characterIds, SCOPED_FILTER_BIND_BUDGET)) {
    // parameter-safe chunks complete the read before any canon write. Ends if the driver lifts its bind cap.
    const rows = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(inArray(characters.id, ids), eq(characters.ownerId, ownerId), eq(characters.synthetic, false)));
    for (const row of rows) {
      seatable.add(row.id);
    }
  }
  return seatable;
}

/** Refuse any id {@link seatableCharacterIds} drops, with the leak-free not-found a stranger's id gets, naming
 *  the first such id in input order. */
export async function assertSeatableCharacters(db: Db, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<void> {
  const seatable = await seatableCharacterIds(db, ownerId, characterIds);
  const refused = characterIds.find((characterId) => !seatable.has(characterId));
  if (refused !== undefined) {
    throw new DomainNotFoundError("character", refused);
  }
}
