// The per-user bus transport adapter — twin of use-chat-bus.ts, simpler: subscribes
// sessions.streamUserEvents (one always-on SSE stream per device, no chatId/cursor) and forwards every
// event into invalidation.invalidateUser. Live-only, no durable log: on every RE-connect the hook
// gap-heals with a blanket invalidate (invalidateAllUserRoots) since a missed write during downtime
// needs closing. Mount ONCE at the authed composition root (routes/app-root.tsx), never in a feature.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "../trpc";

// The gap-heal exists to close a DOWNTIME window: writes that landed while this device had no live stream
// and that nothing else will re-announce. THE FIRST CONNECT OF A PAGE LOAD HAS NO SUCH WINDOW — the reads
// it would heal were issued by the same page load, in the same commit as this subscription. Healing there
// re-fetched every mounted user root a SECOND time on every page load (measured live on the snap stage at
// 23c00bdf: persona.list / character.list / settings.getUserSettings / chat.listChats each ×2, the heal
// wave landing ~5ms after the mount wave had RESOLVED — `invalidateQueries` only rides an in-flight fetch
// while it IS in flight, and these were not). So the heal starts from the SECOND connection on.
//
// ONE process-level gate, the same idiom as use-chat-bus.ts's `seqGuard` (a closure, not a hook-local
// ref): the scope is the PAGE LOAD — a fresh module means a fresh QueryClient, whose data cannot predate
// this stream. A hook REMOUNT (an auth flip re-rendering app-root) keeps the old cache while the stream
// was detached, which IS a downtime window, so it correctly heals.
const gapHealGate = createGapHealGate();

/** `heal()` answers "has this page had a live user stream before?" and records that it now has —
 *  `false` for the page's first connection, `true` for every re-connection after it. */
function createGapHealGate(): { readonly heal: () => boolean } {
  let everAttached = false;
  return {
    heal: (): boolean => {
      const wasAttached = everAttached;
      everAttached = true;
      return wasAttached;
    },
  };
}

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the two user-bus
 *  entry points. Passed from `app-root.tsx` (the seam is rebuilt per render; identity churn is harmless —
 *  the subscription keys off nothing that changes). */
export interface UserBusDeps {
  /** Route ONE live `UserBusEvent` through the exhaustive user map. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The RE-connect gap-heal — blanket-invalidate every filter the user map covers. */
  readonly invalidateAllUserRoots: () => void;
}

/**
 * Attach the always-on per-user entity-changed stream and drive the invalidation seam from it. `onData`
 * routes each event; `onConnectionStateChange` fires the gap-heal on every transition INTO the live
 * (`pending`) state EXCEPT the page's very first one (see `gapHealGate` above).
 */
export function useUserBus(deps: UserBusDeps): void {
  const trpc = useTRPC();
  useSubscription(
    trpc.sessions.streamUserEvents.subscriptionOptions(undefined, {
      onData: (event) => {
        deps.invalidateUser(event);
      },
      onConnectionStateChange: (connection) => {
        // `pending` = the stream is live. One `pending` per successful connection (a drop goes
        // `pending → connecting/error → pending`), so this counts CONNECTIONS, not renders.
        if (connection.state !== "pending") {
          return;
        }
        if (gapHealGate.heal()) {
          deps.invalidateAllUserRoots();
        }
      },
    }),
  );
}
