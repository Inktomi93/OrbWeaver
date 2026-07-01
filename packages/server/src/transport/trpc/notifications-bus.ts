// transport/trpc/notifications-bus — the per-user LIVE fan-out the notifications subscription tails
// (PD-23; core/Tier-4-Transport.md §"per-user notifications subscription"). The `notifications` DOMAIN owns the
// durable half (the `record` INSERT + the `list` cursor by `seq`); the per-user live bus is TRANSPORT
// state (the domain has no in-memory channel by design). One process-local `EventEmitter`, one channel
// per `userId`.
//
// DURABLE-FIRST / fan-out-second: the `entry/` root composes `EmitNotification = async (e) => { const
// view = await notifications.record({ event: e }); publishNotification(view); }` — `record` (the durable
// INSERT, which assigns `seq`) ALWAYS runs before `publishNotification`, so a dead bus path never loses an
// event: the subscription replays it from the table by `seq`. The bus carries the persisted `InboxView`
// (with its `seq`) so the live yield is `tracked(view.seq, view)` — uniform with the durable replay.
// FLAG(entry): wire `EmitNotification` to call `record` then `publishNotification` in that order.

import { EventEmitter, on } from "node:events";
import type { UserId } from "@orb/kit/ids";
import type { InboxView } from "#domain/notifications";

// Process-local; unbounded listeners (one per connected device per user — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (userId: UserId): string => `notify:${userId}`;

/** Publish a persisted notification to the recipient's live channel. Called by the entry-composed
 *  `EmitNotification` AFTER the durable `record` returns the `InboxView` (durable-first). */
export function publishNotification(view: InboxView): void {
  emitter.emit(channelFor(view.payload.recipientUserId), view);
}

/**
 * The recipient's live notification stream, scoped to one `userId` and torn down on `signal` abort (SSE
 * disconnect) — `on()` removes the listener, so there is no leak across reconnects. `on()` begins
 * BUFFERING the instant it is called, so a caller that invokes this BEFORE replaying the durable tail
 * loses no event in the gap (the subscription dedupes the overlap by monotonic `seq`).
 */
export function subscribeNotifications(
  userId: UserId,
  signal: AbortSignal,
): AsyncIterable<InboxView> {
  return liveViews(on(emitter, channelFor(userId), { signal }));
}

// `on()` yields the raw emit-args array (`[view]`); EventEmitter is untyped, so the element is unwrapped
// and annotated at this single boundary.
async function* liveViews(source: AsyncIterable<unknown[]>): AsyncGenerator<InboxView> {
  for await (const args of source) {
    yield args[0] as InboxView;
  }
}
