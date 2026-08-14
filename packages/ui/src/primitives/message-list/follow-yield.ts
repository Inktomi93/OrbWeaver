// The FOLLOW-YIELD half of the message-list seal: the rules that decide who owns the scroll axis when
// the reader and the tail march both want it. Extracted from `message-list.tsx` (the §13.7 primitive
// size cap) — the seal keeps the WHEN (which ref, which render), this file owns the WHAT.
//
// Origin: owner dogfood 2026-08-13, "follow-mode is jumpy when you manually scroll up to read the top
// mid-generation." Two separate writers were dragging the reader back; both are answered here.

/**
 * How long after a real user scroll INPUT every programmatic write to the axis is dropped.
 *
 * WHY AN INPUT-KEYED WINDOW AND NOT INTENT: the reader's wheel and the tail march write the same pixel,
 * and during a stream the march writes ~10×/s. Measured on a live turn 2026-08-14 with `scrollTo`
 * patched to capture stacks, a 500px up-scroll was dragged back by FOUR writes inside 385ms. Intent
 * cannot arbitrate that, because every one of those writes is recorded as "ours" — the scroll event it
 * produces then matches the seal's programmatic-scroll tolerance, the detector early-returns, and it
 * never learns the reader moved at all. The gesture has to win, and only the input says a gesture
 * happened. The seal RENEWS this window on every scroll event that lands while it is still open, so in
 * practice it means "until the scrolling their input started has stopped" — a fixed 150ms of wall clock
 * expired mid-flick under contention (a 578px re-pin in one loaded CT worker).
 */
export const USER_SCROLL_YIELD_MS = 150;

/** Keys that scroll a container natively — a keyboard reader is a user scroll input like any other. */
const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/**
 * Wire the four ways a reader takes the axis by hand; returns the detach function.
 *
 * PASSIVE on purpose: a `wheel`/`touchmove` listener the browser cannot prove is passive blocks the very
 * scroll it is watching, and React's JSX handlers give no passive guarantee (they also read to a11y
 * linting as "interactions on a non-interactive element", which a scroll container's own scroll input is
 * not). Deliberately NOT `pointerdown`: it also fires on a click INSIDE a row, and a click that changes
 * content (a "load older history" button) would then lose its legitimate anchor adjustment and jump the
 * reader 800px — the prepend-stability CT caught exactly that. A scrollbar drag is covered instead by
 * {@link shouldAdjustForResizedItem}, which needs no gesture at all.
 */
export function attachUserScrollInput(el: HTMLElement, onInput: () => void): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(event.key)) {
      onInput();
    }
  };
  el.addEventListener("wheel", onInput, { passive: true });
  el.addEventListener("touchstart", onInput, { passive: true });
  el.addEventListener("touchmove", onInput, { passive: true });
  el.addEventListener("keydown", onKey, { passive: true });
  return (): void => {
    el.removeEventListener("wheel", onInput);
    el.removeEventListener("touchstart", onInput);
    el.removeEventListener("touchmove", onInput);
    el.removeEventListener("keydown", onKey);
  };
}

export interface ResizedItemAdjustment {
  /** Index of the item whose measured size changed. */
  readonly index: number;
  /** That item's start offset in the virtual list. */
  readonly start: number;
  /** Index of the LAST item — the streaming tail in a chat transcript. */
  readonly lastIndex: number;
  /** The scroll container's current `scrollTop`. */
  readonly scrollOffset: number;
  /** Whether virtual-core has a cached size for this item already (false ⇒ first measurement). */
  readonly hasCachedSize: boolean;
  /** virtual-core's current travel direction, or null before the first scroll. */
  readonly scrollDirection: "forward" | "backward" | null;
}

/**
 * Whether virtual-core should compensate the scroll position for a resized item.
 *
 * THE TAIL NEVER COMPENSATES FOR ITS OWN GROWTH. The library's default adjusts scrollTop by the delta
 * whenever the resized item STARTS above the current scroll offset — right for an image loading in an
 * earlier message (the reader's content would otherwise slide), and exactly WRONG for the streaming
 * tail, which grows at its END: nothing the reader is looking at moved, so "compensating" IS the jump.
 * Measured in a CT with `scrollTo` stacks: a reader who wheels up inside a long streaming reply is
 * dragged back by `resizeItem → applyScrollAdjustment` writes at 3516→3576, one every ~100ms,
 * indefinitely — and each drag flips `scrollDirection` to "forward", defeating the library's own
 * anti-cascade clause. Following is untouched: virtual-core's at-end branch runs UPSTREAM of this
 * predicate and owns the tail march.
 *
 * Everything that is not the tail keeps the library's rule, re-stated over its public surface.
 */
export function shouldAdjustForResizedItem(input: ResizedItemAdjustment): boolean {
  if (input.index === input.lastIndex) {
    return false;
  }
  return input.start < input.scrollOffset && (!input.hasCachedSize || input.scrollDirection !== "backward");
}
