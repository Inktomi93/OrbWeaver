// Boot step: the #2253 stale-join_seq DATA repair. Before eba8ef526 the `canonHeadSeq` subquery inside
// `insertMemberAfterInviteClaimStatement` was unqualified, resolving against the global max(messages.seq)
// instead of the per-chat max. Invite-redeemed seats therefore recorded a join_seq equal to the table-wide
// canon head — potentially far above their own chat's highest message seq. The symptom: a `from-join`
// member's history floor was artificially high, making the room appear empty or showing fewer messages
// than the member should see.
//
// THE REPAIR: clamp every human participant's join_seq to the per-chat canon head. A join_seq above the
// chat's own max(messages.seq) is definitionally stale: no message in that room has that seq, so the floor
// is meaningless. Clamping to the actual per-chat head is safe and conservative — the member sees at most
// as much as a fresh joiner would. Idempotent: a row whose join_seq already <= the per-chat head is not
// touched (the WHERE excludes it), and a second boot finds zero candidates.

import type { Db } from "@orb/db";
import { sql } from "drizzle-orm";
import { getLog } from "#foundation/observability";

export interface RepairStaleJoinSeqDeps {
  readonly db: Db;
}

/** Clamp stale join_seq values to the per-chat canon head. Returns the count of repaired rows. */
export async function repairStaleJoinSeqOnBoot(deps: RepairStaleJoinSeqDeps): Promise<number> {
  // A single UPDATE with a correlated subquery: set join_seq = per-chat max(seq) for every row where
  // join_seq exceeds it. The coalesce handles the edge case of a chat with zero messages (seq 0).
  const result = await deps.db.run(sql`
    UPDATE chat_participants
    SET join_seq = (
      SELECT coalesce(max(seq), 0)
      FROM messages
      WHERE messages.chat_id = chat_participants.chat_id
    )
    WHERE join_seq > (
      SELECT coalesce(max(seq), 0)
      FROM messages
      WHERE messages.chat_id = chat_participants.chat_id
    )
  `);
  const repaired = result.rowsAffected;
  if (repaired > 0) {
    getLog().info({ repaired }, "boot/repair-stale-join-seq: clamped %d participant(s) with stale join_seq to per-chat canon head (#2253)");
  }
  return repaired;
}
