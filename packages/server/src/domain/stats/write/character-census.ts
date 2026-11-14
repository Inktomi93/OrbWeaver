// The live moves of `owner_stats.characters` that no `StatsDelta` can carry: a delete and a handoff re-point change
// the count only when ONE character's seats change, so each op decides inside its own statement from the same relation
// the rebuild counts (`characterHoldsRetainedSeat`). A delta's `newCharacter` is unconditional and only adds.
// Both ops assume the owner's `owner_stats` row exists: a counted character was seated by a write that created it.

import type { ShiftCharacterCensus } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, not, sql } from "drizzle-orm";
import { characterHoldsRetainedSeat } from "../persistence/owner-chat-scope.ts";
import { bumpStatsCanonVersion } from "./apply-delta.ts";

/** Lower the count when the character about to be deleted holds a seat. Must precede the delete: the cascade removes
 *  the seats the guard reads. */
export function retireCharacterCensus(
  batch: BatchStmt[],
  db: Db,
  { ownerId, characterId }: { readonly ownerId: UserId; readonly characterId: CharacterId },
): void {
  bumpStatsCanonVersion(batch, db, ownerId);
  batch.push(
    batchStmt(
      db
        .update(ownerStats)
        .set({ characters: sql`${ownerStats.characters} - 1` })
        .where(and(eq(ownerStats.ownerId, ownerId), characterHoldsRetainedSeat(ownerId, characterId))),
    ),
  );
}

/** Move the count with one character's seat in `chatId`, unless another started room already holds it there. */
export const shiftCharacterCensus: ShiftCharacterCensus<BatchStmt[], Db> = (batch, db, { ownerId, characterId, chatId, direction }): void => {
  batch.push(
    batchStmt(
      db
        .update(ownerStats)
        .set({ characters: sql`${ownerStats.characters} + ${direction}` })
        .where(and(eq(ownerStats.ownerId, ownerId), not(characterHoldsRetainedSeat(ownerId, characterId, chatId)))),
    ),
  );
};
