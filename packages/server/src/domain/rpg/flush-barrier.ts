// domain/rpg/flush-barrier — the per-chat in-flight FLUSH BARRIER (the delivery-model amendment's
// "one-beat-behind but GUARANTEED" semantics, made real). A STATEFUL feature-root collaborator (a per-chat
// promise Map), NOT a pure `substrate/` helper — the `staging.ts` precedent (a feature-root singleton the
// feature-structure allowlist pre-documents).
//
// WHY it exists: the post-turn flush is FIRE-AND-FORGET (a background state write must NEVER turn a committed
// reply into an abort — `engine.ts:fireRpgTurnCompleted`). With the DEDICATED state round (owner ruling
// 2026-07-27) that flush now takes 0.8-2.9s (a real extraction/tool-round call), so a fast re-send can begin
// ASSEMBLING the next turn's reminder BEFORE the prior flush landed — the reminder reads STALE state (the
// race the exec confirmed live: ex2 read beats:0 while ex1's flush was in flight). This was unraceable at the
// old 5-54ms window; the dedicated round made it real.
//
// THE BARRIER: `register(chatId, flush)` records a chat's in-flight flush promise; `await awaitInFlight(chatId)`
// (called by the gather BEFORE it builds the reminder — `chat-ops/gather.ts`) blocks the next turn's assembly
// until that chat's flush(es) settle, so the reminder always reads the just-committed state. This implements the
// ratified "one-beat-behind but GUARANTEED" contract (the freshness indicator's "Updating…" gets its real
// referent). BOUNDED: a flush that hangs past `BARRIER_TIMEOUT_MS` does NOT deadlock the turn — the await
// resolves, logs the timeout (via the injected `onTimeout`), and the turn PROCEEDS on the last-known state
// (visible degrade, never a hung turn — the honest-arms posture).
//
// A SET PER CHAT, NOT LATEST-ONLY (S2 hardening): after a barrier TIMEOUT (the prior flush released the wait but
// is still in flight) OR a lock-free `generate` running concurrent with a locked `send`, TWO flushes can be in
// flight on one chat at once. A latest-only slot would leave the OLDER one untracked → the gather could read
// one-beat-staler state in that corner. Tracking a SET and awaiting ALL of them kills the corner outright: every
// in-flight flush for a chat is waited on, each entry self-removes from the set on settle (`.finally`), and an
// empty set is deleted so the common fast path stays a Map miss.
//
// ASSUMES(single-replica): the map is process-local, same posture as the staging accumulator + the chat-turn
// lock. A multi-replica deploy would need a shared barrier (a doorway, not built).

import type { ChatId } from "@orb/kit/ids";
import type { FlushBarrierOnTimeout, RpgFlushBarrier } from "./contract/service.ts";

/** The bound: a flush that hasn't settled within this window releases the barrier (the turn proceeds on the
 *  last-known state rather than deadlocking on a hung flush). A flush is a single extraction/tool-round call +
 *  a snapshot write — measured 0.8-2.9s; the bound is generous headroom, never a normal-path wait. */
const BARRIER_TIMEOUT_MS = 15_000;

// The barrier's types (`RpgFlushBarrier`, `FlushBarrierOnTimeout`) are homed in `contract/service.ts` (a type
// has no home in a stateful root file — substrate-not-a-type-home); this file owns only the factory + the bound.

/** Build the flush barrier (a compose-created singleton — one per server process, like the staging store). */
export function createRpgFlushBarrier(onTimeout: FlushBarrierOnTimeout, timeoutMs: number = BARRIER_TIMEOUT_MS): RpgFlushBarrier {
  // The SET of in-flight flushes per chat (S2). Each flush self-removes on settle; an emptied set is deleted so
  // the common fast path (no in-flight flush) is a Map miss. Two concurrent flushes on one chat are BOTH tracked.
  const inFlight = new Map<ChatId, Set<Promise<void>>>();

  return {
    register(chatId: ChatId, flush: Promise<void>): void {
      const set = inFlight.get(chatId) ?? new Set<Promise<void>>();
      inFlight.set(chatId, set);
      // Swallow the flush's own rejection at the barrier (its error handling logs it — the barrier only gates on
      // SETTLEMENT, success or failure). `.finally` removes THIS flush from the set; an emptied set is deleted.
      const tracked: Promise<void> = flush
        .catch(() => undefined)
        .finally(() => {
          const live = inFlight.get(chatId);
          if (live !== undefined) {
            live.delete(tracked);
            if (live.size === 0) {
              inFlight.delete(chatId);
            }
          }
        });
      set.add(tracked);
    },
    async awaitInFlight(chatId: ChatId): Promise<void> {
      const set = inFlight.get(chatId);
      if (set === undefined || set.size === 0) {
        return; // fast path — no in-flight flush for this chat (the common case)
      }
      // Snapshot the set (a flush settling mid-wait mutates it) and await ALL of them against the ONE bound:
      // whichever resolves first per the race releases, but we wait for EVERY tracked flush (or the bound). A
      // hung flush proceeds the turn on last-known state (visible degrade via `onTimeout`), never a deadlock.
      const flushes = [...set];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = Symbol("barrier-timeout");
      const timeout = new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), timeoutMs);
      });
      const allSettled = Promise.all(flushes.map((f) => f.then(() => undefined))).then(() => undefined);
      const outcome = await Promise.race([allSettled, timeout]);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (outcome === timedOut) {
        onTimeout({ chatId });
      }
    },
  };
}
