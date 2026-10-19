interface ViewTransitionSettlement {
  readonly ready?: Promise<unknown>;
  readonly finished?: Promise<unknown>;
  readonly updateCallbackDone?: Promise<unknown>;
}

// Chrome skips a transition on a hidden document with InvalidStateError; superseded and timed-out ones use the other two.
const SKIPPED_TRANSITION_ERRORS: ReadonlySet<unknown> = new Set(["AbortError", "TimeoutError", "InvalidStateError"]);

function isSkippedTransition(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && SKIPPED_TRANSITION_ERRORS.has(error.name);
}

/** A hidden document cannot paint a transition: the browser would skip it, so callers apply the update directly. */
export function isDocumentHidden(transitionDocument: { readonly visibilityState?: string } | undefined): boolean {
  return transitionDocument?.visibilityState === "hidden";
}

/** Observe fire-and-forget ViewTransition settlement without hiding update callback failures. */
export function observeViewTransition(transition: ViewTransitionSettlement | undefined): void {
  const surfacedFailures = new Set<unknown>();
  const observe = (settled: Promise<unknown> | undefined, absorbSkipped: boolean): void => {
    // @orb-waive caught-failure-ownership(settled): only a platform skip (AbortError/TimeoutError/InvalidStateError on ready/finished) is absorbed; every other unique rejection, and any updateCallbackDone rejection, is rethrown on a queued microtask, which becomes a window "error" event that installSafeErrorRing records. Ends if callers begin awaiting settlement or the ring stops listening to "error".
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
