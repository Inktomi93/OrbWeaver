// transport/trpc/user-events-bus — the per-USER "an entity you own changed" LIVE fan-out the
// `sessions.streamUserEvents` subscription tails (PD user-bus lane; core/Tier-4-Transport.md). LIVE-ONLY: unlike
// the chat + notifications buses there is NO durable half — no table, no `seq`, no `lastEventId` replay. A
// domain verb emits AFTER its durable write commits; a subscriber attaches and goes live, and the CLIENT
// gap-heals every (re)connect with a blanket invalidate (invalidation is idempotent — a missed tick costs one
// refetch). One process-local `EventEmitter`, one channel per `userId`.
//
// SCOPE / AUTHZ: the channel is keyed by `userId` only; the subscription derives that `userId` from the
// request principal (`ctx.auth.userId`) — NEVER from client input — so a subscriber receives ONLY its own
// channel. Producers emit with the acting principal's `userId` (the entry-composed `EmitUserEvent` op wires
// straight to `publishUserEvent`). This bus is single-user-safe by design (the whole point of the lane): it
// rides the STANDARD authed procedure, not the `multiHumanProcedure` capability belt — a `single-user`
// deployment MUST still get cross-device freshness.

import { EventEmitter, on } from "node:events";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { UserId } from "@orb/kit/ids";

// Process-local; unbounded listeners (one per connected device per user — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (userId: UserId): string => `user:${userId}`;

/** Publish an "an entity you own changed" event to the owner's live channel. Called by the entry-composed
 *  `EmitUserEvent` op from a domain verb AFTER its durable write committed. Fire-and-forget (LIVE-ONLY — a
 *  dropped tick is healed by the client's reconnect blanket invalidate). */
export function publishUserEvent(userId: UserId, event: UserBusEvent): void {
  emitter.emit(channelFor(userId), event);
}

/**
 * The user's live entity-changed stream, scoped to one `userId` and torn down on `signal` abort (SSE
 * disconnect) — `on()` removes the listener, so there is no leak across reconnects.
 */
export function subscribeUserEvents(
  userId: UserId,
  signal: AbortSignal,
): AsyncIterable<UserBusEvent> {
  return liveEvents(on(emitter, channelFor(userId), { signal }));
}

// `on()` yields the raw emit-args array (`[event]`); EventEmitter is untyped, so the element is unwrapped and
// annotated at this single boundary.
async function* liveEvents(source: AsyncIterable<unknown[]>): AsyncGenerator<UserBusEvent> {
  for await (const args of source) {
    yield args[0] as UserBusEvent;
  }
}
