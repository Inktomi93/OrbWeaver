// The per-USER bus TRANSPORT adapter (PD user-bus lane) — the twin of `use-chat-bus.ts`, but SIMPLER:
// subscribes `sessions.streamUserEvents` (one SSE stream per device, always on — no chatId, no skipToken, no
// replay cursor) and forwards every `UserBusEvent` into the invalidation seam's SECOND map
// (`invalidation.invalidateUser`). LIVE-ONLY: the server keeps no durable log, so there is no `lastEventId`
// resume — instead, on EVERY (re)connect the hook GAP-HEALS with a blanket invalidate
// (`invalidation.invalidateAllUserRoots`): while the stream was down, a device-B write was missed, and a
// blanket re-invalidate of every filter the user map covers closes that gap (invalidation is idempotent — a
// covered-but-unchanged read just refetches once).
//
// Mount ONCE, at the authed composition reader (`routes/home-page.tsx`) — NOT in a feature (a feature could
// mount/unmount and drop the always-on freshness driver). The subscription body does NOTHING else (mirrors
// the chat bus's `no-inline-cache-surgery-in-stream` discipline): no cache writes, no store writes — routing
// is all the invalidation map's job.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "../trpc";

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the two user-bus
 *  entry points. Passed from `home-page.tsx` (the seam is rebuilt per render; identity churn is harmless —
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
        // `pending` = the stream is live (idle → connecting → pending). Heal on each arrival at `pending`
        // (first connect AND reconnect); a redundant heal is cheap + idempotent, a missed one is not.
        if (connection.state === "pending") {
          deps.invalidateAllUserRoots();
        }
      },
    }),
  );
}
