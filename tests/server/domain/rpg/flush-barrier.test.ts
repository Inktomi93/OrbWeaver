// @orb-waive-file test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
// tests/server/domain/rpg/flush-barrier — the per-chat in-flight FLUSH BARRIER (domain/rpg/flush-barrier.ts).
// A stateful feature-root collaborator: `register` records a chat's in-flight flush, `awaitInFlight` blocks the
// next turn's gather until the chat's flush(es) settle (bounded). Unit-tested directly (no engine/db) — the
// barrier is pure promise/timer machinery over an injected `onTimeout`.
//
// It is ALSO the state round's CANCELLATION scope (RPG-SIGNAL), because the character turn's own signal is
// released before the round runs. The cancel half is pinned below: owner scoping (the rollback-theft defense
// carried onto the state plane), reason FLATTENING (an `AbortSignal.any` reason would reach the provider error
// classifier and could turn a cancel into a RETRY), and the fact that a cancelled round still holds the barrier
// until it unwinds.

import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRpgFlushBarrier } from "@orb/server/domain/rpg";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT: ChatId = castId<ChatId>("chat_barrier_1");
const OWNER: UserId = castId<UserId>("user_owner");
const OTHER: UserId = castId<UserId>("user_other");

/** A promise + its resolve/reject handles — the test controls exactly when a "flush" settles. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve = (): void => undefined;
  let reject = (_e: unknown): void => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Register a flush that settles when the caller says so, ignoring the signal — the BARRIER-only shape every
 *  pre-cancellation test uses. Returns nothing the caller must await (the barrier tracks it). */
function registerFlush(barrier: ReturnType<typeof createRpgFlushBarrier>, flush: Promise<void>, ownerUserId: UserId = OWNER): Promise<void> {
  return barrier.register({ chatId: CHAT, ownerUserId, turnSignal: undefined, run: () => flush });
}

describe("rpg flush barrier", () => {
  test("no in-flight flush → awaitInFlight resolves immediately (the common fast path)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    await expect(barrier.awaitInFlight(CHAT)).resolves.toBeUndefined();
  });

  test("awaitInFlight blocks until the registered flush settles, then releases", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const flush = deferred();
    const registered = registerFlush(barrier, flush.promise);

    let released = false;
    const wait = barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false); // still blocked on the in-flight flush

    flush.resolve();
    await registered;
    await wait;
    expect(released).toBe(true);
  });

  test("a settled flush self-clears its entry (a later awaitInFlight is the fast path again)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const flush = deferred();
    const registered = registerFlush(barrier, flush.promise);
    flush.resolve();
    await registered;
    await barrier.awaitInFlight(CHAT); // drains the entry

    // A microtask later the `.finally` cleanup has run — a fresh await is the immediate fast path.
    await Promise.resolve();
    let released = false;
    await barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });
    expect(released).toBe(true);
  });

  test("a REJECTING flush still settles the barrier (rejection swallowed, entry clears)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const flush = deferred();
    const registered = registerFlush(barrier, flush.promise);
    flush.reject(new Error("flush blew up"));
    // awaitInFlight must resolve (never reject) — the barrier gates on SETTLEMENT, not success.
    await expect(barrier.awaitInFlight(CHAT)).resolves.toBeUndefined();
    await expect(registered).rejects.toThrow("flush blew up");
  });

  // S2 — the SET-not-latest hardening: two concurrent flushes on one chat (a barrier timeout left the older in
  // flight, or a lock-free generate raced a send) are BOTH tracked and BOTH awaited. A latest-only slot would
  // drop the older → a one-beat-staler read. This pins that awaitInFlight waits for EVERY in-flight flush.
  test("S2: TWO concurrent flushes are both tracked — awaitInFlight waits for ALL, not just the latest", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const older = deferred();
    const newer = deferred();
    const olderRegistered = registerFlush(barrier, older.promise);
    const newerRegistered = registerFlush(barrier, newer.promise); // a latest-only barrier would forget `older` here

    let released = false;
    const wait = barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });

    // Settle the NEWER one first; the barrier must STILL block on the older one.
    newer.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false); // the older flush is still in flight — a set-not-latest barrier holds

    older.resolve();
    await Promise.all([olderRegistered, newerRegistered]);
    await wait;
    expect(released).toBe(true); // both settled → released
  });

  // S2 corollary: after both settle the entry is gone (empty set deleted → fast path restored).
  test("S2: an emptied set is deleted (both concurrent flushes settling restores the fast path)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const a = deferred();
    const b = deferred();
    const aRegistered = registerFlush(barrier, a.promise);
    const bRegistered = registerFlush(barrier, b.promise);
    a.resolve();
    b.resolve();
    await Promise.all([aRegistered, bRegistered]);
    await barrier.awaitInFlight(CHAT);
    await Promise.resolve(); // let both `.finally` cleanups run
    let released = false;
    await barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });
    expect(released).toBe(true);
  });

  test("a hung flush releases at the bound + fires onTimeout (never a deadlocked turn)", async () => {
    vi.useFakeTimers();
    try {
      const timeouts: { chatId: ChatId }[] = [];
      const barrier = createRpgFlushBarrier((info) => timeouts.push({ chatId: info.chatId }), 1000);
      const hung = deferred(); // never resolves — a black-holed state round
      const registered = registerFlush(barrier, hung.promise);

      let released = false;
      const wait = barrier.awaitInFlight(CHAT).then(() => {
        released = true;
      });
      await vi.advanceTimersByTimeAsync(1000); // cross the bound
      await wait;
      expect(released).toBe(true); // the turn PROCEEDS on last-known state, not deadlocked
      expect(timeouts).toEqual([{ chatId: CHAT }]); // the timeout was logged
      hung.resolve();
      await registered;
    } finally {
      vi.useRealTimers();
    }
  });

  // ── CANCELLATION (RPG-SIGNAL) ────────────────────────────────────────────────────────────────────────────
  // The round's signal comes from HERE, not from the character turn — by the time a round is running, the turn's
  // `activeTurns` registration has been released and can signal nobody.

  test("cancel aborts the running round's OWN signal (the turn's registration is long gone by then)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const gate = deferred();
    let seen: AbortSignal | undefined;
    const registered = barrier.register({
      chatId: CHAT,
      ownerUserId: OWNER,
      turnSignal: undefined, // exactly the production shape: the turn's handle is already released
      run: (signal) => {
        seen = signal;
        return gate.promise;
      },
    });

    expect(seen?.aborted).toBe(false); // the round is running, uncancelled
    expect(barrier.cancel(CHAT, OWNER)).toBe(1);
    expect(seen?.aborted).toBe(true);
    gate.resolve();
    await registered;
  });

  test("cancel is OWNER-SCOPED — another member's Stop cannot kill this round (mirrors activeTurns.abort)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const gate = deferred();
    let seen: AbortSignal | undefined;
    const registered = barrier.register({
      chatId: CHAT,
      ownerUserId: OWNER,
      turnSignal: undefined,
      run: (signal) => {
        seen = signal;
        return gate.promise;
      },
    });

    // The rollback-theft defense on the state plane: a blanket per-chat cancel here would let member B end
    // member A's in-flight round, silently, and it would read as a feature.
    expect(barrier.cancel(CHAT, OTHER)).toBe(0);
    expect(seen?.aborted).toBe(false);
    expect(barrier.cancel(CHAT, OWNER)).toBe(1);
    expect(seen?.aborted).toBe(true);
    gate.resolve();
    await registered;
  });

  test("cancel on a chat with no in-flight round is an idempotent 0 (the no-op the abort verb reads)", () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    expect(barrier.cancel(CHAT, OWNER)).toBe(0);
  });

  // The MULTI-SPEAKER overlap window — the one case the character turn's own signal DOES cover (every speaker
  // in a round shares one registration, so speaker 1's round is still reachable while speaker 2 generates).
  // Arm B must not lose it while replacing it: the turn signal is folded into the round's controller.
  test("the character turn's signal is folded in — aborting it cancels the round (multi-speaker overlap)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const turn = new AbortController();
    const gate = deferred();
    let seen: AbortSignal | undefined;
    const registered = barrier.register({
      chatId: CHAT,
      ownerUserId: OWNER,
      turnSignal: turn.signal,
      run: (signal) => {
        seen = signal;
        return gate.promise;
      },
    });

    expect(seen?.aborted).toBe(false);
    turn.abort();
    expect(seen?.aborted).toBe(true);
    gate.resolve();
    await registered;
  });

  // A turn aborted BEFORE its flush was even registered (an earlier speaker's round queued behind a Stop): the
  // round must be born cancelled, not run once and then notice.
  test("an ALREADY-aborted turn signal makes the round born-cancelled", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const turn = new AbortController();
    turn.abort();
    let seen: AbortSignal | undefined;
    await barrier.register({
      chatId: CHAT,
      ownerUserId: OWNER,
      turnSignal: turn.signal,
      run: (signal) => {
        seen = signal;
        return Promise.resolve();
      },
    });
    expect(seen?.aborted).toBe(true);
  });

  // THE CLASSIFIER GUARD. `AbortSignal.any` PROPAGATES the source's `reason`, and this signal is handed to
  // provider requests; `classifyTransportName` (backends/kit/error-classify.ts) regexes an error's name+message
  // for /timeout|connection|network|overload/ and returns retryable-`server`, which `retry.ts` RE-RUNS. So a
  // chat-domain abort reason carrying the word "timeout" would turn a cancelled round into a re-billed one.
  // The barrier re-aborts its own controller instead, flattening every cause to a plain AbortError.
  test("the composed signal does NOT propagate the turn's abort reason (a retryable-looking reason would re-run the round)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const turn = new AbortController();
    let seen: AbortSignal | undefined;
    await barrier.register({
      chatId: CHAT,
      ownerUserId: OWNER,
      turnSignal: turn.signal,
      run: (signal) => {
        seen = signal;
        return Promise.resolve();
      },
    });

    turn.abort(new Error("connection timeout while draining the turn"));
    expect(seen?.aborted).toBe(true);
    // The source reason is NOT carried through — the round's reason is the default AbortError, whose name+message
    // the transport classifier reads as `aborted`, never as a retryable server fault.
    expect(seen?.reason).not.toBe(turn.signal.reason);
    expect(String((seen?.reason as { name?: string } | undefined)?.name)).toBe("AbortError");
    await Promise.resolve();
  });

  // A cancelled round is NOT dropped from the in-flight set (unlike `activeTurns.abort`, which deletes): it still
  // has to unwind and clear its staging, and the next gather must not read before that. Dropping it here would
  // re-open the very stale-read race this barrier exists to close.
  test("a CANCELLED round still holds the barrier until it actually settles", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const gate = deferred();
    const registered = registerFlush(barrier, gate.promise);
    expect(barrier.cancel(CHAT, OWNER)).toBe(1);

    let released = false;
    const wait = barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false); // cancelled ≠ settled — the unwinding round still gates the next turn

    gate.resolve();
    await registered;
    await wait;
    expect(released).toBe(true);
  });
});
