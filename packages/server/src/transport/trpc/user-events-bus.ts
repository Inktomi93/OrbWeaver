// The per-user "an entity you own changed" live fan-out the sessions.streamUserEvents subscription tails.
// Live-only: unlike the chat + notifications buses there is no durable half. A domain verb emits after its
// durable write commits; a subscriber attaches and goes live, and the client gap-heals every (re)connect
// with a blanket invalidate. Rides `defineBusChannel` with NO firehose opt-in (client-architecture-
// lockdown.md §13/§16 G10) — `subscribeAll` is absent from this bus's type.
//
// Scope/authz: the channel is keyed by userId only; the subscription derives that userId from the request
// principal, never from client input. This bus rides the standard authed procedure, not the
// multiHumanProcedure belt — a single-user deployment must still get cross-device freshness.
//
// BULK QUIET MODE lives in `quiet-fanout.ts`, not here: it coalesces BOTH live planes (this one and the
// room's live-only entity fan), so a home inside either bus would be a lie about its reach.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { COARSE_USER_BUS_EVENT } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";
import { defineBusChannel } from "./bus-channel.ts";
import { silenceUserEvent } from "./quiet-fanout.ts";

const channelFor = (userId: UserId): string => `user:${userId}`;

const bus = defineBusChannel<UserId, UserBusEvent>(channelFor);

/** Publish an "an entity you own changed" event to the owner's live channel. Fire-and-forget — a dropped
 *  tick is healed by the client's reconnect blanket invalidate. Inside a `withQuietBulkFanout` scope this
 *  coalesces to 1 + 1 events per `(userId, type)` pair (`quiet-fanout.ts` carries the whole rationale);
 *  outside one — the overwhelming default — it publishes verbatim.
 *
 *  The TERMINAL form is decided here, at the plane that owns it: `COARSE_USER_BUS_EVENT[type]` is the
 *  hint-less variant, because a coalesced run cannot honestly claim any single entity id. */
export function publishUserEvent(userId: UserId, event: UserBusEvent): void {
  if (silenceUserEvent(userId, event.type, () => bus.publish(userId, COARSE_USER_BUS_EVENT[event.type]))) {
    return;
  }
  bus.publish(userId, event);
}

/** Publish a `chatsChanged` to one member's channel. `chatId` present ⇒ the changed chat's detail
 *  (getChat) refetches too (the lifecycle/create/delete case); omitted on the message-commit terminal
 *  path, where the per-chat bus already drives every subscribed device's getChat. */
export function publishChatChanged(userId: UserId, chatId: ChatId | undefined): void {
  const event: UserBusEvent = chatId === undefined ? { type: "chatsChanged" } : { type: "chatsChanged", chatId };
  publishUserEvent(userId, event);
}

/** The user's live entity-changed stream, scoped to one `userId` and torn down on `signal` abort. */
export function subscribeUserEvents(userId: UserId, signal: AbortSignal): AsyncIterable<UserBusEvent> {
  return bus.subscribe(userId, signal);
}
