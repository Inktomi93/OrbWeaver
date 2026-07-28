// The HAND-ROLLED View Transition seam (UI-Arch §4a). The router's built-in VT fires only on URL
// commits — our pane swaps are reducer state changes at a constant `/`, so the router literally
// cannot drive them (UI-Lib-TanStack-Router.md C#3); this util is the one legal wrapper. Respects
// `prefers-reduced-motion` once here so no call site re-derives the check.
// DOM access rides `globalThis` with self-contained structural types (not the `dom` lib): the node
// typecheck lane (vitest `test:types`) follows imports into this file through the lib barrel, and
// the root tsconfig deliberately has no `dom` lib — browser reality is unchanged, the types are
// simply carried locally.

import { prefersReducedMotionNow } from "@orb/ui/lib";

interface VtTransition {
  readonly ready?: Promise<unknown>;
  readonly finished?: Promise<unknown>;
  readonly updateCallbackDone?: Promise<unknown>;
}
interface VtDocument {
  readonly startViewTransition?: (update: () => void) => VtTransition | undefined;
}
interface VtGlobals {
  readonly document?: VtDocument;
}

/**
 * Run a view-state update inside a View Transition when the platform supports it (and the user
 * hasn't asked for reduced motion) — otherwise apply the update directly. Fire-and-forget: the
 * caller never awaits the transition.
 *
 * A SUPERSEDED transition (a second one starting before the first settles — e.g. the draft→committed
 * promotion swapping the active chat while the context panel re-renders) rejects the ViewTransition's
 * `ready`/`finished`/`updateCallbackDone` promises with `AbortError: Transition was skipped`. That is
 * BENIGN — the update callback itself still ran — but the discarded promises would surface as UNCAUGHT
 * rejections (a red console error on a perfectly normal rapid pane swap). Swallow them HERE, the one
 * legal wrapper, so no call site re-derives the handling.
 */
export function withViewTransition(update: () => void): void {
  const g = globalThis as VtGlobals;
  const start = g.document?.startViewTransition;
  const reducedMotion = prefersReducedMotionNow();
  if (start === undefined || reducedMotion) {
    update();
    return;
  }
  const transition = start.call(g.document, update);
  for (const settled of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) {
    settled?.catch(() => undefined); // skipped-transition AbortError — benign, never an uncaught rejection
  }
}
