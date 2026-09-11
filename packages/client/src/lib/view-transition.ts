// The HAND-ROLLED View Transition seam (UI-Arch §4a). The router's built-in VT fires only on URL
// commits — our pane swaps are reducer state changes at a constant `/`, so the router literally
// cannot drive them (UI-Lib-TanStack-Router.md C#3); this util is the one legal wrapper. Respects
// `prefers-reduced-motion` once here so no call site re-derives the check.
// WHAT the transition captures is NOT decided here — it is CSS, and it lives in ONE block in
// `features/app-shell/surfaces/shell.css` ("THE VIEW TRANSITION IS SCOPED TO THE CONTENT PANE", #176):
// the document root opts OUT of capture and `.shell-content` is the single named region, so a swap
// cross-fades content while the shell's chrome keeps its own FLIP/transform motion. Read that block
// before adding a `view-transition-name` anywhere — a second name is a second captured region.
// WHAT STAYS LIVE follows from the same ruling, and it is not the CSS default a caller assumes: chrome and
// every PORTALLED FLOAT (dialog, drawer, popover, menu, tooltip, toast) are neither snapshotted nor hidden
// by a swap — the shell's portal root is a SIBLING of `.shell-grid`, outside the one captured region — so
// they keep painting, and stay hit-testable, over content that has already changed. Whether a given float
// MAY do that is a product rule with a declared answer, and it is NOT decided here: this module is `#lib`,
// below `#state`, so reading the open modal slot from it would be an upward import. The rule lives one
// tier up — `MODAL_CONTENT_LIFETIME` (state/modal-slot-ids.ts) declares it per slot, `withContentSwap`
// (state/shell-store.ts) applies it. A `#state` action that swaps what CONTENT shows calls THAT; this
// function stays the wrapper for a transition that is not a content swap (and the one `withContentSwap`
// itself composes) — UI-Arch §4a, #1795.
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

function isSkippedTransition(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/**
 * "This user has asked for no motion" — the OS preference OR the app's own `data-reduced-motion` pref,
 * which the shell stamps on `.shell-grid` (a setting beyond the OS one). ONE home for the pair, because a
 * caller that checks only the OS half silently ignores half its users: `withViewTransition` skips the
 * crossfade on it, and `useListTrackFlip` skips the ANIMATED FLIP on it (#151 — a FLIP whose duration the
 * reduced-motion CSS floor collapses to ~0 does not become "instant", it becomes a one-to-two-frame hold of
 * its `from` corner, i.e. the whole content column painted a panel-width out of place). What it stamps on
 * this arm instead is the zero-duration SETTLE (#262): the same counter-translate held for one frame, which
 * is not motion and is not a recorded layout shift either.
 */
export function motionIsReduced(): boolean {
  const g = globalThis as VtGlobals;
  return prefersReducedMotionNow() || (g.document?.querySelector?.('[data-reduced-motion="true"]') ?? null) !== null;
}

/** The updates already queued into a transition that has STARTED but whose update callback has not run
 *  yet — i.e. the ones raised by the task we are still inside. `null` between tasks (see the coalescing
 *  note on `withViewTransition`). */
let joinableUpdates: (() => void)[] | null = null;

/**
 * Run a view-state update inside a View Transition when the platform supports it (and the user
 * hasn't asked for reduced motion) — otherwise apply the update directly. Fire-and-forget: the
 * caller never awaits the transition.
 *
 * ONE TASK ⇒ ONE TRANSITION (#454, measured 2026-08-22). One intent routinely raises two wrapped
 * writes: home's "Resume" runs `selectChatFromList` (which wraps `selectChat`) and then
 * `setActiveSection`, and the live app started TWO transitions at the same millisecond for that single
 * click (`document.startViewTransition` patched on the dev stack: `[3431, 3431]`). The browser skips the
 * first the moment the second starts, so the user only ever saw one crossfade — but the app paid for two
 * old-state snapshot captures, and, worse, the two writes landed in two SEPARATE React renders (the
 * update callback runs in its own task, so React's event-handler batching cannot reach them).
 *
 * So a call raised while a transition is still waiting for its update callback JOINS that transition
 * instead of starting a rival. `queueMicrotask` closes the window: a same-task caller always runs before
 * any microtask, and a transition whose callback never fires can therefore never strand the queue.
 * Ordering is unchanged (the updates run in the order they were raised) and every caller keeps the exact
 * fire-and-forget signature it had.
 *
 * A SUPERSEDED transition (a second one starting before the first settles — e.g. the draft→committed
 * promotion swapping the active chat while the context panel re-renders) rejects the ViewTransition's
 * `ready`/`finished`/`updateCallbackDone` promises with `AbortError: Transition was skipped`. That is
 * BENIGN — the update callback itself still ran — but the discarded promises would surface as UNCAUGHT
 * rejections (a red console error on a perfectly normal rapid pane swap). Swallow them HERE, the one
 * legal wrapper, so no call site re-derives the handling. Coalescing does not retire that handling: two
 * transitions raised from two different tasks still supersede each other exactly as before.
 */
export function withViewTransition(update: () => void): void {
  const g = globalThis as VtGlobals;
  const start = g.document?.startViewTransition;
  if (start === undefined || motionIsReduced()) {
    update();
    return;
  }
  if (joinableUpdates !== null) {
    joinableUpdates.push(update);
    return;
  }
  const updates: (() => void)[] = [update];
  joinableUpdates = updates;
  // End of THIS task — anything raised later is a different intent and gets its own transition.
  queueMicrotask(() => {
    if (joinableUpdates === updates) {
      joinableUpdates = null;
    }
  });
  const transition = start.call(g.document, () => {
    joinableUpdates = null;
    for (const run of updates) {
      run();
    }
  });
  const surfacedFailures = new Set<unknown>();
  for (const settled of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) {
    // @orb-waive caught-failure-ownership(settled): only AbortError is absorbed as the platform's skipped-transition outcome; every other rejection is rethrown on the microtask error surface. Ends if callers begin awaiting settlement.
    settled?.catch((error: unknown) => {
      if (!(isSkippedTransition(error) || surfacedFailures.has(error))) {
        surfacedFailures.add(error);
        queueMicrotask(() => {
          throw error;
        });
      }
    });
  }
}
