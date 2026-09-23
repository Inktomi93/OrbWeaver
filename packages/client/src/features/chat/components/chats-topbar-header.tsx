// The Chats topbar identity header — the open room's roster header, resolved from the section's OWN #state
// (the active handle). A section-owned body so `chatsSection.header` rides the registry, not route
// composition.
//
// It also carries the TEMPORARY badge: the `chats.temporary` flag is CREATION-ONLY by
// design, so a user who only learns their room is ephemeral after the fact cannot fix it. The picker states
// it up front (the pre-create half) and this badge states it for the room's whole life, off the chat row.
// The pre-send DRAFT arm is gone with draft mode (D166): there
// is no window between the pick and the row any more.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
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
  if (activeChatId === null) {
    return null;
  }
  return <TopbarHeader chatId={activeChatId} />;
}

function TopbarHeader({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const temporary = useIsTemporaryChat(chatId);
  if (!temporary) {
    return <ChatHeaderSurface chatId={chatId} />;
  }
  return (
    <Row align="center" className="min-w-0" gap="row">
      <ChatHeaderSurface chatId={chatId} />
      <Badge intent="neutral" tone="soft">
        Temporary
      </Badge>
    </Row>
  );
}
