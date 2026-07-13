// The per-user live fan-out the notifications subscription tails. The notifications domain owns the
// durable half (the record INSERT + the list cursor by seq); the per-user live bus is transport state.
// One process-local EventEmitter, one channel per userId.
//
// Durable-first / fan-out-second: entry composes EmitNotification so record (the durable INSERT, which
// assigns seq) always runs before publishNotification, so a dead bus path never loses an event.

import { EventEmitter, on } from "node:events";
import type { UserId } from "@orb/kit/ids";
import type { InboxView } from "#domain/notifications";

// Process-local; unbounded listeners (one per connected device per user — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (userId: UserId): string => `notify:${userId}`;

/** Publish a persisted notification to the recipient's live channel. */
export function publishNotification(view: InboxView): void {
  emitter.emit(channelFor(view.payload.recipientUserId), view);
}

/** The recipient's live notification stream, scoped to one `userId` and torn down on `signal` abort. */
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
