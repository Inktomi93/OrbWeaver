// The ONE chat display-title fallback chain, in the SHARED lib rather than in `features/chat`.
//
// WHY IT MOVED (REGROSTER's naming question, owner-picked 2026-08-09). It lived in
// `features/chat/lib/chat-summary-row.ts` and could therefore only be read by chat — and features cannot
// import each other (the `regexScriptTitle` precedent, which moved here for exactly this reason when its
// fourth consumer arrived). The regex library's "Attached by rooms" roster is a NON-chat surface that names
// chat rooms, so it had no way to reach this function and shipped its own two-rung copy of the chain
// (authored title → the untitled fallback). The missing middle rung is what put "Untitled chat" on every
// unnamed room in that roster while the chats list two panes over called the same room "Azarael".
//
// A second copy of a fallback chain is a drift generator, so there is now exactly one. `features/chat`
// re-exports from here; nothing re-spells it.

/** What a chat with no authored title and no resolvable cast is called. The COMMITTED room's word — a
 *  pre-send draft has its own ("New chat", `draftChatTitle`). */
export const UNTITLED_CHAT_TITLE = "Untitled chat";

/** The ONE chat display-title fallback chain: authored title → participant display names → "Untitled chat".
 *  Stored titles are EMPTY STRINGS until renamed (not just null), so the fallback trims — a
 *  `?? "Untitled chat"` is defeated by `""` and renders a blank title. */
export function deriveChatTitle(title: string | null, participantNames: readonly string[]): string {
  const trimmed = (title ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return participantNames.length > 0 ? participantNames.join(", ") : UNTITLED_CHAT_TITLE;
}
