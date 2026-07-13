// The live inbox stream adapter — subscribes notifications.notifications (durable-first per-user SSE,
// tRPC's Last-Event-ID resume replays any gap server-side) and keeps notifications.list fresh: a new
// arrival triggers one path-invalidate through the central seam. Gap-heals with the same invalidate on
// every transition into the live state (first connect and reconnect).

import { useSubscription } from "@trpc/tanstack-react-query";
import type { Invalidation } from "#data";
import { useTRPC } from "#data";

export interface InboxStreamDeps {
  /** The central invalidation seam (`useInvalidation()` at the caller). */
  readonly invalidation: Invalidation;
}

/** Attach the live per-user notifications stream and drive the inbox read's freshness from it. */
export function useInboxStream({ invalidation }: InboxStreamDeps): void {
  const trpc = useTRPC();
  const refetchInbox = (): void => {
    invalidation.invalidateFilters([trpc.notifications.list.pathFilter()]);
  };
  useSubscription(
    trpc.notifications.notifications.subscriptionOptions(undefined, {
      onData: () => {
        refetchInbox();
      },
      onConnectionStateChange: (connection) => {
        // `pending` = live; heal on each arrival (connect + reconnect).
        if (connection.state === "pending") {
          refetchInbox();
        }
      },
    }),
  );
}
