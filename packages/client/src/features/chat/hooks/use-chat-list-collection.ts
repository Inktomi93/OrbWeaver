// The ONE paged chat-library read — `createCollectionSurface` over `chat.listChats`'s keyset (the
// `character.list` / `databank.list` precedent). Shared by the chats pane and the character screen's chats
// projection, so the two lists of the same rows can never drift into different page sizes, a different
// tail-fetch guard, or a suspending variant.
//
// WHY IT EXISTS: `listChats` used to serve the caller's ENTIRE membership list, and every row costs the verb
// a per-chat participant resolve — an 872-chat import turned one pane mount into ~880 queries and ~872
// rendered rows. The read is now a keyset page and the rows ride `<VirtualList>`.
//
// BOTH narrowing axes resolve SERVER-side, and both are part of the query INPUT — so they are part of the
// key, and changing either resets the pages rather than filtering a stale set:
//   • `characterId` — the D18 projection ("chats with her"). It used to be a client `.filter()` over the
//     whole library (`lib/chats-with-character.ts`, deleted), the exact pull-everything-to-show-three shape
//     the paging exists to kill. `null` is the unprojected library.
//   • `search` — the chat search box (owner ruling 2026-08-09). Client-side filtering over a KEYSET list can
//     only ever search what it has fetched, so the predicate moved to the server whole: title OR character
//     seat name OR the newest message's body (`filter-chats.ts`, deleted). Pass the DEBOUNCED value —
//     every distinct string here is a round trip. `""` is the unsearched list.

import type { CharacterId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createCollectionSurface } from "#data";

/** Rows per fetch. The server clamps at 100; 50 is `character.list`'s own default, kept identical so the two
 *  library reads cost the same per page. */
const CHAT_LIST_PAGE_SIZE = 50;

/** Pages kept mounted before TanStack's window drops the HEAD page.
 *
 *  NOTE (2026-08-13): the character library dropped its identical cap, because with
 *  `getPreviousPageParam: () => undefined` an evicted head page is unrecoverable — rows vanish off the top
 *  of a deep scroll. The same trap is live here (250 rows deep); it is left for the chat lane to retire
 *  rather than changed from the character-tab lane, and this note exists so the next reader does not take
 *  the cap for a considered chats-side decision. */
const MAX_PAGES = 5;

// Derived, not exported: `no-inline-types` keeps a feature's exported shapes in its contract home, and the
// row type is a one-line `inferOutput` every consumer already spells for itself (chat-list-row.tsx,
// chat-summary-row.ts) — a second exported name for the same wire row would be the doubling that rule exists
// to stop.
type ChatListPage = inferOutput<Trpc["chat"]["listChats"]>;
type ChatListItem = ChatListPage["items"][number];

export const useChatListCollection = createCollectionSurface({
  query: (trpc: Trpc, params: { readonly characterId: CharacterId | null; readonly search: string }) =>
    trpc.chat.listChats.infiniteQueryOptions(
      {
        limit: CHAT_LIST_PAGE_SIZE,
        ...(params.characterId === null ? {} : { characterId: params.characterId }),
        ...(params.search === "" ? {} : { search: params.search }),
      },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        getPreviousPageParam: () => undefined,
        maxPages: MAX_PAGES,
      },
    ),
  itemsOf: (page: ChatListPage) => page.items,
  idOf: (item: ChatListItem) => item.id,
});
