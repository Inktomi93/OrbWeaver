import { afterEach, describe, vi } from "vitest";
import { withViewTransition } from "../../../packages/client/src/lib/view-transition.ts";
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

  test("skips the native snapshot when the app-level reduced-motion preference is active", () => {
    const update = vi.fn();
    const start = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", { querySelector: (selector: string) => (selector === '[data-reduced-motion="true"]' ? {} : null), startViewTransition: start });

    withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  test("absorbs only skipped-transition AbortError and surfaces update failures", async () => {
    const queued: Array<() => void> = [];
    const failure = new Error("update callback failed");
    const abort = Object.assign(new Error("transition skipped"), { name: "AbortError" });
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
