// substrate/serial-lanes — the ordering primitive behind #1423 (per-chat event queueing) and #1421 (the
// per-rule/book lore ceiling). Pins the four properties every caller relies on: same key runs in submission
// order with no overlap, different keys stay parallel, a REJECTING job neither escapes as someone else's
// failure nor wedges its lane, and a drained lane is deleted (the Map is bounded by ACTIVE keys, not by every
// key ever seen — an unbounded Map keyed by chatId is a memory leak on a long-lived server).

import { describe } from "vitest";
import { activeLaneCount, runInLane } from "../../../../../packages/server/src/domain/automation/substrate/serial-lanes.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A promise a test resolves by hand — the only way to hold a job open across an assertion. */
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runInLane", () => {
  test("two jobs on the SAME key never overlap — the second starts only after the first settles", async () => {
    const gate = deferred();
    const order: string[] = [];

    const first = runInLane("same", async () => {
      order.push("a:enter");
      await gate.promise;
      order.push("a:exit");
    });
    const second = runInLane("same", () => {
      order.push("b:enter");
      return Promise.resolve();
    });

    // The interleaving that made this a defect: without the lane, `b:enter` lands here, between a's two marks.
    await Promise.resolve();
    expect(order).toEqual(["a:enter"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["a:enter", "a:exit", "b:enter"]);
  });

  test("jobs on DIFFERENT keys run in parallel — the key IS the serialization scope", async () => {
    const gate = deferred();
    const order: string[] = [];

    const held = runInLane("chat:one", async () => {
      order.push("one:enter");
      await gate.promise;
    });
    const free = runInLane("chat:two", () => {
      order.push("two:ran");
      return Promise.resolve();
    });

    // `chat:two` completes while `chat:one` is still parked — unrelated scopes pay nothing for each other.
    await free;
    expect(order).toEqual(["one:enter", "two:ran"]);
    gate.resolve();
    await held;
  });

  test("a REJECTING job surfaces to its own caller and does not become the next job's failure", async () => {
    const failing = runInLane("failing", () => Promise.reject(new Error("job blew up")));
    await expect(failing).rejects.toThrow("job blew up");

    // The lane survives it: a successor queued on the same key still runs, and resolves normally.
    await expect(runInLane("failing", () => Promise.resolve("ran anyway"))).resolves.toBe("ran anyway");
  });

  test("a drained lane is DELETED — the Map is bounded by active keys, not by every key ever used", async () => {
    const before = activeLaneCount();
    const gate = deferred();
    const held = runInLane("drains", () => gate.promise);
    expect(activeLaneCount()).toBe(before + 1);

    gate.resolve();
    await held;
    // The delete rides a microtask off the lane's own tail, so it lands on the next turn, not synchronously.
    await Promise.resolve();
    await Promise.resolve();
    expect(activeLaneCount()).toBe(before);
  });
});
