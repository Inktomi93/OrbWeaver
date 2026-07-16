// The per-user bus transport adapter — twin of use-chat-bus.ts, simpler: subscribes
// sessions.streamUserEvents (one always-on SSE stream per device, no chatId/cursor) and forwards every
// event into invalidation.invalidateUser. Live-only, no durable log: on every (re)connect the hook
// gap-heals with a blanket invalidate (invalidateAllUserRoots) since a missed write during downtime
// needs closing. Mount ONCE at the authed composition root (routes/app-root.tsx), never in a feature.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "../trpc";

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the two user-bus
 *  entry points. Passed from `app-root.tsx` (the seam is rebuilt per render; identity churn is harmless —
 *  the subscription keys off nothing that changes). */
export interface UserBusDeps {
  /** Route ONE live `UserBusEvent` through the exhaustive user map. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The (re)connect gap-heal — blanket-invalidate every filter the user map covers. */
  readonly invalidateAllUserRoots: () => void;
}

/**
 * Attach the always-on per-user entity-changed stream and drive the invalidation seam from it. `onData`
 * routes each event; `onConnectionStateChange` fires the gap-heal on every transition INTO the live
 * (`pending`) state — which covers BOTH the first connect and every reconnect after an SSE drop.
 */
export function useUserBus(deps: UserBusDeps): void {
  const trpc = useTRPC();
  useSubscription(
    trpc.sessions.streamUserEvents.subscriptionOptions(undefined, {
      onData: (event) => {
        deps.invalidateUser(event);
      },
      onConnectionStateChange: (connection) => {
        // `pending` = the stream is live; heal on every arrival (first connect AND reconnect).
        if (connection.state === "pending") {
          deps.invalidateAllUserRoots();
        }
      },
    }),
  );
}
