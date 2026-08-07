// The Chats section's `useSelectionTitle` — what the mobile pushed frame's topbar calls the open room
// (side-eye P2: a pushed detail must name the MEMBER, not the section). Cache-first and NON-suspending: it
// shares the reads the room itself already made, so both arms are cache hits; `null` = the landing, where
// the shell prints the section label.
//
// TWO ARMS, because a room has two lives (side-eye leg-4 P1: a mobile DRAFT's topbar read "Chats" — the
// SECTION — while the desktop header beside it read "Hana Mizushima". The committed arm was the only one
// wired, so every pre-send room fell through to the label):
//   · COMMITTED — the `chat.getChat` row's title.
//   · DRAFT — the founding cast's names, else the word "New chat".
// The draft rule is `DraftChatHeader`'s OWN rule, deliberately: the desktop cluster and the mobile title are
// the same statement at two widths, so they resolve it the same way rather than each inventing a name.
//
// AND NOW THAT IS TRUE (side-eye 2026-08-07 finding 1). The claim above shipped while this file read
// `cast[0]?.data?.name` — one participant — so a group draft the desktop titled "Aldric Vane, Sabine Veyra,
// Niko" read "Aldric Vane" on the phone. Both surfaces call `draftChatTitle` now; the sameness is a shared
// function, not a comment.

import { useQueries } from "@tanstack/react-query";
import { useGatedQuery, useTRPC } from "#data";
import { isCommitted, isLanding, useActiveChatHandle, useActiveChatId, useActiveDraftFoundingCast } from "#state";
import { draftChatTitle } from "./chat-summary-row.ts";

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
  return draftChatTitle(cast.map((seat) => seat.data?.name ?? ""));
}
