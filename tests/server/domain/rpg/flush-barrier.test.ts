// tests/server/domain/rpg/flush-barrier — the per-chat in-flight FLUSH BARRIER (domain/rpg/flush-barrier.ts).
// A stateful feature-root collaborator: `register` records a chat's in-flight flush, `awaitInFlight` blocks the
// next turn's gather until the chat's flush(es) settle (bounded). Unit-tested directly (no engine/db) — the
// barrier is pure promise/timer machinery over an injected `onTimeout`.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRpgFlushBarrier } from "@orb/server/domain/rpg";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT: ChatId = castId<ChatId>("chat_barrier_1");

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

describe("rpg flush barrier", () => {
  test("no in-flight flush → awaitInFlight resolves immediately (the common fast path)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    await expect(barrier.awaitInFlight(CHAT)).resolves.toBeUndefined();
  });

  test("awaitInFlight blocks until the registered flush settles, then releases", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const flush = deferred();
    barrier.register(CHAT, flush.promise);

    let released = false;
    const wait = barrier.awaitInFlight(CHAT).then(() => {
      released = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false); // still blocked on the in-flight flush

    flush.resolve();
    await wait;
    expect(released).toBe(true);
  });

  test("a settled flush self-clears its entry (a later awaitInFlight is the fast path again)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const flush = deferred();
    barrier.register(CHAT, flush.promise);
    flush.resolve();
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
    barrier.register(CHAT, flush.promise);
    flush.reject(new Error("flush blew up"));
    // awaitInFlight must resolve (never reject) — the barrier gates on SETTLEMENT, not success.
    await expect(barrier.awaitInFlight(CHAT)).resolves.toBeUndefined();
  });

  // S2 — the SET-not-latest hardening: two concurrent flushes on one chat (a barrier timeout left the older in
  // flight, or a lock-free generate raced a send) are BOTH tracked and BOTH awaited. A latest-only slot would
  // drop the older → a one-beat-staler read. This pins that awaitInFlight waits for EVERY in-flight flush.
  test("S2: TWO concurrent flushes are both tracked — awaitInFlight waits for ALL, not just the latest", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const older = deferred();
    const newer = deferred();
    barrier.register(CHAT, older.promise);
    barrier.register(CHAT, newer.promise); // a latest-only barrier would forget `older` here

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
    await wait;
    expect(released).toBe(true); // both settled → released
  });

  // S2 corollary: after both settle the entry is gone (empty set deleted → fast path restored).
  test("S2: an emptied set is deleted (both concurrent flushes settling restores the fast path)", async () => {
    const barrier = createRpgFlushBarrier(() => undefined);
    const a = deferred();
    const b = deferred();
    barrier.register(CHAT, a.promise);
    barrier.register(CHAT, b.promise);
    a.resolve();
    b.resolve();
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
      barrier.register(CHAT, hung.promise);

      let released = false;
      const wait = barrier.awaitInFlight(CHAT).then(() => {
        released = true;
      });
      await vi.advanceTimersByTimeAsync(1000); // cross the bound
      await wait;
      expect(released).toBe(true); // the turn PROCEEDS on last-known state, not deadlocked
      expect(timeouts).toEqual([{ chatId: CHAT }]); // the timeout was logged
    } finally {
      vi.useRealTimers();
    }
  });
});
