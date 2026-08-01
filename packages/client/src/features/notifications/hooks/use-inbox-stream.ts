// The live inbox stream adapter — subscribes notifications.notifications (durable-first per-user SSE,
// tRPC's Last-Event-ID resume replays any gap server-side) and keeps notifications.list fresh: a new
// arrival triggers one path-invalidate through the central seam. Gap-heals with the same invalidate on
// every transition into the live state (first connect and reconnect).
//
// A server-side domain error arrives as a typed TERMINAL frame (`{ __subscriptionError: true, code,
// message }`) instead of a spurious 500 — the router wraps the generator in `withSubscriptionErrors`, and
// the durable replay it wraps really can throw. That frame is NOT an arrival: counting it as one refetched
// the inbox and left the user looking at a fresh-looking list behind a stream that had just DIED. Route it
// to the notify seam exactly like the chat bus does (`data/bus/use-chat-bus.ts`).

import { useSubscription } from "@trpc/tanstack-react-query";
import type { Invalidation } from "#data";
import { useTRPC } from "#data";
import { notify } from "#lib";

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
      onData: (envelope) => {
        const event = envelope.data;
        if ("__subscriptionError" in event) {
          // The typed terminal frame — the stream is over; refetch-on-reconnect (query-client.ts) closes the
          // gap when the client re-subscribes, so the only thing owed here is telling the user.
          notify.error(event.message);
          return;
        }
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
