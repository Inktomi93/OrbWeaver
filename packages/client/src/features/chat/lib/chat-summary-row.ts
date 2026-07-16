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

/** Title fallback · subtitle · last-activity epoch for one chat summary. When the title falls back to
 *  the participant names (no authored title), the subtitle switches to the message count so the row
 *  never prints the same names twice. */
export function chatSummaryRowView(chat: ChatSummaryItem): { readonly title: string; readonly subtitle: string; readonly when: number } {
  const names = chat.participantNames.length > 0 ? chat.participantNames.join(", ") : null;
  const titleIsNames = (chat.title ?? "").trim().length === 0 && names !== null;
  return {
    title: deriveChatTitle(chat.title, chat.participantNames),
    subtitle: titleIsNames ? `${chat.messageCount} ${chat.messageCount === 1 ? "message" : "messages"}` : (names ?? "No characters"),
    when: chat.lastMessageAt ?? chat.updatedAt,
  };
}
