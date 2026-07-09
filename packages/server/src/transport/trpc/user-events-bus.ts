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
import type { ChatId, UserId } from "@orb/kit/ids";

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

/** Publish a `chatsChanged` to ONE member's channel — the entry-composed member-fan helper
 *  (`entry/compose/emit-chat-changed.ts`) calls this per present human member of the changed chat, so the
 *  `chatsChanged` producer literal lives HERE in transport (the `user-bus-coverage` gate scans the
 *  domain/transport literal corpus). `chatId` present ⇒ the changed chat's DETAIL (`getChat`) refetches too
 *  (the lifecycle/create/delete case, where the chat row itself changed); OMITTED on the message-commit
 *  terminal path — there the per-chat bus already drives every subscribed device's `getChat`, so a `chatId`
 *  here would triple-invalidate `getChat`/`listChats` inside the commit+complete window and trip the dup
 *  alarm; the terminal fan drives ONLY the chat LIST + character library (the `chatId`-undefined map arm). */
export function publishChatChanged(userId: UserId, chatId: ChatId | undefined): void {
  const event: UserBusEvent =
    chatId === undefined ? { type: "chatsChanged" } : { type: "chatsChanged", chatId };
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
