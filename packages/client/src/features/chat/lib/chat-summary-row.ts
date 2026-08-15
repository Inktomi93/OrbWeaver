// The ONE derivation of a chat summary's display fields (title fallback · participant subtitle ·
// last-activity epoch) — shared by the chats-list rows, the landing "Recent chats" strip, the command
// palette, and (via `deriveChatTitle`) the topbar/context identity, so the surfaces can't drift
// (derive-modernization §W5). The composite that renders it lives beside it in
// components/chat-summary-row.tsx (biome forbids a component + a plain export in one module).
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { deriveChatTitle, rowQualifiers, timeLib } from "#lib";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

// `deriveChatTitle` MOVED to `#lib/chat-title` (2026-08-09) and is imported from there above, NOT re-exported
// from here (a re-export would make this a barrel file, which biome forbids): the regex library's room
// roster names chat rooms, features cannot import each other, and this file's own two-rung copy of the chain
// is what put "Untitled chat" on rooms the chats list calls by their cast. Every consumer now imports it
// from `#lib`.

// `draftChatTitle` + `NEW_CHAT_TITLE` ("New chat") were DELETED 2026-08-14 with draft mode
// (chat-creation-draft-mode-replacement.md §4.9): they named a room that had no row yet, from its founding
// cards. Every room has a row from the creation click, so `deriveChatTitle` — over the real roster — is the
// one answer, and its "Untitled chat" fallback is honest for a blank room that legitimately exists.

/** One resolved character SEAT for the row's leading slot — the name backs the avatar's initials fallback
 *  and its accessible label; `hash` is the CAS portrait key (null = this seat has no portrait). */
export interface ChatRowPortrait {
  readonly name: string;
  readonly hash: string | null;
}

/** The row's LEADING slot source (visual-blech audit F7 + D3): the chat's character
 *  seats resolved against the character list, IN SEAT ORDER. A single seat paints one portrait; two or more
 *  paint an `AvatarStack`, because a shared room must read SHARED at rest — the differentiator between a
 *  1:1 and a group is exactly who else is in it.
 *
 *  Seats the caller's character page doesn't carry (an un-landed list, a foreign row) are DROPPED rather
 *  than guessed: an unnamed avatar would be a blank chip claiming a person. Ids compare as plain strings
 *  (the character list's own `id`s), so a caller builds the map straight off `character.list`. */
export function chatPortraits(participantCharacterIds: readonly string[], characterById: ReadonlyMap<string, ChatRowPortrait>): readonly ChatRowPortrait[] {
  const resolved: ChatRowPortrait[] = [];
  for (const characterId of participantCharacterIds) {
    const seat = characterById.get(characterId);
    if (seat !== undefined) {
      resolved.push(seat);
    }
  }
  return resolved;
}

/** The SUBJECT a row action names ("Star …", "Chat actions for …"). The title alone is not unique on a
 *  chats list — the character projection is N rows all titled "Azarael", and N identical accessible names
 *  make a screen-reader/agent walk of the list ambiguous. The disambiguator is the recency stamp the row
 *  ALREADY shows in its meta slot, so what is announced matches what is on screen. */
export function chatRowActionName(title: string, stamp: string): string {
  return `"${title}" · ${stamp}`;
}

/** The per-row disambiguators for ONE rendered chats list, in list order (`rowQualifiers`, side-eye P2c).
 *  The row's own stamp is the discriminator until it collides — which it does on exactly the list this
 *  projection produces (N rows titled "Azarael", the newest few all "2h") — and then it escalates. Both
 *  chats panes call THIS, so the two lists disambiguate identically. */
export function chatRowQualifiers(chats: readonly ChatSummaryItem[]): readonly string[] {
  return rowQualifiers(
    chats.map((chat) => ({ name: deriveChatTitle(chat.title, chat.participantNames), at: chat.lastMessageAt ?? chat.updatedAt })),
    timeLib.formatRelativeCompact,
    timeLib.formatDateTime,
  );
}

/** Title fallback · subtitle · last-activity epoch for one chat summary. The subtitle is the SCENT line when
 *  the server resolved one (`lastMessagePreview` — the newest message this caller may see, already stripped +
 *  flattened + capped server-side): a chat with history says what was last said, which is what the row is for.
 *  Falling back (an empty chat, or a viewer whose history floor hides everything) it keeps the identity line —
 *  the participant names, or the message count when the title ALREADY is the names (never print them twice). */
export function chatSummaryRowView(chat: ChatSummaryItem): { readonly title: string; readonly subtitle: string; readonly when: number } {
  const names = chat.participantNames.length > 0 ? chat.participantNames.join(", ") : null;
  const titleIsNames = (chat.title ?? "").trim().length === 0 && names !== null;
  const identity = titleIsNames ? `${chat.messageCount} ${chat.messageCount === 1 ? "message" : "messages"}` : (names ?? "No characters");
  return {
    title: deriveChatTitle(chat.title, chat.participantNames),
    subtitle: chat.lastMessagePreview ?? identity,
    when: chat.lastMessageAt ?? chat.updatedAt,
  };
}
