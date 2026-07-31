// @orb/db/kit canon-visibility — the SQL twin of `isStateAnchorSlot` (`@orb/contracts/chat`).
//
// An rpg STATE-ANCHOR is an EMPTY-body assistant slot minted only to KEY a snapshot: `resyncFromStory` and
// `editSnapshot` post `postNarratorMessage(chatId, "")` and write the rebuilt state onto that slot's
// variant. It is durable canon that no reader ever sees — so it must not be COUNTED as a message, and it
// must not bump "last activity" either (a silent state write is not a beat in the conversation).
//
// Homed in `db` because two domains need it (chat's list chrome, automation's CEL `chat.messageCount`) and
// a domain→domain import is illegal. The predicate reads `message_variants.content`, so a caller MUST have
// joined the SELECTED variant (`messages.selectedVariantId`) — the same `innerJoin` every canon read
// already does, which is why applying this drops nothing a reader could see.
//
// Kept in lockstep with `isStateAnchorSlot` BY DEFINITION, not by convention: both are "the trimmed body is
// empty". SQLite's `trim()` strips spaces only, while JS `.trim()` also strips \t/\n/\r — a body of pure
// newlines would count here and hide there. That divergence is unreachable: an anchor's body is the empty
// string literal, and no writer commits a whitespace-only generation. If one ever does, widen this to
// `trim(content, ' ' || char(9) || char(10) || char(13))` rather than letting the two drift.

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { messageVariants } from "../schema/chat";

/** `true` for a canon row a reader actually sees — i.e. NOT an rpg state-anchor slot. Requires the selected
 *  `message_variants` row to be joined. Use in any COUNT / MAX(created_at) / aggregate over canon. */
export function notStateAnchor(): SQL {
  return sql`trim(${messageVariants.content}) <> ''`;
}
