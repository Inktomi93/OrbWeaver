import { afterEach, describe, vi } from "vitest";
import { runAfterViewTransition, withViewTransition } from "../../../packages/client/src/lib/view-transition.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
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
    captured[0]?.();
    expect(ran).toEqual(["selectChat", "setActiveSection"]);

    // …and the NEXT task is a different intent: it gets its own transition.
    await Promise.resolve();
    withViewTransition(() => ran.push("later"));
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("defers follow-up work until this task's visual transition has finished", async () => {
    let finish: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
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
    finish?.();
    await finished;
    await Promise.resolve();
    expect(effect).toHaveBeenCalledOnce();
  });

  test("carries deferred work through a skipped transition to its superseding transition", async () => {
    const abort = Object.assign(new Error("transition skipped"), { name: "AbortError" });
    let finishSecond: (() => void) | undefined;
    const firstFinished = Promise.reject(abort);
    const secondFinished = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
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
    withViewTransition(() => undefined);
    await firstFinished.catch(() => undefined);
    await Promise.resolve();

    expect(effect).not.toHaveBeenCalled();
    finishSecond?.();
    await secondFinished;
    await Promise.resolve();

    expect(effect).toHaveBeenCalledOnce();
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

  test.each(["AbortError", "TimeoutError"])("absorbs platform %s but surfaces the same error from the update callback", async (name) => {
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
