// The per-user "an entity you own changed" live fan-out the sessions.streamUserEvents subscription tails.
// Live-only: unlike the chat + notifications buses there is no durable half. A domain verb emits after its
// durable write commits; a subscriber attaches and goes live, and the client gap-heals every (re)connect
// with a blanket invalidate.
//
// Scope/authz: the channel is keyed by userId only; the subscription derives that userId from the request
// principal, never from client input. This bus rides the standard authed procedure, not the
// multiHumanProcedure belt — a single-user deployment must still get cross-device freshness.

import { EventEmitter, on } from "node:events";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";

// Process-local; unbounded listeners (one per connected device per user — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (userId: UserId): string => `user:${userId}`;

/** Publish an "an entity you own changed" event to the owner's live channel. Fire-and-forget — a dropped
 *  tick is healed by the client's reconnect blanket invalidate. */
export function publishUserEvent(userId: UserId, event: UserBusEvent): void {
  emitter.emit(channelFor(userId), event);
}

/** Publish a `chatsChanged` to one member's channel. `chatId` present ⇒ the changed chat's detail
 *  (getChat) refetches too (the lifecycle/create/delete case); omitted on the message-commit terminal
 *  path, where the per-chat bus already drives every subscribed device's getChat. */
export function publishChatChanged(userId: UserId, chatId: ChatId | undefined): void {
  const event: UserBusEvent =
    chatId === undefined ? { type: "chatsChanged" } : { type: "chatsChanged", chatId };
  emitter.emit(channelFor(userId), event);
}

/** The user's live entity-changed stream, scoped to one `userId` and torn down on `signal` abort. */
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
