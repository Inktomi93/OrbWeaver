// The ONE derivation of a chat summary's display fields (title fallback · participant subtitle ·
// last-activity epoch) — shared by the chats-list rows, the landing "Recent chats" strip, the command
// palette, and (via `deriveChatTitle`) the topbar/context identity, so the surfaces can't drift
// (derive-modernization §W5). The composite that renders it lives beside it in
// components/chat-summary-row.tsx (biome forbids a component + a plain export in one module).
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { deriveChatTitle, rowQualifiers, timeLib } from "#lib";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];
/** One seat on that row, straight off the wire — the base {@link ChatRowPortrait} extends. */
type ChatSummarySeat = ChatSummaryItem["participantPortraits"][number];

// `deriveChatTitle` MOVED to `#lib/chat-title` (2026-08-09) and is imported from there above, NOT re-exported
// from here (a re-export would make this a barrel file, which biome forbids): the regex library's room
// roster names chat rooms, features cannot import each other, and this file's own two-rung copy of the chain
// is what put "Untitled chat" on rooms the chats list calls by their characters. Every consumer now imports
// from `#lib`.

// `draftChatTitle` + `NEW_CHAT_TITLE` ("New chat") were DELETED 2026-08-14 with draft mode
// (D166): they named a room that had no row yet, from its founding
// cards. Every room has a row from the creation click, so `deriveChatTitle` — over the real roster — is the
// one answer, and its "Untitled chat" fallback is honest for a blank room that legitimately exists.

/** One resolved character SEAT for the row's leading slot (visual-blech audit F7 + D3) — the name backs the
 *  avatar's initials fallback and its accessible label; `avatarHash` is the CAS portrait key (null = this
 *  seat has no portrait, which paints the hue-seeded initials blob).
 *
 *  DERIVED from the wire, never re-spelled (#192). The seats arrive ON the chat row now
 *  (`ChatSummary.participantPortraits`, resolved by the roster read the list projection already runs); the
 *  client used to build them by fetching the whole character library and indexing character ids into it,
 *  which is the map this alias replaced. A single seat paints one
 *  portrait; two or more paint an `AvatarStack`, because a shared room must read SHARED at rest.
 *
 *  An INTERFACE extending the derived member, not a `type` alias of it: an exported type ALIAS outside a
 *  type home is `no-inline-types` RED anywhere in the tree, while an exported interface is RED only inside
 *  a server domain — and the alias it extends is the derive, so the wire still owns the shape. */
export interface ChatRowPortrait extends ChatSummarySeat {}

/** The mock's credit register: a character's SHORT display name, i.e. everything before its first appositive
 *  comma ("Calamity, Doomblade of the Ninth Epoch" → "Calamity"; "Sabine Veyra" → "Sabine Veyra"). A comma
 *  in a character name is a TITLE, not a surname — the corpus is full of "X, the Y" — and the long form is
 *  what the shelf cell and the character library are for. */
function shortDisplayName(name: string): string {
  const head = (name.split(",")[0] ?? "").trim();
  return head.length > 0 ? head : name.trim();
}

/** The hero's CHARACTER CREDIT — the room's characters at short-name length, middot-joined, for the focal
 *  island's foot line. It is not decoration: the full-length names were the measured pressure that pushed
 *  the hearth grid TRACK to a 743px min-content and broke the approved 1.55fr/1fr split (side-eye
 *  2026-08-16 P1-1 / F12) — one room with three title-bearing characters was setting the width of the whole
 *  page. An empty roster prints the same honest phrase `chatSummaryRowView` falls back to. */
export function characterCredit(participantNames: readonly string[]): string {
  const names = participantNames.map(shortDisplayName).filter((name) => name.length > 0);
  return names.length > 0 ? names.join(" · ") : "No characters";
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
 *  flattened + WORD-BOUNDARY capped server-side): a chat with history says what was last said, which is what
 *  the row is for. The server budget is the widest consumer's (home's two-line hero, #188 N-2) and every
 *  narrower slot cuts in CSS — so no consumer re-truncates this string in JS: a character count cannot know
 *  the rendered width, which is exactly how the hero ended up showing "…she's und…" with half its measure
 *  empty.
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
