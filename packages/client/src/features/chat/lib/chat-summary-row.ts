// The ONE derivation of a chat summary's display fields (title fallback · participant subtitle ·
// last-activity epoch) — shared by the chats-list rows, the landing "Recent chats" strip, the command
// palette, and (via `deriveChatTitle`) the topbar/context identity, so the surfaces can't drift
// (derive-modernization §W5). The composite that renders it lives beside it in
// components/chat-summary-row.tsx (biome forbids a component + a plain export in one module).
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { rowQualifiers, timeLib } from "#lib";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

/** The ONE chat display-title fallback chain: authored title → participant display names →
 *  "Untitled chat". Stored titles are EMPTY STRINGS until renamed (not just null), so the fallback
 *  trims — a `?? "Untitled chat"` is defeated by `""` and renders a blank title. */
export function deriveChatTitle(title: string | null, participantNames: readonly string[]): string {
  const trimmed = (title ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return participantNames.length > 0 ? participantNames.join(", ") : "Untitled chat";
}

/** What a cast-less draft is called — one word, one home for every surface that prints a pre-send room. */
const NEW_CHAT_TITLE = "New chat";

/** The DRAFT room's display title, from its founding cast's names — the pre-send half of
 *  {@link deriveChatTitle}, and the ONE home for it (side-eye 2026-08-07 finding 1).
 *
 *  It existed TWICE: `DraftChatHeader` (the desktop cluster) joined the whole cast, `useChatsSelectionTitle`
 *  (the mobile topbar) read `cast[0]?.data?.name` — so a three-character draft read "Aldric Vane, Sabine
 *  Veyra, Niko" at one width and "Aldric Vane" at the other, re-introducing on the phone exactly what
 *  86a1736bc fixed on the desktop. `chats-selection-title.ts`'s own header already CLAIMED they resolve it
 *  the same way; a claim in a header is a wish until one function is the answer.
 *
 *  Names that have not landed yet are DROPPED, never joined as empty strings (which would render
 *  "Aldric Vane, " mid-load). An all-unresolved cast falls to the draft's own copy — `deriveChatTitle`'s
 *  "Untitled chat" is the COMMITTED room's word for a room that already exists. */
export function draftChatTitle(castNames: readonly string[]): string {
  const resolved = castNames.map((name) => name.trim()).filter((name) => name.length > 0);
  return resolved.length > 0 ? deriveChatTitle(null, resolved) : NEW_CHAT_TITLE;
}

/** One resolved character SEAT for the row's leading slot — the name backs the avatar's initials fallback
 *  and its accessible label; `hash` is the CAS portrait key (null = this seat has no portrait). */
export interface ChatRowPortrait {
  readonly name: string;
  readonly hash: string | null;
}

/** The row's LEADING slot source (visual-blech audit F7 + list-pane-projection D3): the chat's character
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
