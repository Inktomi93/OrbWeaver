// @orb/contracts/chat/listing — the `listChats` KEYSET wire (the character-list precedent, `@orb/contracts/
// character`'s `characterListCursorSchema`). A membership list is unbounded by construction — an 872-chat
// library pulled every row, and each row costs `buildSummaries` a per-chat participant read — so the read is
// paged and the cursor shape is a cross-boundary contract, not a router local.
//
// ONE sort, so the cursor is a plain object rather than character's sort-discriminated union: `listChats` is
// newest-CONVERSATION-first and nothing offers another order (the star is a MARKER, never a sort key — the
// ruling the chats pane and the character projection both render under). `id` is the
// tiebreak, not decoration: the recency stamp is a millisecond value a bulk import stamps identically across
// hundreds of rows, and a keyset without a unique tail silently skips or repeats rows at the page seam.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The `listChats` page CEILING, enforced at the transport trust boundary (the `character.list` /
 *  `CHARACTER_LIST_MAX_LIMIT` precedent): an over-bound ask is a BAD_REQUEST naming the bound, never a
 *  silently trimmed page. Each row costs `buildSummaries` a per-chat participant resolve (~100 extra queries
 *  at this ceiling), so it is a real cap, not advice — the same 100 the domain DoS backstop (`read.ts`
 *  `Math.min` clamp for internal callers) references, homed HERE so the two never drift. */
export const CHAT_LIST_MAX_LIMIT = 100;

/** The keyset boundary — the LAST row of the page just served, in the list's own `(recencyAt, id)` order.
 *
 *  `recencyAt` is the list's ONE recency clock (#150): the room's newest message time, falling back to the
 *  chat row's `updatedAt` when it has none — the same value every row DISPLAYS. It was spelled `updatedAt`
 *  while the list sorted on the row stamp; the field is renamed rather than reused because a cursor whose
 *  name no longer describes its column is how the next reader re-derives it from the wrong one. */
export const chatListCursorSchema = z.object({
  recencyAt: z.number().int(),
  id: typeIdSchema(ID_PREFIX.chat),
});
export type ChatListCursor = z.infer<typeof chatListCursorSchema>;
