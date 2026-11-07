// The Chats topbar identity header — the open room's roster header, resolved from the section's OWN #state
// (the active handle). A section-owned body so `chatsSection.header` rides the registry, not route
// composition.
//
// Its sibling mark carries the TEMPORARY badge: the `chats.temporary` flag is CREATION-ONLY by
// design, so a user who only learns their room is ephemeral after the fact cannot fix it. The picker states
// it up front (the pre-create half) and this badge states it for the room's whole life, off the chat row.
// The pre-send DRAFT arm is gone with draft mode (D166): there
// is no window between the pick and the row any more.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { TEMPORARY_CHAT_BADGE } from "#lib";
import { useActiveChatId } from "#state";
import { ChatHeaderSurface } from "./chat-header.tsx";

/** Is the room ephemeral? A plain `useQuery` off the same `getChat` the room already reads — this header
 *  must never suspend on its own account, so an unresolved read reads as "not temporary" (the badge appears
 *  the moment the cache lands, which for a just-created room is its first frame: `useStartChat` seeds it). */
function useIsTemporaryChat(chatId: ChatId): boolean {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return chat?.temporary === true;
}

export function ChatsTopbarHeader(): ReactElement | null {
  const activeChatId = useActiveChatId();
  return activeChatId === null ? null : <ChatHeaderSurface chatId={activeChatId} />;
}

/** The room's TEMPORARY badge, outside the wide header so a phone's narrow identity (which drops that header) still shows it. */
export function ChatsTopbarMark(): ReactElement | null {
  const activeChatId = useActiveChatId();
  return activeChatId === null ? null : <TemporaryBadge chatId={activeChatId} />;
}

function TemporaryBadge({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  return useIsTemporaryChat(chatId) ? <Badge>{TEMPORARY_CHAT_BADGE}</Badge> : null;
}
