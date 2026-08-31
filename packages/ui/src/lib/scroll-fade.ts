// The drivers for the universal `.scroll-fade-x` / `.scroll-fade-y` recipes in ui styles/globals.css.
// Keeping the selectors and their state writer behind the same package boundary is the executable
// ownership claim: clients consume the mechanism, but no client-specific module is required to operate it.
//
// ATTRIBUTES, NOT REACT STATE: the fade is paint, it changes on every scroll frame, and re-rendering a
// surface per frame to move a mask stop is the wrong shape. The effect writes the attributes the stylesheet
// keys on and nothing else re-renders.
//
// A MASK IS INVISIBLE TO `getComputedStyle` (only framebuffer sampling sees one), so the attributes are also
// what a test can assert on — which is why they are the seam rather than an inline `--fade-*` write.

import type { RefObject } from "react";
import { useEffect } from "react";

/** The universal horizontal scroll-overflow recipe's selector contract. */
export const SCROLL_FADE_X_CLASS = "scroll-fade-x";
/** The universal vertical scroll-overflow recipe's selector contract. */
export const SCROLL_FADE_Y_CLASS = "scroll-fade-y";

/** Below this a "scrolled edge" is a sub-pixel rounding artifact, not content the reader is missing. The
 *  same epsilon `@orb/ui`'s own MessageList driver uses (message-list/list-window.ts). */
const EDGE_EPSILON_PX = 1;

/**
 * Keep `data-fade-start` / `data-fade-end` on a horizontally scrolling box in sync with its scroll position.
 *
 * The element must carry `SCROLL_FADE_X_CLASS`; the hook only decides WHICH edges are currently hiding
 * something. Re-syncs on scroll AND on resize of the box itself (a pane that widens can un-hide the tail
 * without any scroll event ever firing — the case a scroll-only listener misses on every panel dock).
 */
export function useScrollFadeX(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const sync = (): void => {
      el.toggleAttribute("data-fade-start", el.scrollLeft > EDGE_EPSILON_PX);
      el.toggleAttribute("data-fade-end", el.scrollWidth - el.scrollLeft - el.clientWidth > EDGE_EPSILON_PX);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return (): void => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [ref]);
}

/**
 * Keep `data-fade-top` / `data-fade-bottom` on a vertically scrolling box in sync with its scroll position.
 *
 * The element must carry `SCROLL_FADE_Y_CLASS`. It observes the SCROLLER **and its content children**, the
 * same pair `@orb/ui`'s MessageList observes (`observer.observe(viewport); observer.observe(el)`), because
 * a child growing inside an `overflow-y: auto` box does NOT resize the box: a surface whose height is
 * decided by async children gains its overflow long after the last resize the scroller itself ever sees.
 */
export function useScrollFadeY(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const sync = (): void => {
      el.toggleAttribute("data-fade-top", el.scrollTop > EDGE_EPSILON_PX);
      el.toggleAttribute("data-fade-bottom", el.scrollHeight - el.scrollTop - el.clientHeight > EDGE_EPSILON_PX);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    // The CONTENT's own growth (see the doc comment): the scroller's border box does not change when a
    // child inside it gets taller, so the settle that CREATES the overflow is invisible to a box-only
    // observe. Every direct child, not just the first — a scroller with two content blocks would otherwise
    // track only one of them.
    for (const child of el.children) {
      observer.observe(child);
    }
    return (): void => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [ref]);
}
