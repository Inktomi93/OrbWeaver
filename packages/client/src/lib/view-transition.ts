// The HAND-ROLLED View Transition seam (UI-Arch §4a). The router's built-in VT fires only on URL
// commits — our pane swaps are reducer state changes at a constant `/`, so the router literally
// cannot drive them; this util is the one legal wrapper. Respects
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
import { observeViewTransition } from "./view-transition-settlement.ts";

type VtUpdate = () => void | Promise<void>;
type VtStartArgument = VtUpdate | { readonly update: VtUpdate; readonly types?: readonly string[] };
interface VtDocument {
  readonly querySelector?: (selector: string) => unknown;
  startViewTransition?: (update: VtStartArgument) =>
    | {
        readonly ready?: Promise<unknown>;
        readonly finished?: Promise<unknown>;
        readonly updateCallbackDone?: Promise<unknown>;
      }
    | undefined;
}
interface VtGlobals {
  readonly document?: VtDocument;
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

/** The transition raised by the current task. It admits updates only until its update callback runs, but
 *  retains visual settlement until task-end so the originating intent can sequence follow-up work. */
interface TaskTransition {
  readonly updates: (() => void)[];
  acceptingUpdates: boolean;
  finished: Promise<unknown> | undefined;
}

let taskTransition: TaskTransition | null = null;
let activeTransition: TaskTransition | null = null;

function surfaceDeferredFailure(error: unknown): never {
  throw error;
}

function runWhenTransitionsSettle(observed: TaskTransition, effect: () => void): void {
  const finished = observed.finished;
  if (finished === undefined) {
    effect();
    return;
  }
  const settled = (): void => {
    const current = activeTransition;
    if (current !== null && current !== observed) {
      runWhenTransitionsSettle(current, effect);
      return;
    }
    effect();
  };
  Promise.allSettled([finished]).then(settled).catch(surfaceDeferredFailure);
}

/** Run work after the active native crossfade settles. With no visual transition there is nothing to wait
 *  for, so the work runs synchronously. A superseding transition carries the work forward to its settlement. */
export function runAfterViewTransition(effect: () => void): void {
  const current = activeTransition;
  if (current === null) {
    effect();
    return;
  }
  runWhenTransitionsSettle(current, effect);
}

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
 * promotion swapping the active chat while the context panel re-renders) rejects the visual settlement
 * (`ready`/`finished`) with `AbortError: Transition was skipped`. That is BENIGN — the update callback
 * itself still ran — but the discarded promises would surface as UNCAUGHT rejections. Swallow those HERE,
 * while always surfacing `updateCallbackDone` failures (including an application-thrown AbortError).
 * Coalescing does not retire that handling: transitions from different tasks still supersede each other.
 */
export function withViewTransition(update: () => void): void {
  const g = globalThis as VtGlobals;
  const start = g.document?.startViewTransition;
  if (start === undefined || motionIsReduced()) {
    taskTransition = null;
    update();
    return;
  }
  if (taskTransition?.acceptingUpdates === true) {
    taskTransition.updates.push(update);
    return;
  }
  const current: TaskTransition = { updates: [update], acceptingUpdates: true, finished: undefined };
  taskTransition = current;
  // End of THIS task — anything raised later is a different intent and gets its own transition.
  queueMicrotask(() => {
    if (taskTransition === current) {
      taskTransition = null;
    }
  });
  const transition = start.call(g.document, () => {
    current.acceptingUpdates = false;
    for (const run of current.updates) {
      run();
    }
  });
  current.finished = transition?.finished;
  if (current.finished !== undefined) {
    activeTransition = current;
    const clear = (): void => {
      if (activeTransition === current) {
        activeTransition = null;
      }
    };
    Promise.allSettled([current.finished]).then(clear).catch(surfaceDeferredFailure);
  }
  observeViewTransition(transition);
}
