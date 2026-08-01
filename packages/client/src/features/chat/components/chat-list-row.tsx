// One row of a chats LIST PANE — the `ChatSummaryRow` composite wired to the row-action grammar (§12): the
// star STATE TOGGLE over the shared `useStarChat` mutation, plus the kebab that keeps every action (mirror
// parity). Extracted from `chat-list-surface.tsx` when the character screen's projection pane became its
// second consumer: the two panes are the SAME list of the SAME chats, so a forked row would be two truths.

import type { ChatId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useStarChat } from "../hooks/use-chat-row-mutations";
import { deriveChatTitle } from "../lib/chat-summary-row";
import { ChatListRowMenu } from "./chat-list-row-menu";
import { ChatSummaryRow } from "./chat-summary-row";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

export interface ChatListRowProps {
  readonly chat: ChatSummaryItem;
  readonly selected: boolean;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  /** The row's resolved participant portrait (F7) — null keeps the initials blob. */
  readonly portraitHash: string | null;
}

export function ChatListRow({ chat, selected, onSelect, onDeletedChat, portraitHash }: ChatListRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // §12.2 — the row's ONE state toggle rides the SAME `useStarChat` mutation the kebab's Star item fires
  // (mirror parity: the kebab keeps the item, so a keyboard user still has one menu that does everything).
  const starChat = useStarChat({ trpc, invalidation });
  return (
    <ChatSummaryRow
      chat={chat}
      onToggleStar={(next): void => starChat.mutate({ chatId: chat.id, star: next })}
      portraitHash={portraitHash}
      // `group` roots the row so the kebab's + the star's hover/focus-within reveal (P3) fires on row hover
      // (the character-card precedent); the reveal lives on RowActionsMenu's `reveal` / ROW_REVEAL.
      className="group"
      // The DERIVED display title (participant names when unauthored) names the kebab menu ("Chat actions
      // for <title>") so the per-row menus are distinguishable, not N identical "Chat actions" (finding #4).
      // `title` (raw, nullable) still seeds the rename input — the empty box for an unnamed chat is intact.
      menu={
        <ChatListRowMenu
          archived={chat.archived}
          chatId={chat.id}
          displayTitle={deriveChatTitle(chat.title, chat.participantNames)}
          onDeleted={onDeletedChat}
          starred={chat.star}
          title={chat.title}
        />
      }
      onSelect={onSelect}
      selected={selected}
    />
  );
}
