import type { SendAvailability } from "@orb/contracts/inference";
import type { PresenceSnapshot } from "@orb/contracts/notifications";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { TrpcReadError } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";

const AVAILABILITY_STALE_MS = 15_000;
const PRESENCE_STALE_MS = 10_000;
const PRESENCE_POLL_MS = 20_000;

/** Engine availability changes outside the event bus, so reopening a room can refresh it. */
export function useSendAvailabilityRead(chatId: ChatId | null): UseQueryResult<SendAvailability, TrpcReadError> {
  const trpc = useTRPC();
  return useQuery({ ...trpc.chat.checkSendAvailability.queryOptions(chatId === null ? skipToken : { chatId }), staleTime: AVAILABILITY_STALE_MS });
}

/** Presence follows the server's disconnect grace window while the roster is mounted. */
export function usePresenceRead(userIds: UserId[]): UseQueryResult<PresenceSnapshot, TrpcReadError> {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.notifications.presence.queryOptions(userIds.length === 0 ? skipToken : { userIds }),
    staleTime: PRESENCE_STALE_MS,
    refetchInterval: PRESENCE_POLL_MS,
  });
}
