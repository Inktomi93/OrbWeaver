// domain/stats/substrate/owner-chat-scope — the ONE definition of "the owner's chats" for this domain: a
// pure SQL fragment (zero I/O, no `Db`), so it lands in substrate/ rather than persistence/ and both the
// on-read scans (persistence/) and the rollup rebuild (write/) bind the IDENTICAL predicate instead of
// re-spelling it. It moved here from `write/rebuild-from-canon.ts` (#1477) after the heatmap was found
// carrying its own copy WITHOUT the husk arm: any husk room with a seeded greeting counted in the heatmap
// and nowhere else, so one dashboard tile disagreed with overview/temporal/economics/rollups.
//
// A chat has no `ownerId` (D18) — ownership is INHERITED, derived through the participant junction to an
// owned character.
//
// THE HUSK ARM (R0 §4.7) IS HALF OF A CONTRACT, not a local filter. An unclaimed room (`chats.started_at`
// NULL) is one the user never started: the LIVE plane pushes zero deltas for it (the creation deltas moved
// off `startChat` onto the claim chokepoint, `domain/chat/verbs/claim-chat.ts`, and its seeded greetings are
// replayed there too). If a stats reader or writer kept counting husks, the two writers would disagree the
// moment any husk existed and the drift gate would red — a correct fix on one side of a two-writer contract
// is a defect. The same arm is on the live firstness probe
// (`domain/chat/persistence/participants-read.ts`).

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** The owner's chat ids as a subquery fragment — `… WHERE m.chat_id IN (${ownerChatIds(ownerId)})`.
 *  Membership-derived (an owned `character` participant) and husk-excluding, per the contract above. */
export function ownerChatIds(ownerId: string): SQL {
  return sql`
    SELECT DISTINCT cp.chat_id FROM chat_participants cp
    JOIN characters c ON c.id = cp.character_id
    JOIN chats ch ON ch.id = cp.chat_id
    WHERE c.owner_id = ${ownerId} AND cp.kind = 'character' AND ch.started_at IS NOT NULL
  `;
}
