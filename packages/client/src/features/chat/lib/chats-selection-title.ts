// The Chats section's `useSelectionTitle` — what the mobile pushed frame's topbar calls the open room
// (side-eye P2: a pushed detail must name the MEMBER, not the section). Cache-first and NON-suspending: it
// shares the read the room itself already made, so it is a cache hit; `null` = the landing, where the shell
// prints the section label.
//
// ONE ARM (D166). It had two, because a room had two lives and
// the pre-send one had no row to read a title off — and the two arms had already drifted once (a group draft
// read the FIRST character on the phone and the joined characters on the desktop, side-eye 2026-08-07 finding 1). A room has
// a row from the creation click, so there is one arm and the shared display-title chain names it.

import { useGatedQuery, useTRPC } from "#data";
import { deriveChatTitle } from "#lib";
import { useActiveChatId } from "#state";
import { useChatCensus } from "../hooks/use-chat-census.ts";
import { CHATS_SECTION_LABEL } from "./chats-section-label.ts";
import { filterCharacters } from "./roster.ts";

export function useChatsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally
  // for exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useChatCensus();
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676).
  // With a member open this screen is that member's, so an unresolved read heals to the shell's section
  // label, never to the library's size. Once the row lands, use the same authored-title → character-names →
  // untitled fallback chain as the desktop header and every room roster.
  if (chatId !== null) {
    if (data === undefined) {
      return null;
    }
    const characters = filterCharacters(data.participants);
    return deriveChatTitle(
      data.title,
      characters.map((character) => character.displayName),
    );
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is
  // noise, not information", and `"0"` is the same fact a caller happened to format): an empty roster says
  // `Chats` and lets its empty state do the teaching.
  if (census === undefined || census === 0 || census === "0") {
    return null;
  }
  return `${CHATS_SECTION_LABEL} · ${String(census)}`;
}
