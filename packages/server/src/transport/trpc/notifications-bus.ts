// The per-user live fan-out the notifications subscription tails. The notifications domain owns the
// durable half (the record INSERT + the list cursor by seq); the per-user live bus is transport state.
// Rides `defineBusChannel` with NO firehose opt-in (client-architecture-lockdown.md §13/§16 G10).
//
// Durable-first / fan-out-second: entry composes EmitNotification so record (the durable INSERT, which
// assigns seq) always runs before publishNotification, so a dead bus path never loses an event. Durability
// is composed OUTSIDE this module (entry/compose/chat.ts's `emitNotification`).

import type { UserId } from "@orb/kit/ids";
import type { InboxView } from "#domain/notifications";
import { defineBusChannel } from "./bus-channel";

const channelFor = (userId: UserId): string => `notify:${userId}`;

const bus = defineBusChannel<UserId, InboxView>(channelFor);

/** Publish a persisted notification to the recipient's live channel. */
export function publishNotification(view: InboxView): void {
  bus.publish(view.payload.recipientUserId, view);
}

/** The recipient's live notification stream, scoped to one `userId` and torn down on `signal` abort. */
export function subscribeNotifications(
  userId: UserId,
  signal: AbortSignal,
): AsyncIterable<InboxView> {
  return bus.subscribe(userId, signal);
}
