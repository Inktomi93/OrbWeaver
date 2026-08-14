// The Chats section's `useSelectionTitle` — what the mobile pushed frame's topbar calls the open room
// (side-eye P2: a pushed detail must name the MEMBER, not the section). Cache-first and NON-suspending: it
// shares the read the room itself already made, so it is a cache hit; `null` = the landing, where the shell
// prints the section label.
//
// ONE ARM (chat-creation-draft-mode-replacement.md §4.1, R1). It had two, because a room had two lives and
// the pre-send one had no row to read a title off — and the two arms had already drifted once (a group draft
// read `cast[0]` on the phone and the joined cast on the desktop, side-eye 2026-08-07 finding 1). A room has
// a row from the creation click, so there is one arm and nothing left to keep in lockstep.

import { useGatedQuery, useTRPC } from "#data";
import { useActiveChatId } from "#state";

export function useChatsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const title = data?.title ?? "";
  return title.length === 0 ? null : title;
}
