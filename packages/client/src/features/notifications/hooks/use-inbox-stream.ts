// The live inbox stream adapter (PD-23) — subscribes `notifications.notifications` (the durable-first
// per-user SSE stream; every yield is `tracked(seq)`, so tRPC's own Last-Event-ID resume replays any
// gap server-side) and keeps the `notifications.list` read fresh: a new arrival → one path-invalidate
// through the central seam (never inline cache surgery — the `use-user-bus.ts` discipline). On every
// transition INTO the live state it gap-heals with the same invalidate (first connect AND reconnect —
// a redundant refetch is cheap + idempotent; a missed one is a stale badge until the next arrival).
//
// Mounted by the bell (which itself mounts only while the deployment is multi-human capable — the
// `multiHumanProcedure` belt would leak-free NOT_FOUND this subscription otherwise). The bell is
// always-present topbar chrome, so the driver never drops while the surface it feeds exists.

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
        // The envelope's payload is the pushed InboxView; v1 deliberately refetches instead of merging
        // it (targeted-invalidate + background refetch — the documented model, UI-Lib-TanStack-Query §F-3).
        refetchInbox();
      },
      onConnectionStateChange: (connection) => {
        // `pending` = live (idle → connecting → pending) — heal on each arrival (connect + reconnect).
        if (connection.state === "pending") {
          refetchInbox();
        }
      },
    }),
  );
}
