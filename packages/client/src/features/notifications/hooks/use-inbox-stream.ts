// The live inbox stream adapter — joins the `notifications` ROOM on the tab's ONE socket (SSE-1) and keeps
// `notifications.list` fresh: an arrival triggers one path-invalidate through the central seam.
//
// The SIGNATURE and the semantics are what they were when this rode its own `notifications.notifications`
// subscription; only the transport under it changed. What it GAINED from the fold: the inbox costs no browser
// connection (so the bell can never be the always-on stream that starves an unrelated request), and a
// room-level server fault no longer tears down every other live surface in the tab.
//
// EVERY FRAME IS A TRIGGER, NEVER A PAYLOAD READ. The inbox's truth is the `list` query; the room only says
// "something landed". That is why this room asks for NO replay (`sinceSeq` omitted → live-only) even though it
// IS a durable/resumable room server-side: replaying N missed rows would fire N identical invalidations of a
// read that one invalidate already refreshes. The rows are not lost — the reconnect gap-heal below refetches
// the whole inbox, which is strictly more current than any replay of them.
//
// A ROOM FAULT IS NOT AN ARRIVAL — the `54643a8d` fix, carried through the fold. A server-side domain error
// used to arrive as a typed TERMINAL frame (`__subscriptionError`) that this consumer counted as an inbox
// arrival: it refetched, and left the user looking at a fresh-looking list behind a stream that had just DIED.
// Under the multiplex that fault is a `roomFailed` control frame carrying the classified code + message, which
// the room registry routes to `onError` — it can no longer reach `onEvent` at all (the socket routes control
// frames before data frames), and it still tells the user.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { Invalidation } from "#data";
import { useBusRoom, useTRPC } from "#data";
import { notify } from "#lib";

export interface InboxStreamDeps {
  /** The central invalidation seam (`useInvalidation()` at the caller). */
  readonly invalidation: Invalidation;
}

/** The self-scoped room ref — module-const so it is never a fresh object (the channel key is the caller's
 *  own principal server-side; there is no input to widen it). */
const NOTIFICATIONS_ROOM: Extract<StreamRoomRef, { channel: "notifications" }> = { channel: "notifications" };

/** Attach the live per-user notifications room and drive the inbox read's freshness from it. */
export function useInboxStream({ invalidation }: InboxStreamDeps): void {
  const trpc = useTRPC();
  const refetchInbox = (): void => {
    invalidation.invalidateFilters([trpc.notifications.list.pathFilter()]);
  };
  useBusRoom<"notifications">(NOTIFICATIONS_ROOM, {
    onEvent: refetchInbox,
    // The RE-connect / re-attach gap-heal (and a `roomLagged` shed): refetch the inbox, which subsumes every
    // frame missed while the room was down. Deliberately NOT fired on the room's first live edge of a page —
    // the mount's own `list` read IS that page's fresh state (BOOT-4X, gated in `data/bus/room-registry.ts`).
    onSocketLive: refetchInbox,
    onError: (message) => {
      notify.error(message);
    },
  });
}
