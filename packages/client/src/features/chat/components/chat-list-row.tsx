// One row of a chats LIST PANE — the `ChatSummaryRow` composite wired to the row-action grammar (§12): the
// star STATE TOGGLE over the shared `useStarChat` mutation, plus the kebab that keeps every action (mirror
// parity). Extracted from `chat-list-surface.tsx` when the character screen's projection pane became its
// second consumer: the two panes are the SAME list of the SAME chats, so a forked row would be two truths.

import type { ChatId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { deriveChatTitle, timeLib } from "#lib";
import { useStarChat } from "../hooks/use-chat-row-mutations.ts";
import type { ChatRowPortrait } from "../lib/chat-summary-row.ts";
import { chatRowActionName } from "../lib/chat-summary-row.ts";
import { ChatListRowMenu } from "./chat-list-row-menu.tsx";
import { ChatSummaryRow } from "./chat-summary-row.tsx";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

export interface ChatListRowProps {
  readonly chat: ChatSummaryItem;
  readonly selected: boolean;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  /** The row's resolved character seats (F7/D3) — 1 paints a portrait, 2+ an AvatarStack, 0 the blob. */
  readonly portraits: readonly ChatRowPortrait[];
  /** The row's DISAMBIGUATOR, resolved by the surface across the whole list (`rowQualifiers`) — the stamp
   *  the row shows, escalated where it collided. Omitted falls back to this row's own stamp, which is right
   *  for a one-off row and wrong for a list (side-eye P2c). */
  readonly qualifier?: string | undefined;
}

export function ChatListRow({ chat, selected, onSelect, onDeletedChat, portraits, qualifier }: ChatListRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // §12.2 — the row's ONE state toggle rides the SAME `useStarChat` mutation the kebab's Star item fires
  // (mirror parity: the kebab keeps the item, so a keyboard user still has one menu that does everything).
  const starChat = useStarChat({ trpc, invalidation });
  // ONE name for every action on this row (the kebab AND the star toggle inside the composite) — resolved
  // once here so the two can't spell the subject differently.
  const rowName = chatRowActionName(
    deriveChatTitle(chat.title, chat.participantNames),
    qualifier ?? timeLib.formatRelativeCompact(chat.lastMessageAt ?? chat.updatedAt),
  );
  return (
    <ChatSummaryRow
      actionName={rowName}
      chat={chat}
      onToggleStar={(next): void => starChat.mutate({ chatId: chat.id, starred: next })}
      portraits={portraits}
      // `group` roots the row so the kebab's + the star's hover/focus-within reveal (P3) fires on row hover
      // (the character-card precedent); the reveal lives on RowActionsMenu's `reveal` / ROW_REVEAL.
      className="group"
      // The DERIVED display title (participant names when unauthored) names the kebab menu ("Chat actions
      // for <title>") so the per-row menus are distinguishable, not N identical "Chat actions" (finding #4).
      // The title alone is NOT enough on a per-character projection (N rows all titled "Azarael"), so the
      // name carries the row's stamp too — the same one the row shows, escalated by the surface where even
      // that collided (side-eye P3a + P2c).
      // `title` (raw, nullable) still seeds the rename input — the empty box for an unnamed chat is intact.
      menu={<ChatListRowMenu archived={chat.archived} chatId={chat.id} onDeleted={onDeletedChat} rowName={rowName} starred={chat.starred} title={chat.title} />}
      onSelect={onSelect}
      selected={selected}
    />
  );
}
