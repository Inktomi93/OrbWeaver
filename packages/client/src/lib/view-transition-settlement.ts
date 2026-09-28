interface ViewTransitionSettlement {
  readonly ready?: Promise<unknown>;
  readonly finished?: Promise<unknown>;
  readonly updateCallbackDone?: Promise<unknown>;
}

function isSkippedTransition(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/** Observe fire-and-forget ViewTransition settlement without hiding update callback failures. */
export function observeViewTransition(transition: ViewTransitionSettlement | undefined): void {
  const surfacedFailures = new Set<unknown>();
  const observe = (settled: Promise<unknown> | undefined, absorbSkipped: boolean): void => {
    // @orb-waive caught-failure-ownership(settled): only AbortError from platform settlement is absorbed; callback settlement never absorbs it. Every other unique rejection is rethrown on the microtask error surface. Ends if callers begin awaiting settlement.
    settled?.catch((error: unknown) => {
      if ((absorbSkipped && isSkippedTransition(error)) || surfacedFailures.has(error)) {
        return;
      }
      surfacedFailures.add(error);
      queueMicrotask(() => {
        throw error;
      });
    });
  };
  observe(transition?.ready, true);
  observe(transition?.finished, true);
  // `updateCallbackDone` is the application's callback outcome. An AbortError here can be a real thrown
  // failure and must surface; it is not evidence that the browser merely skipped the visual transition.
  observe(transition?.updateCallbackDone, false);
}
