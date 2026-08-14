// The per-user "an entity you own changed" live fan-out the sessions.streamUserEvents subscription tails.
// Live-only: unlike the chat + notifications buses there is no durable half. A domain verb emits after its
// durable write commits; a subscriber attaches and goes live, and the client gap-heals every (re)connect
// with a blanket invalidate. Rides `defineBusChannel` with NO firehose opt-in (client-architecture-
// lockdown.md §13/§16 G10) — `subscribeAll` is absent from this bus's type.
//
// Scope/authz: the channel is keyed by userId only; the subscription derives that userId from the request
// principal, never from client input. This bus rides the standard authed procedure, not the
// multiHumanProcedure belt — a single-user deployment must still get cross-device freshness.

import { AsyncLocalStorage } from "node:async_hooks";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { COARSE_USER_BUS_EVENT } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";
import { defineBusChannel } from "./bus-channel.ts";

const channelFor = (userId: UserId): string => `user:${userId}`;

const bus = defineBusChannel<UserId, UserBusEvent>(channelFor);

// ── QUIET MODE (W8 / owner fork F5: "server quiet-mode bulk emits", the #23 terminal fan generalized) ──────
//
// THE STORM. Every per-entity write announces itself, which is right for a single gesture and wrong for a
// bulk one: an ST profile import calls `character.create` once per CARD (`entry/import/build-import-context`),
// so an N-hundred-card library fans N `charactersChanged` — and `invalidateQueries` CANCELS and RESTARTS an
// in-flight fetch rather than deduping against it (the client seam's own measured note), so the visible
// library churned continuously for the whole import. The owner ruled the containment SERVER-side rather than
// as a client debounce (staleness design §4.5/F5, confirmed with the counter-argument on the table).
//
// THE SEMANTICS, per `(userId, event type)` pair, for the dynamic extent of `withQuietUserEvents`:
//   • the FIRST emit passes straight through — the START MARKER, so a watching surface refetches once at the
//     top of the run instead of staring at pre-run data for minutes;
//   • every later emit of that same pair is SILENCED;
//   • at scope exit, from a `finally`, ONE COARSE (hint-less) event per silenced pair is fanned.
// So an N-item single-type bulk gesture delivers exactly 1 + 1 events regardless of N, and the terminal fan
// is TOTAL BY CONSTRUCTION — it is derived from what was actually silenced, not from a hand-written list a
// future import wave would silently outgrow.
//
// WHY ASYNC-CONTEXT-SCOPED and not keyed on the userId alone: a suppressor that silenced "everything for user
// U" would also eat that same human's UNRELATED concurrent edits — a persona save made from another tab
// during a ten-minute import would sit invisible until the import finished. Only emits raised INSIDE the bulk
// run are quiet (the `foundation/observability/logger.ts` request-scope precedent).
//
// MISUSE, and its symptom: wrapping a NON-bulk path is harmless but visible — a single gesture emits once,
// that one emit is the start marker, nothing is ever silenced, and the terminal fan is empty. Wrapping a path
// that emits a pair TWICE for two genuinely different reasons collapses them into one coarse dedup event in
// the wire capture. Both are safe (invalidation is level-triggered and idempotent) and both mean the scope is
// in the wrong place.

/** The coalescing state one quiet scope carries. `announced` = the `(user, type)` pairs whose start marker
 *  already went out; `silenced` = per user, the types owed a terminal fan. */
interface QuietScope {
  readonly announced: Set<string>;
  readonly silenced: Map<UserId, Set<UserBusEvent["type"]>>;
}

const quietScope = new AsyncLocalStorage<QuietScope>();

const pairKey = (userId: UserId, type: UserBusEvent["type"]): string => `${userId}::${type}`;

/** Should this emit be swallowed? Records the debt when it is. Always `false` outside a quiet scope — which
 *  is what keeps a concurrent edit from a different request visible during a bulk run. */
function silence(userId: UserId, type: UserBusEvent["type"]): boolean {
  const scope = quietScope.getStore();
  if (scope === undefined) {
    return false;
  }
  const key = pairKey(userId, type);
  if (!scope.announced.has(key)) {
    scope.announced.add(key);
    return false;
  }
  const types = scope.silenced.get(userId);
  if (types === undefined) {
    scope.silenced.set(userId, new Set([type]));
  } else {
    types.add(type);
  }
  return true;
}

/**
 * Run a BULK operation under quiet mode (see the semantics block above). Entry-tier callers only: the scope
 * is opened where the bulk RUN is composed (`entry/compose/portability-runner.ts`), never inside a verb — a
 * verb cannot know whether it is one gesture or the four-hundredth iteration of one.
 *
 * The terminal fan runs from a `finally`, so a bulk run that THROWS or is ABORTED half-way still announces
 * everything it managed to write. That is the emit-is-total rule this bus's producers follow, applied to the
 * coalescer itself: silencing an event and then dying would be strictly worse than never silencing it.
 *
 * NESTED scopes join the outer one rather than opening a second — the outer run is the gesture, and an inner
 * scope with its own terminal would re-introduce the per-sub-batch fan this exists to remove.
 */
export async function withQuietUserEvents<T>(run: () => Promise<T>): Promise<T> {
  if (quietScope.getStore() !== undefined) {
    return await run();
  }
  const scope: QuietScope = { announced: new Set(), silenced: new Map() };
  try {
    return await quietScope.run(scope, run);
  } finally {
    // Published straight on the channel: `finally` is already outside `quietScope.run`, and going through
    // `publishUserEvent` would re-enter a gate that has nothing left to say.
    for (const [userId, types] of scope.silenced) {
      for (const type of types) {
        bus.publish(userId, COARSE_USER_BUS_EVENT[type]);
      }
    }
  }
}

/** Publish an "an entity you own changed" event to the owner's live channel. Fire-and-forget — a dropped
 *  tick is healed by the client's reconnect blanket invalidate. Inside a `withQuietUserEvents` scope this
 *  coalesces (see the QUIET MODE block); outside one — the overwhelming default — it publishes verbatim. */
export function publishUserEvent(userId: UserId, event: UserBusEvent): void {
  if (silence(userId, event.type)) {
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
