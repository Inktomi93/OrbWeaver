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
// IT IS ALSO THE ROUND'S CANCELLATION SCOPE (RPG-SIGNAL, 2026-08-03) — and it has to be, because the CHARACTER
// TURN's own AbortSignal cannot reach the round. The timeline, measured on this tree:
//   1. `engine.ts` commits the reply, then fires the flush FIRE-AND-FORGET (`fireRpgTurnCompleted`);
//   2. `executeTurn` returns microseconds later; `runRegistered`'s `finally` calls `handle.release()`;
//   3. `release()` DELETES the entry from the `activeTurns` registry (`domain/chat/active-turns.ts`) — from that
//      instant `activeTurns.abort(chatId, user)` walks a set the turn is no longer in and signals NOBODY;
//   4. the round then runs its model call for the 0.8-2.9s documented above, uncancelable.
// So a bare "thread `prep.signal` into the round" would have cancelled only the MULTI-SPEAKER overlap window
// (speaker 1's round while speaker 2 still generates under the shared registration) — correct-looking and
// nearly useless. The round therefore gets its OWN lifetime here: `register` mints its controller, folds the
// turn signal in (so the overlap window is covered too), and `cancel` is the door the chat `abort` verb reaches
// through (`ChatRpgOps.cancelStateRounds`).
//
// SCOPE AND BARRIER ARE ONE MAP by construction. "Which rounds are in flight for this chat" is the identical
// question the barrier and the canceller both ask; two registries answering it would drift, and the drift would
// be invisible (a cancel that signals a round the barrier already forgot, or a barrier waiting on a round the
// canceller cannot see).
//
// OWNER-SCOPED CANCEL, mirroring `activeTurns.abort` EXACTLY: only the caller's own rounds are signalled. That
// registry is deliberately owner-only (the rollback-theft defense — a host cannot abort a member's turn), and a
// blanket per-chat cancel here would re-open exactly that hole on the state plane: member B pressing Stop would
// kill member A's in-flight round, silently, and it would look like a feature.
//
// REASON-FLATTENING, NOT `AbortSignal.any` (the `backends/kit/idle-timeout.ts` archetype, whose header states
// the bug): `.any` PROPAGATES the source signal's `reason`, and this signal is threaded onto provider requests.
// `classifyTransportName` (`backends/kit/error-classify.ts`) decides `aborted` vs retryable-`server` by regex
// over an error's name+message, so an abort reason whose text contains "timeout"/"connection"/"network" would
// classify a CANCELLED round as a retryable fault and `retry.ts` would RE-RUN it — the opposite of cancelling.
// Re-aborting our own controller with no argument makes every cause a plain AbortError.
// TRUTH-REPAIR 2026-08-06 (STRUCTURED-ABORT-REASON-LEAK): this header used to say the `structured` role passes
// `req.signal` straight through, "so flattening HERE is what covers both arms". That is no longer true — every
// role dispatch now flattens at the ONE provider seam (`infra/providers/roles/dispatch.ts::runRole`, law in
// `backends/kit/abort-flatten.ts`), so no caller depends on this fold for classifier safety. The fold STAYS
// regardless: this controller is the round's own cancellation SCOPE (it must exist for `cancel`), the fold is
// how a turn abort reaches it, and flattening at both ends is free.
//
// ASSUMES(single-replica): the map is process-local, same posture as the staging accumulator + the chat-turn
// lock. A multi-replica deploy would need a shared barrier (a doorway, not built).

import type { ChatId, UserId } from "@orb/kit/ids";
import type { FlushBarrierOnTimeout, RpgFlushBarrier } from "./contract/service.ts";

/** The bound: a flush that hasn't settled within this window releases the barrier (the turn proceeds on the
 *  last-known state rather than deadlocking on a hung flush). A flush is a single extraction/tool-round call +
 *  a snapshot write — measured 0.8-2.9s; the bound is generous headroom, never a normal-path wait. */
const BARRIER_TIMEOUT_MS = 15_000;

// The barrier's types (`RpgFlushBarrier`, `FlushBarrierOnTimeout`) are homed in `contract/service.ts` (a type
// has no home in a stateful root file — substrate-not-a-type-home); this file owns only the factory + the bound.

/** One in-flight flush: its cancellation controller, the owner `cancel` scopes to, and the settle-tracked
 *  promise `awaitInFlight` gates on. */
interface InFlightFlush {
  readonly ownerUserId: UserId;
  readonly controller: AbortController;
  /** Assigned immediately after `run` is invoked, inside the same synchronous `register` call — no `await` can
   *  interleave between the two statements, so the placeholder below is never observable to any caller. */
  tracked: Promise<void>;
}

/** Build the flush barrier (a compose-created singleton — one per server process, like the staging store). */
export function createRpgFlushBarrier(onTimeout: FlushBarrierOnTimeout, timeoutMs: number = BARRIER_TIMEOUT_MS): RpgFlushBarrier {
  // The SET of in-flight flushes per chat (S2). Each flush self-removes on settle; an emptied set is deleted so
  // the common fast path (no in-flight flush) is a Map miss. Two concurrent flushes on one chat are BOTH tracked.
  const inFlight = new Map<ChatId, Set<InFlightFlush>>();

  return {
    register({ chatId, ownerUserId, turnSignal, run }): Promise<void> {
      // The round's OWN controller. The turn's signal is FOLDED IN by re-aborting this one (never
      // `AbortSignal.any`) so no chat-domain abort reason can reach the provider error classifier — see the
      // header, and `backends/kit/idle-timeout.ts` for the archetype and the bug it was written against.
      const controller = new AbortController();
      if (turnSignal !== undefined) {
        if (turnSignal.aborted) {
          controller.abort();
        } else {
          turnSignal.addEventListener("abort", (): void => controller.abort(), { once: true });
        }
      }
      const set = inFlight.get(chatId) ?? new Set<InFlightFlush>();
      inFlight.set(chatId, set);
      const entry: InFlightFlush = { ownerUserId, controller, tracked: Promise.resolve() };
      // Registered BEFORE the body runs: the in-flight entry must exist the instant `onTurnCompleted` is called
      // (the stale-read race the header describes) AND before `run` can reach its first await.
      set.add(entry);
      const flush = run(controller.signal);
      // Swallow the flush's own rejection at the barrier (its error handling logs it — the barrier only gates on
      // SETTLEMENT, success or failure). `.finally` removes THIS flush from the set; an emptied set is deleted.
      entry.tracked = flush
        .catch(() => undefined)
        .finally(() => {
          const live = inFlight.get(chatId);
          if (live !== undefined) {
            live.delete(entry);
            if (live.size === 0) {
              inFlight.delete(chatId);
            }
          }
        });
      return flush;
    },
    cancel(chatId: ChatId, ownerUserId: UserId): number {
      const set = inFlight.get(chatId);
      if (set === undefined) {
        return 0;
      }
      let cancelled = 0;
      for (const entry of set) {
        if (entry.ownerUserId === ownerUserId) {
          entry.controller.abort();
          cancelled += 1;
        }
      }
      // Deliberately NOT deleted from the set (unlike `activeTurns.abort`): a cancelled round still has to
      // unwind and clear its staging, and the next turn's gather must wait for that — dropping it here would
      // re-open the stale-read race this barrier exists to close. The `.finally` above removes it on settle.
      return cancelled;
    },
    async awaitInFlight(chatId: ChatId): Promise<void> {
      const set = inFlight.get(chatId);
      if (set === undefined || set.size === 0) {
        return; // fast path — no in-flight flush for this chat (the common case)
      }
      // Snapshot the set (a flush settling mid-wait mutates it) and await ALL of them against the ONE bound:
      // whichever resolves first per the race releases, but we wait for EVERY tracked flush (or the bound). A
      // hung flush proceeds the turn on last-known state (visible degrade via `onTimeout`), never a deadlock.
      const flushes = [...set].map((entry) => entry.tracked);
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
