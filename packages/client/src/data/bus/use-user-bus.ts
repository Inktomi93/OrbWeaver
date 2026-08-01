// The per-user bus transport adapter — twin of use-chat-bus.ts, simpler: joins the `user` ROOM on the tab's
// ONE socket (SSE-1) and forwards every event into invalidation.invalidateUser. Live-only, no durable log:
// on every (re)connect the hook gap-heals with a blanket invalidate (invalidateAllUserRoots) since a missed
// write during downtime needs closing. Mount ONCE at the authed composition root (routes/app-root.tsx),
// never in a feature.
//
// The SIGNATURE and the semantics are exactly what they were when this rode its own `sessions.streamUserEvents`
// subscription; only the transport under it changed. Two things it GAINED from the fold: the room costs no
// browser connection (so this hook can never be the stream that starves an unrelated request), and a
// server-side fault in the room now arrives as a typed message instead of an invisible retry loop.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { notify } from "#lib";
import { useBusRoom } from "./use-bus-room";

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the two user-bus
 *  entry points. Passed from `app-root.tsx` (the seam is rebuilt per render; identity churn is harmless —
 *  the room keys off nothing that changes). */
export interface UserBusDeps {
  /** Route ONE live `UserBusEvent` through the exhaustive user map. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The (re)connect gap-heal — blanket-invalidate every filter the user map covers. */
  readonly invalidateAllUserRoots: () => void;
}

/** The self-scoped room ref — module-const so it is never a fresh object (the channel key is the caller's
 *  own principal server-side; there is no input to widen it). */
const USER_ROOM: Extract<StreamRoomRef, { channel: "user" }> = { channel: "user" };

/**
 * Attach the always-on per-user entity-changed room and drive the invalidation seam from it. `onEvent`
 * routes each event; `onSocketLive` fires the gap-heal on every transition INTO the live state — which
 * covers BOTH the first connect and every reconnect after an SSE drop.
 */
export function useUserBus(deps: UserBusDeps): void {
  useBusRoom<"user">(USER_ROOM, {
    onEvent: (frame) => {
      deps.invalidateUser(frame.event);
    },
    onSocketLive: () => {
      deps.invalidateAllUserRoots();
    },
    onError: (message) => {
      notify.error(message);
    },
  });
}
