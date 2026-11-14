// The live move of `owner_stats.characters` that no `StatsDelta` can carry: a delete changes the count only when the
// deleted character was counted, so the op decides inside its own statement from the same relation the rebuild counts
// (`characterHoldsRetainedSeat`). A delta's `newCharacter` is unconditional and only adds.
// The op assumes the owner's `owner_stats` row exists: a counted character was seated by a write that created it.

import type { RetireCharacterCensus } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import { and, eq, sql } from "drizzle-orm";
import { characterHoldsRetainedSeat } from "../persistence/owner-chat-scope.ts";
import { bumpStatsCanonVersion } from "./apply-delta.ts";

/** Lower the count when the character about to be deleted holds a seat. Must precede the delete: the cascade removes
 *  the seats the guard reads. */
export const retireCharacterCensus: RetireCharacterCensus<BatchStmt[], Db> = (batch, db, { ownerId, characterId }): void => {
  bumpStatsCanonVersion(batch, db, ownerId);
  batch.push(
    batchStmt(
      db
        .update(ownerStats)
        .set({ characters: sql`${ownerStats.characters} - 1` })
        .where(and(eq(ownerStats.ownerId, ownerId), characterHoldsRetainedSeat(ownerId, characterId))),
    ),
  );
};
