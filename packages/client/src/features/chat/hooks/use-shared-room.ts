// Whether this room is shared: more than one present human. Reads the cached `chat.getChat` detail; an
// unsettled read answers false, so nothing claims a room is shared before the roster says so.

import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { presentMemberCount } from "../lib/roster.ts";

const SHARED_ROOM_FLOOR = 2;

export function useSharedRoom(chatId: ChatId): boolean {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return presentMemberCount(chat?.participants ?? []) >= SHARED_ROOM_FLOOR;
}
