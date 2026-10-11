// The ONE chat display-title fallback chain, in the SHARED lib rather than in `features/chat`.
//
// WHY IT MOVED (REGROSTER's naming question, owner-picked 2026-08-09). It lived in
// `features/chat/lib/chat-summary-row.ts` and could therefore only be read by chat — and features cannot
// import each other (the `regexScriptTitle` precedent, which moved here for exactly this reason when its
// fourth consumer arrived). The regex library's "Attached by rooms" roster is a NON-chat surface that names
// chat rooms, so it had no way to reach this function and shipped its own two-rung copy of the chain
// (authored title → the untitled fallback). The missing middle rung is what put "Untitled chat" on every
// unnamed room in that roster while the chats list two panes over called the same room "Aveline".
//
// A second copy of a fallback chain is a drift generator, so there is now exactly one. `features/chat`
// re-exports from here; nothing re-spells it.

/** What a chat with no authored title and no resolvable participant names is called. The COMMITTED room's word — a
 *  pre-send draft has its own ("New chat", `draftChatTitle`). */
export const UNTITLED_CHAT_TITLE = "Untitled chat";

/** The title shape the Silly-Tavern import stored before names were user-owned: `<cast> — Mon D, YYYY`, or the
 *  bare date when no cast name resolved, with ` (n)` on a same-day duplicate (server `import/substrate/chat-input.ts`).
 *  It is a date stamp, not a name anyone chose, so it presents as "no user name". Stored rows are never rewritten. */
const STAMPED_DEFAULT_TITLE = /^(?:.+ \u2014 )?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}(?: \(\d+\))?$/u;

/** The name a user gave the room, or null when there is none: the stored title is null, blank, or the stamped
 *  default. The ONE test every surface shares for "did the user name this room". */
export function authoredChatName(title: string | null): string | null {
  const trimmed = (title ?? "").trim();
  return trimmed.length === 0 || STAMPED_DEFAULT_TITLE.test(trimmed) ? null : trimmed;
}

/** The ONE chat display-title fallback chain: authored title → participant display names → "Untitled chat".
 *  Stored titles are EMPTY STRINGS until renamed (not just null), so the fallback trims — a
 *  `?? "Untitled chat"` is defeated by `""` and renders a blank title. */
export function deriveChatTitle(title: string | null, participantNames: readonly string[]): string {
  const authored = authoredChatName(title);
  if (authored !== null) {
    return authored;
  }
  return participantNames.length > 0 ? participantNames.join(", ") : UNTITLED_CHAT_TITLE;
}

/** The phone screen title: the user's own name for the room leads when they set one, then the participants, so
 *  two rooms with the same cast read apart on a narrow row (the chat list row leads the same way). A room
 *  without a name is told by its participants; one with no characters by its name alone (or the untitled word). */
export function chatRoomTitle(title: string | null, participantNames: readonly string[]): string {
  const roomName = authoredChatName(title);
  if (participantNames.length === 0) {
    return roomName ?? UNTITLED_CHAT_TITLE;
  }
  const participants = participantNames.join(", ");
  // A name that merely repeats the people ("Aveline" in a room with Aveline) adds nothing to print twice.
  return roomName === null || roomName.toLowerCase() === participants.toLowerCase() ? participants : `${roomName} \u00b7 ${participants}`;
}
