import { afterEach, describe, vi } from "vitest";
import { observeRouterViewTransitions } from "#client/routes/router-view-transition.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("observeRouterViewTransitions", () => {
  test("keeps the router transition and absorbs its discarded skipped-settlement promises", async () => {
    const abort = Object.assign(new Error("transition skipped"), { name: "AbortError" });
    const nativeStart = vi.fn((argument: (() => void | Promise<void>) | { readonly update: () => void | Promise<void> }) => {
      const updateResult = typeof argument === "function" ? argument() : argument.update();
      void Promise.resolve(updateResult).catch(() => undefined);
      return { ready: Promise.reject(abort), finished: Promise.reject(abort), updateCallbackDone: Promise.resolve() };
    });
    const transitionDocument = { startViewTransition: nativeStart };
    vi.stubGlobal("document", transitionDocument);
    const router = {
      startViewTransition: (routerUpdate: () => Promise<void>): void => {
        const transition = transitionDocument.startViewTransition(routerUpdate);
        transition.updateCallbackDone.catch(() => undefined);
      },
    };
    const update = vi.fn(() => Promise.resolve());

    observeRouterViewTransitions(router);
    router.startViewTransition(update);
    await Promise.resolve();

    expect(nativeStart).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(transitionDocument.startViewTransition).toBe(nativeStart);
  });

  test("starts no native transition while the document is hidden, and the router update still runs", () => {
    const nativeStart = vi.fn();
    const transitionDocument: { visibilityState: string; startViewTransition: typeof nativeStart | undefined } = {
      visibilityState: "hidden",
      startViewTransition: nativeStart,
    };
    vi.stubGlobal("document", transitionDocument);
    let nativeSeenByRouter: unknown;
    const router = {
      startViewTransition: (routerUpdate: () => Promise<void>): void => {
        nativeSeenByRouter = transitionDocument.startViewTransition;
        routerUpdate().catch(() => undefined);
      },
    };
    const update = vi.fn(() => Promise.resolve());

    observeRouterViewTransitions(router);
    router.startViewTransition(update);

    expect(nativeSeenByRouter).toBeUndefined();
    expect(nativeStart).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(transitionDocument.startViewTransition).toBe(nativeStart);
  });

  test("absorbs the InvalidStateError Chrome rejects ready and finished with on a hidden document", async () => {
    const queued: Array<() => void> = [];
    const hidden = Object.assign(new Error("Transition was aborted because of invalid state. Document hidden"), { name: "InvalidStateError" });
    vi.stubGlobal("queueMicrotask", (callback: () => void) => queued.push(callback));
    const transitionDocument = {
      startViewTransition: () => ({ ready: Promise.reject(hidden), finished: Promise.reject(hidden), updateCallbackDone: Promise.resolve() }),
    };
    vi.stubGlobal("document", transitionDocument);
    const router = {
      startViewTransition: (): void => {
        transitionDocument.startViewTransition().updateCallbackDone.catch(() => undefined);
      },
    };

    observeRouterViewTransitions(router);
    router.startViewTransition();
    await Promise.resolve();
    await Promise.resolve();

    expect(queued).toHaveLength(0);
  });

  test("surfaces an AbortError thrown by the router update callback", async () => {
    const queued: Array<() => void> = [];
    const callbackAbort = Object.assign(new Error("application update aborted"), { name: "AbortError" });
    vi.stubGlobal("queueMicrotask", (callback: () => void) => queued.push(callback));
    const transitionDocument = {
      startViewTransition: (update: () => void | Promise<void>) => {
        const updateCallbackDone = Promise.resolve().then(update);
        return { ready: Promise.resolve(), finished: updateCallbackDone, updateCallbackDone };
      },
    };
    vi.stubGlobal("document", transitionDocument);
    const router = {
      startViewTransition: (update: () => Promise<void>): void => {
        const transition = transitionDocument.startViewTransition(update);
        void transition.updateCallbackDone.catch(() => undefined);
      },
    };

    observeRouterViewTransitions(router);
    router.startViewTransition(() => Promise.reject(callbackAbort));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const surfaced = queued.flatMap((callback) => {
      try {
        callback();
        return [];
      } catch (error) {
        return [error];
      }
    });
    expect(surfaced).toEqual([callbackAbort]);
  });
});
