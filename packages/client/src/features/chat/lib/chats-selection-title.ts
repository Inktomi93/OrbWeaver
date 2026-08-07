// The Chats section's `useSelectionTitle` — what the mobile pushed frame's topbar calls the open room
// (side-eye P2: a pushed detail must name the MEMBER, not the section). Cache-first and NON-suspending: it
// shares the `chat.getChat` read the room itself already made, so this is a cache hit; until it lands it
// answers `null` and the shell prints the section label rather than a blank bar. `useGatedQuery` keeps the
// hook unconditional while nothing is open (the landing, or an uncommitted draft with no row yet).

import { useGatedQuery, useTRPC } from "#data";
import { useActiveChatId } from "#state";

export function useChatsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const title = data?.title ?? "";
  return title.length === 0 ? null : title;
}
