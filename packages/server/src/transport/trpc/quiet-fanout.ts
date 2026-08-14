// QUIET MODE — the bulk-fanout coalescer, for BOTH live audience planes (chat rooms, generalized to
// room pairs by the entity→room member-freshness bridge). One AsyncLocalStorage scope, one pair
// map, two registration doors.
//
// THE STORM. Every per-entity write announces itself, which is right for a single gesture and wrong for a
// bulk one: an ST profile import calls `character.create` once per CARD
// (`entry/import/build-import-context`), so an N-hundred-card library fans N `charactersChanged` — and
// `invalidateQueries` CANCELS and RESTARTS an in-flight fetch rather than deduping against it (the client
// seam's own measured note), so the visible library churned continuously for the whole import. The owner
// ruled the containment SERVER-side rather than as a client debounce (confirmed
// with the counter-argument on the table). The ROOM plane inherits the identical math: a bulk run touching N
// seated entities fans N×rooms `roomEntityChanged`, and each tick cancels+restarts every open member's
// in-flight refetch (yes, silence and coalesce, coarse terminal per (room, kind)).
//
// THE SEMANTICS, per PAIR, for the dynamic extent of `withQuietBulkFanout`:
//   • the FIRST fan of a pair passes straight through — the START MARKER, so a watching surface refetches
//     once at the top of the run instead of staring at pre-run data for minutes;
//   • every later fan of that same pair is SILENCED;
//   • at scope exit, from a `finally`, ONE terminal per silenced pair is fanned.
// So an N-item bulk gesture delivers exactly 1 + 1 events per pair regardless of N, and the terminal fan is
// TOTAL BY CONSTRUCTION — it is derived from what was actually silenced, not from a hand-written list a
// future import wave would silently outgrow.
//
// THE PAIR IS THE PLANE'S OWN NARROWEST INVALIDATION UNIT, which is why there are two doors and not one
// generic `silence(key)`: the user plane keys `(userId, event type)` and the room plane keys
// `(chatId, entity)`. A caller cannot mint a third key spelling by hand — it must add a door here, which is
// where the terminal shape gets decided too.
//
// THE TERMINAL IS A THUNK THE CALLER SUPPLIES, and that is the seam that keeps this module import-free of
// both buses (a coalescer that published would have to import `user-events-bus` — which imports this — and
// `chat-events-bus`). It also lets each plane state its own terminal FORM: the user plane's is the COARSE
// (hint-less) variant of the event, the room plane's is the event verbatim (a `roomEntityChanged` is already
// id-free, so it IS its own coarse form).
//
// WHY ASYNC-CONTEXT-SCOPED and not keyed on the userId alone: a suppressor that silenced "everything for user
// U" would also eat that same human's UNRELATED concurrent edits — a persona save made from another tab
// during a ten-minute import would sit invisible until the import finished. Only fans raised INSIDE the bulk
// run are quiet (the `foundation/observability/logger.ts` request-scope precedent). The room plane inherits
// this for free: the domain-event dispatch that drives the reach engine runs inside the emitting request's
// async context (`entry/compose/event-bus.ts` — `emit` is called synchronously by the verb and
// `void dispatch(…)` captures the ambient context), so a bulk run covers the bridge with no new plumbing at
// the call sites.
//
// MISUSE, and its symptom: wrapping a NON-bulk path is harmless but visible — a single gesture emits once,
// that one emit is the start marker, nothing is ever silenced, and the terminal fan is empty. Wrapping a path
// that emits a pair TWICE for two genuinely different reasons collapses them into one coarse dedup event in
// the wire capture. Both are safe (invalidation is level-triggered and idempotent) and both mean the scope is
// in the wrong place.
//
// NOT COALESCABLE, deliberately: `chatDeleted`. It is on the same live-only lane as `roomEntityChanged` but
// it is a TERMINAL event, not a churn one — one per room, ever — so there is no storm to contain, and
// silencing even the first tick of it would leave an open device pointed at a room that is gone until the
// scope exits. The narrowing lives at the emit surface (`entry/compose/services::emitChatEventLive` consults
// this module for exactly one member).

import { AsyncLocalStorage } from "node:async_hooks";
import type { RoomEntityKind } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";

/** The coalescing state one quiet scope carries. `announced` = the pairs whose start marker already went out;
 *  `terminals` = the pairs owed a terminal fan, each with the thunk that fans it (last one wins — the fans of
 *  one pair are by definition interchangeable, which is the whole premise of coalescing them). */
interface QuietScope {
  readonly announced: Set<string>;
  readonly terminals: Map<string, () => void>;
}

const quietScope = new AsyncLocalStorage<QuietScope>();

/** Should this fan be swallowed? Records the terminal debt when it is. Always `false` outside a quiet scope —
 *  which is what keeps a concurrent edit from a different request visible during a bulk run. */
function silence(key: string, terminal: () => void): boolean {
  const scope = quietScope.getStore();
  if (scope === undefined) {
    return false;
  }
  if (!scope.announced.has(key)) {
    scope.announced.add(key);
    return false;
  }
  scope.terminals.set(key, terminal);
  return true;
}

/** The USER plane's door — pair `(userId, event type)`. `terminal` fans the COARSE (hint-less) form. */
export function silenceUserEvent(userId: UserId, type: UserBusEvent["type"], terminal: () => void): boolean {
  return silence(`user::${userId}::${type}`, terminal);
}

/** The ROOM plane's door — pair `(chatId, entity)`. `terminal` re-fans the event, which is already its own
 *  coarse form (a `roomEntityChanged` is id-free: it says WHICH room and WHICH kind, never which row). */
export function silenceRoomEntityFan(chatId: ChatId, entity: RoomEntityKind, terminal: () => void): boolean {
  return silence(`room::${chatId}::${entity}`, terminal);
}

/**
 * Run a BULK operation under quiet mode (see the semantics block above). Entry-tier callers only: the scope
 * is opened where the bulk RUN is composed (`entry/compose/portability-runner.ts`), never inside a verb — a
 * verb cannot know whether it is one gesture or the four-hundredth iteration of one.
 *
 * The terminal fan runs from a `finally`, so a bulk run that THROWS or is ABORTED half-way still announces
 * everything it managed to write. That is the emit-is-total rule this codebase's producers follow, applied to
 * the coalescer itself: silencing an event and then dying would be strictly worse than never silencing it.
 *
 * NESTED scopes join the outer one rather than opening a second — the outer run is the gesture, and an inner
 * scope with its own terminal would re-introduce the per-sub-batch fan this exists to remove.
 *
 * (Named `withQuietUserEvents` until it learned room pairs — a name claiming one plane while
 * silencing two is a lying comment in function form.)
 */
export async function withQuietBulkFanout<T>(run: () => Promise<T>): Promise<T> {
  if (quietScope.getStore() !== undefined) {
    return await run();
  }
  const scope: QuietScope = { announced: new Set(), terminals: new Map() };
  try {
    return await quietScope.run(scope, run);
  } finally {
    // `finally` is already outside `quietScope.run`, so each thunk publishes straight through: re-entering a
    // gate that has nothing left to say would only risk re-silencing the terminal itself.
    for (const terminal of scope.terminals.values()) {
      terminal();
    }
  }
}
