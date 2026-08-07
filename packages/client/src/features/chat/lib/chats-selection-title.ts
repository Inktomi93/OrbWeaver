// The Chats section's `useSelectionTitle` — what the mobile pushed frame's topbar calls the open room
// (side-eye P2: a pushed detail must name the MEMBER, not the section). Cache-first and NON-suspending: it
// shares the reads the room itself already made, so both arms are cache hits; `null` = the landing, where
// the shell prints the section label.
//
// TWO ARMS, because a room has two lives (side-eye leg-4 P1: a mobile DRAFT's topbar read "Chats" — the
// SECTION — while the desktop header beside it read "Hana Mizushima". The committed arm was the only one
// wired, so every pre-send room fell through to the label):
//   · COMMITTED — the `chat.getChat` row's title.
//   · DRAFT — the founding cast's first name, else the word "New chat".
// The draft rule is `DraftChatHeader`'s OWN rule, deliberately: the desktop cluster and the mobile title are
// the same statement at two widths, so they resolve it the same way rather than each inventing a name.

import { useQueries } from "@tanstack/react-query";
import { useGatedQuery, useTRPC } from "#data";
import { isCommitted, isLanding, useActiveChatHandle, useActiveChatId, useActiveDraftFoundingCast } from "#state";

/** What `DraftChatHeader` calls a cast-less draft — one word, one home for the two surfaces that print it. */
const NEW_CHAT_TITLE = "New chat";

export function useChatsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const handle = useActiveChatHandle();
  const chatId = useActiveChatId();
  const foundingCast = useActiveDraftFoundingCast();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // ONE hook over a varying list (the `DraftChatHeader` precedent) — empty while nothing is drafting.
  const cast = useQueries({ queries: foundingCast.map((characterId) => trpc.character.get.queryOptions({ characterId })) });

  if (isLanding(handle)) {
    return null;
  }
  if (isCommitted(handle)) {
    const title = data?.title ?? "";
    return title.length === 0 ? null : title;
  }
  const first = cast[0]?.data?.name.trim() ?? "";
  return first.length === 0 ? NEW_CHAT_TITLE : first;
}
