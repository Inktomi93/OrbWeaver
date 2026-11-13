import type { RoomSendAvailability } from "@orb/contracts/chat";
import type { PresenceSnapshot } from "@orb/contracts/notifications";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TrpcReadError } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

const AVAILABILITY_STALE_MS = 15_000;
const PRESENCE_STALE_MS = 10_000;
const PRESENCE_POLL_MS = 20_000;

/** Engine availability changes outside the event bus, so reopening a room can refresh it. */
export function useSendAvailabilityRead(chatId: ChatId | null): UseQueryResult<RoomSendAvailability, TrpcReadError> {
  const trpc = useTRPC();
  return useGatedQuery(chatId, (id) => ({ ...trpc.chat.checkSendAvailability.queryOptions({ chatId: id }), staleTime: AVAILABILITY_STALE_MS }));
}

/** Presence follows the server's disconnect grace window while the roster is mounted. */
export function usePresenceRead(userIds: UserId[]): UseQueryResult<PresenceSnapshot, TrpcReadError> {
  const trpc = useTRPC();
  return useGatedQuery(userIds.length === 0 ? null : userIds, (ids) => ({
    ...trpc.notifications.presence.queryOptions({ userIds: ids }),
    staleTime: PRESENCE_STALE_MS,
    refetchInterval: PRESENCE_POLL_MS,
  }));
}
