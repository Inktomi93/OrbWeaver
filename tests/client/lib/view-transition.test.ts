import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { afterEach, describe, vi } from "vitest";
import { __resetViewTransition, runAfterViewTransition, withViewTransition } from "#client/lib/view-transition.ts";

afterEach(() => {
  __resetViewTransition();
  vi.unstubAllGlobals();
});

describe("withViewTransition", () => {
  test("uses the native transition when neither reduced-motion preference is active", () => {
    const update = vi.fn();
    const start = vi.fn((callback: () => void) => callback());
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });

    withViewTransition(update);

    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test("coalesces every update raised in ONE task into a single native transition, in order", async () => {
    // The browser runs the update callback in its own task, so the mock defers it — a synchronous mock
    // would close the join window before the second caller ever ran and the assertion would be vacuous.
    const ran: string[] = [];
    const captured: Array<() => void> = [];
    const start = vi.fn((callback: () => void) => {
      captured.push(callback);
      return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });

    // What home's "Resume" does: selectChatFromList (a wrapped write) then setActiveSection (another).
    withViewTransition(() => ran.push("selectChat"));
    withViewTransition(() => ran.push("setActiveSection"));

    expect(start).toHaveBeenCalledOnce();
    expect(ran).toEqual([]);
    await Promise.resolve(captured[0]?.());
    expect(ran).toEqual(["selectChat", "setActiveSection"]);

    // …and the NEXT task, once the first transition's hold is over, is a different intent: its own transition.
    await Promise.resolve();
    withViewTransition(() => ran.push("later"));
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("defers follow-up work until this task's visual transition has finished", async () => {
    const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
    const effect = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", {
      querySelector: () => null,
      startViewTransition: (update: () => void) => {
        update();
        return { ready: Promise.resolve(), finished, updateCallbackDone: Promise.resolve() };
      },
    });

    withViewTransition(() => undefined);
    runAfterViewTransition(effect);

    expect(effect).not.toHaveBeenCalled();
    finish();
    await finished;
    await Promise.resolve();
    expect(effect).toHaveBeenCalledOnce();
  });

  test("carries deferred work through a skipped transition to its superseding transition", async () => {
    const abort = Object.assign(new Error("transition skipped"), { name: "AbortError" });
    let skipFirst: (() => void) | undefined;
    const firstFinished = new Promise<void>((_, reject) => {
      skipFirst = (): void => reject(abort);
    });
    const { promise: secondFinished, resolve: finishSecond } = Promise.withResolvers<void>();
    let starts = 0;
    const effect = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", {
      querySelector: () => null,
      startViewTransition: (update: () => void) => {
        update();
        starts += 1;
        return starts === 1
          ? { ready: Promise.reject(abort), finished: firstFinished, updateCallbackDone: Promise.resolve() }
          : { ready: Promise.resolve(), finished: secondFinished, updateCallbackDone: Promise.resolve() };
      },
    });

    withViewTransition(() => undefined);
    runAfterViewTransition(effect);
    // The first transition's destination hold must be over before a second one can supersede it.
    await sleep(20);
    withViewTransition(() => undefined);
    // Starting the second transition is what skips the first.
    skipFirst?.();
    await firstFinished.catch(() => undefined);
    await Promise.resolve();

    expect(effect).not.toHaveBeenCalled();
    finishSecond();
    await secondFinished;
    await Promise.resolve();

    expect(effect).toHaveBeenCalledOnce();
  });

  // The crossfade must land on the destination, not on a skeleton the real content then replaces without a
  // transition: the update callback holds the old frame until the destination stops showing skeleton rows,
  // within a deadline, so a slow read costs a short hold rather than a second unanimated paint.
  describe("holds the old frame until the destination has content", () => {
    const skeletonSelector = /skeleton/u;

    function stubTransitionDocument(pending: () => boolean): Array<() => void | Promise<void>> {
      const callbacks: Array<() => void | Promise<void>> = [];
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      vi.stubGlobal("document", {
        querySelector: (selector: string) => (skeletonSelector.test(selector) && pending() ? {} : null),
        startViewTransition: (callback: () => void | Promise<void>) => {
          callbacks.push(callback);
          return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
        },
      });
      return callbacks;
    }

    test("applies the update at once and resolves only after the skeleton clears", async () => {
      // @orb-waive test-determinism(vi.useFakeTimers): the subject is the hold's elapsed time against its deadline
      vi.useFakeTimers();
      try {
        let skeleton = true;
        const callbacks = stubTransitionDocument(() => skeleton);
        const update = vi.fn();
        withViewTransition(update);

        let settled = false;
        const held = Promise.resolve(callbacks[0]?.()).then(() => {
          settled = true;
        });
        expect(update).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(64);
        expect(settled).toBe(false);

        skeleton = false;
        await vi.advanceTimersByTimeAsync(32);
        expect(settled).toBe(true);
        await held;
      } finally {
        vi.useRealTimers();
      }
    });

    test("a clean old page is not readiness: it waits for the swap to commit, then for the skeleton to clear", async () => {
      // @orb-waive test-determinism(vi.useFakeTimers): the subject is the hold's timing against the commit
      vi.useFakeTimers();
      try {
        let skeleton = false;
        let commit = (): void => undefined;
        vi.stubGlobal(
          "MutationObserver",
          class {
            constructor(callback: () => void) {
              commit = callback;
            }
            observe(): void {
              // the stub only needs to hand the test its callback
            }
            disconnect(): void {
              // nothing to release
            }
          },
        );
        const callbacks: Array<() => void | Promise<void>> = [];
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        vi.stubGlobal("document", {
          documentElement: {},
          querySelector: (selector: string) => (selector.includes("skeleton") && skeleton ? {} : null),
          startViewTransition: (callback: () => void | Promise<void>) => {
            callbacks.push(callback);
            return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
          },
        });
        withViewTransition(vi.fn());
        let settled = false;
        const held = Promise.resolve(callbacks[0]?.()).then(() => {
          settled = true;
        });

        // The old page shows no skeleton, but React has not committed the destination yet.
        await vi.advanceTimersByTimeAsync(20);
        expect(settled).toBe(false);

        skeleton = true;
        commit();
        await vi.advanceTimersByTimeAsync(32);
        expect(settled).toBe(false);

        skeleton = false;
        await vi.advanceTimersByTimeAsync(32);
        expect(settled).toBe(true);
        await held;
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    test("gives up at the deadline when the skeleton never clears", async () => {
      // @orb-waive test-determinism(vi.useFakeTimers): the subject is the hold's elapsed time against its deadline
      vi.useFakeTimers();
      try {
        const callbacks = stubTransitionDocument(() => true);
        withViewTransition(vi.fn());

        let settled = false;
        const held = Promise.resolve(callbacks[0]?.()).then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(settled).toBe(true);
        await held;
      } finally {
        vi.useRealTimers();
      }
    });
  });

  test("skips the native snapshot when the app-level reduced-motion preference is active", () => {
    const update = vi.fn();
    const start = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: (selector: string) => (selector === '[data-reduced-motion="true"]' ? {} : null), startViewTransition: start });

    withViewTransition(update);
    const after = vi.fn();
    runAfterViewTransition(after);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });

  test("applies the update directly and starts no native transition while the document is hidden", () => {
    const update = vi.fn();
    const start = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, visibilityState: "hidden", startViewTransition: start });

    withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  test.each(["AbortError", "TimeoutError", "InvalidStateError"])("absorbs platform %s but surfaces the same error from the update callback", async (name) => {
    const queued: Array<() => void> = [];
    const failure = Object.assign(new Error("update callback failed"), { name });
    const abort = Object.assign(new Error("transition skipped"), { name });
    vi.stubGlobal("queueMicrotask", (callback: () => void) => queued.push(callback));
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", {
      querySelector: () => null,
      startViewTransition: (update: () => void) => {
        update();
        return { ready: Promise.reject(abort), finished: Promise.reject(failure), updateCallbackDone: Promise.reject(failure) };
      },
    });

    withViewTransition(() => undefined);
    await Promise.resolve();

    const surfaced = queued.flatMap((callback) => {
      try {
        callback();
        return [];
      } catch (error) {
        return [error];
      }
    });
    expect(surfaced).toEqual([failure]);
  });
});

// A swap raised from inside a transition's own update callback is part of that transition: a second one would
// run its write after the outer callback finished and overwrite what the outer swap just set.
describe("withViewTransition — nested swaps", () => {
  test("a swap raised inside the update callback runs at once and starts no second transition", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const start = vi.fn((callback: () => void | Promise<void>) => {
      callbacks.push(callback);
      return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: () => null, startViewTransition: start });
    const order: string[] = [];

    withViewTransition(() => {
      order.push("outer");
      withViewTransition(() => order.push("inner"));
      order.push("outer-end");
    });
    await callbacks[0]?.();

    expect(start).toHaveBeenCalledOnce();
    expect(order).toEqual(["outer", "inner", "outer-end"]);
    vi.unstubAllGlobals();
  });

  // An arrival default fired from an effect during the destination hold must join the swap, not abort it.
  test("a swap raised while the destination hold is pending joins it instead of starting a second transition", async () => {
    // @orb-waive test-determinism(vi.useFakeTimers): the subject is a swap landing inside the hold window
    vi.useFakeTimers();
    try {
      const callbacks: Array<() => void | Promise<void>> = [];
      const start = vi.fn((callback: () => void | Promise<void>) => {
        callbacks.push(callback);
        return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
      });
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      vi.stubGlobal("document", { querySelector: (selector: string) => (selector.includes("skeleton") ? {} : null), startViewTransition: start });
      const order: string[] = [];

      withViewTransition(() => order.push("swap"));
      const held = Promise.resolve(callbacks[0]?.());
      await vi.advanceTimersByTimeAsync(20);
      withViewTransition(() => order.push("arrival default"));

      expect(start).toHaveBeenCalledOnce();
      expect(order).toEqual(["swap", "arrival default"]);
      await vi.advanceTimersByTimeAsync(300);
      await held;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
