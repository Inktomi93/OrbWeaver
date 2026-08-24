// The per-chat LOREBOOKS rack's pure model — the picker's offer set. Zero I/O, zero React: the value is a
// function of what the rack already fetched, so the section stays thin and the rule is unit-tested alone.
//
// WHY THIS FEATURE OWNS IT: chat, not world-info. Attaching a book to a room is HOST authority over a ROOM
// (`worldInfo.attachToChat` gates on the injected `requireChatHost`, and `detachFromChat` deliberately does
// NOT re-check book ownership so a host can always clean the room) — that is chat's authority model, and the
// write lives where the authority lives. It is the same placement `chat-documents-model.ts` records for the
// databank rack one section up. A tRPC call is a DATA seam, not a feature import
// (`client-features-no-cross` is satisfied by construction).

import type { WorldBookId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** One row of the caller's OWN library (`worldInfo.listBooks`). The verb is owner-scoped and UNPAGED — it
 *  returns the whole library — which is why this picker needs none of the server-side search the paged
 *  databank picker had to grow: there is no page for a candidate to fall off the end of. */
type OwnedBook = inferOutput<Trpc["worldInfo"]["listBooks"]>[number];

/**
 * The picker's offer set: the caller's own books minus the ones already attached to this room.
 *
 * The subtraction runs over the room's WHOLE attachment list, which is NOT owner-filtered (`listForChat`
 * returns every book the room carries, including one a previous host attached — the verb's own header says
 * so). So a book already feeding this room is never offered again, even when this caller does not own the
 * attachment that put it there; re-attaching would be a control whose only effect is an idempotent no-op.
 */
export function attachableBooks(library: readonly OwnedBook[], attachedIds: readonly WorldBookId[]): readonly OwnedBook[] {
  const attached = new Set(attachedIds);
  return library.filter((book) => !attached.has(book.id));
}
