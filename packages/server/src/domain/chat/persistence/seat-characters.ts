// The one gate every seat writer that takes a caller-named character id runs before a row is written.
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import { chunkRows } from "@orb/db/query";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";

// Budget a scope bind alongside each varying value, so the statement's fixed scope always fits too.
const SCOPED_FILTER_BIND_BUDGET = 2;

/** Refuse any id that is not one of `ownerId`'s own non-synthetic characters, with the leak-free not-found a
 *  stranger's id gets. Bounded reads preserve the first missing id's input order.
 *  SECURITY: a synthetic group row is room machinery whose id narrator messages expose; seated, it becomes a
 *  card a handoff copies and the room's narrator identity squats a seat. */
export async function assertSeatableCharacters(db: Db, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<void> {
  for (const ids of chunkRows(characterIds, SCOPED_FILTER_BIND_BUDGET)) {
    // parameter-safe chunks complete the gate before any canon write. Ends if the driver lifts its bind cap.
    const seatable = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(inArray(characters.id, ids), eq(characters.ownerId, ownerId), eq(characters.synthetic, false)));
    // query-local membership Set over this chunk's returned rows. Ends if it outlives the call.
    const seatableIds = new Set(seatable.map((row) => row.id));
    for (const characterId of ids) {
      if (!seatableIds.has(characterId)) {
        throw new DomainNotFoundError("character", characterId);
      }
    }
  }
}
