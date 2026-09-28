// The current host's persisted chat binding, scoped to this room and refreshed by the user bus.

import type { NextTurnConnectionView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

const NEXT_TURN_STALE_MS = 15_000;

interface NextTurnConnectionRead {
  readonly view: NextTurnConnectionView | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
}

export function useNextTurnConnection(chatId: ChatId): NextTurnConnectionRead {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.chat.getNextTurnConnection.queryOptions({ chatId }), staleTime: NEXT_TURN_STALE_MS });
  return { view: query.data, isPending: query.isPending, isError: query.isError };
}
