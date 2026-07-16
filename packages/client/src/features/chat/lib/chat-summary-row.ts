// The ONE derivation of a chat summary's display fields (title fallback · participant subtitle ·
// last-activity epoch) — shared by the chats-list rows and the landing "Recent chats" strip so the two
// surfaces can't drift (derive-modernization §W5). The composite that renders it lives beside it in
// components/chat-summary-row.tsx (biome forbids a component + a plain export in one module).
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

/** Title fallback · participant subtitle · last-activity epoch for one chat summary. */
export function chatSummaryRowView(chat: ChatSummaryItem): { readonly title: string; readonly subtitle: string; readonly when: number } {
  return {
    title: chat.title ?? "Untitled chat",
    subtitle: chat.participantNames.length > 0 ? chat.participantNames.join(", ") : "No characters",
    when: chat.lastMessageAt ?? chat.updatedAt,
  };
}
