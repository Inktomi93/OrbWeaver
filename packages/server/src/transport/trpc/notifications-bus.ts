// The per-user live fan-out the notifications subscription tails. The notifications domain owns the
// durable half (the record INSERT + the list cursor by seq); the per-user live bus is transport state.
// Rides `defineBusChannel` with NO firehose opt-in (client-architecture-state-and-gates.md §13/§16 G10).
//
// Durable-first / fan-out-second: entry composes EmitNotification so record (the durable INSERT, which
// assigns seq) always runs before publishNotification, so a dead bus path never loses an event. Durability
// is composed OUTSIDE this module (entry/compose/chat.ts's `emitNotification`).

import type { UserId } from "@orb/kit/ids";
import type { InboxView } from "#domain/notifications";
import { defineBusChannel } from "./bus-channel.ts";

const channelFor = (userId: UserId): string => `notify:${userId}`;

interface NotificationPublication {
  readonly view: InboxView;
  readonly inPlace: boolean;
}

const bus = defineBusChannel<UserId, NotificationPublication>(channelFor);

/** Publish a persisted notification; in-place corrections and settlements retain the row's original seq. */
export function publishNotification(view: InboxView, inPlace = false): void {
  bus.publish(view.payload.recipientUserId, { view, inPlace });
}

/** The recipient's live notification stream, scoped to one `userId` and torn down on `signal` abort. */
export function subscribeNotifications(userId: UserId, signal: AbortSignal): AsyncIterable<NotificationPublication> {
  return bus.subscribe(userId, signal);
}
