// The ONE derivation of a chat summary's display fields (title fallback · participant subtitle ·
// last-activity epoch) — shared by the chats-list rows, the landing "Recent chats" strip, the command
// palette, and (via `deriveChatTitle`) the topbar/context identity, so the surfaces can't drift
// (derive-modernization §W5). The composite that renders it lives beside it in
// components/chat-summary-row.tsx (biome forbids a component + a plain export in one module).
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

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

/** The row's PORTRAIT source: the first participant CHARACTER seat that owns an avatar, as a CAS hash
 *  (visual-blech audit F7 — `participantCharacterIds` + the character list resolve a real face, so the
 *  avatar slot stops spending its pixels on a hue-seeded initials blob). `null` when no seat resolves —
 *  a departed/foreign seat, a portrait-less character, or a character list that hasn't landed yet — and
 *  the row falls back to the initials blob. Ids are compared as plain strings (the character list's own
 *  `id`s), so a caller can build the map straight off `character.list`. */
export function chatPortraitHash(participantCharacterIds: readonly string[], avatarHashById: ReadonlyMap<string, string | null>): string | null {
  for (const characterId of participantCharacterIds) {
    const hash = avatarHashById.get(characterId);
    if (hash !== undefined && hash !== null) {
      return hash;
    }
  }
  return null;
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
