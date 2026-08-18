// The HAND-ROLLED View Transition seam (UI-Arch §4a). The router's built-in VT fires only on URL
// commits — our pane swaps are reducer state changes at a constant `/`, so the router literally
// cannot drive them (UI-Lib-TanStack-Router.md C#3); this util is the one legal wrapper. Respects
// `prefers-reduced-motion` once here so no call site re-derives the check.
// WHAT the transition captures is NOT decided here — it is CSS, and it lives in ONE block in
// `features/app-shell/surfaces/shell.css` ("THE VIEW TRANSITION IS SCOPED TO THE CONTENT PANE", #176):
// the document root opts OUT of capture and `.shell-content` is the single named region, so a swap
// cross-fades content while the shell's chrome keeps its own FLIP/transform motion. Read that block
// before adding a `view-transition-name` anywhere — a second name is a second captured region.
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
  readonly querySelector?: (selector: string) => unknown;
  readonly startViewTransition?: (update: () => void) => VtTransition | undefined;
}
interface VtGlobals {
  readonly document?: VtDocument;
}

/**
 * "This user has asked for no motion" — the OS preference OR the app's own `data-reduced-motion` pref,
 * which the shell stamps on `.shell-grid` (a setting beyond the OS one). ONE home for the pair, because a
 * caller that checks only the OS half silently ignores half its users: `withViewTransition` skips the
 * crossfade on it, and `useListTrackFlip` skips the counter-translate on it (#151 — a FLIP whose duration
 * the reduced-motion CSS floor collapses to ~0 does not become "instant", it becomes a one-to-two-frame
 * hold of its `from` corner, i.e. the whole content column painted a panel-width out of place).
 */
export function motionIsReduced(): boolean {
  const g = globalThis as VtGlobals;
  return prefersReducedMotionNow() || (g.document?.querySelector?.('[data-reduced-motion="true"]') ?? null) !== null;
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
  if (start === undefined || motionIsReduced()) {
    update();
    return;
  }
  const transition = start.call(g.document, update);
  for (const settled of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) {
    settled?.catch(() => undefined); // skipped-transition AbortError — benign, never an uncaught rejection
  }
}
