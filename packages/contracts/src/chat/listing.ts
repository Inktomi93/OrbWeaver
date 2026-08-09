// @orb/contracts/chat/listing — the `listChats` KEYSET wire (the character-list precedent, `@orb/contracts/
// character`'s `characterListCursorSchema`). A membership list is unbounded by construction — an 872-chat
// library pulled every row, and each row costs `buildSummaries` a per-chat participant read — so the read is
// paged and the cursor shape is a cross-boundary contract, not a router local.
//
// ONE sort, so the cursor is a plain object rather than character's sort-discriminated union: `listChats` is
// newest-updated-first and nothing offers another order (the star is a MARKER, never a sort key — the
// list-pane-projection D4 ruling the chats pane and the character projection both render under). `id` is the
// tiebreak, not decoration: `chats.updated_at` is a millisecond stamp a bulk import stamps identically across
// hundreds of rows, and a keyset without a unique tail silently skips or repeats rows at the page seam.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The keyset boundary — the LAST row of the page just served, in the list's own `(updatedAt, id)` order. */
export const chatListCursorSchema = z.object({
  updatedAt: z.number().int(),
  id: typeIdSchema(ID_PREFIX.chat),
});
export type ChatListCursor = z.infer<typeof chatListCursorSchema>;
