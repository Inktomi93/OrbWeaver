// domain/stats/persistence/activity — per-character reply timeline straight from canon (character_stats is
// cumulative). Bucketed by UTC quarter-hour, so the client folds it into the viewer's months. Owner scope is the
// one-home membership definition in `substrate/owner-chat-scope.ts`, so a husk room is invisible here too.

import type { Db } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { STATS_BUCKET_MS } from "@orb/kit/stats-tally";
import { sql } from "drizzle-orm";
import type { MomentumBucket } from "../contract/views.ts";
import { ownerChatIds } from "../substrate/owner-chat-scope.ts";

/** The owner's characters' assistant replies per (character, UTC quarter-hour), ascending by bucket. */
export async function readMomentumBuckets(db: Db, ownerId: string): Promise<MomentumBucket[]> {
  // The CAST keeps the division integral whatever numeric type the driver binds the width as — the same
  // floor `statsBucketStart` applies to the rollup timeline.
  const rows = await db.all<{ characterId: string; name: string; bucketStart: number; replies: number }>(sql`
    SELECT m.character_id AS characterId, MIN(c.name) AS name,
           CAST(m.created_at / ${STATS_BUCKET_MS} AS INTEGER) * ${STATS_BUCKET_MS} AS bucketStart, COUNT(*) AS replies
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant'
      AND m.chat_id IN (${ownerChatIds(ownerId)})
    GROUP BY m.character_id, bucketStart
    ORDER BY bucketStart, m.character_id
  `);
  // Raw-SQL boundary mint: the id comes off the branded characters.id column, untyped through sql``.
  return rows.map((r) => ({ characterId: castId<CharacterId>(r.characterId), name: r.name, bucketStart: r.bucketStart, replies: r.replies }));
}
