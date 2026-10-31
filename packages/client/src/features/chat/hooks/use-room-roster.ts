// The open room's roster facts the topbar trail's Members and Memory entries read: which room is open, how many seats
// are present, and whether the viewer hosts it. A plain `useQuery` off the `getChat` the room already reads, so a trail
// entry never suspends: until the read lands the count is 0 and the entries stay hidden (`resolved` is false).

import { skipToken, useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";

export function useRoomRoster(): {
  readonly chatId: ReturnType<typeof useActiveChatId>;
  readonly resolved: boolean;
  readonly memberCount: number;
  readonly viewerIsHost: boolean;
} {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions(chatId === null ? skipToken : { chatId }));
  return {
    chatId,
    resolved: chat !== undefined,
    memberCount: chat?.participants.filter((p) => p.leftSeq === null).length ?? 0,
    viewerIsHost: chat?.viewerIsHost === true,
  };
}
