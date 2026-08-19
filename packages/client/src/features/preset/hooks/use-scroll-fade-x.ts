// The driver for `@orb/ui`'s `.scroll-fade-x` recipe (styles/globals.css) — the horizontal half of the
// message-list edge fade. The CSS states the contract this satisfies verbatim: "each edge fades ONLY while
// content is actually scrolled past it (the consumer toggles data-fade-start/-end on scroll/resize), so an
// unscrolled or fitting strip renders both its edges fully opaque instead of dimming a flush item against
// nothing." The recipe shipped with no consumer; this is the first (side-eye 2026-08-19 P1-1 — the preset
// editor's five-view strip in a 390px content pane).
//
// ATTRIBUTES, NOT REACT STATE: the fade is paint, it changes on every scroll frame, and re-rendering a tab
// strip per frame to move a mask stop is the wrong shape. The effect writes the two attributes the stylesheet
// keys on and nothing else re-renders.
//
// A MASK IS INVISIBLE TO `getComputedStyle` (only framebuffer sampling sees one), so the attributes are also
// what a test can assert on — which is why they are the seam rather than an inline `--fade-*` write.

import type { RefObject } from "react";
import { useEffect } from "react";

/** Below this a "scrolled edge" is a sub-pixel rounding artifact, not content the reader is missing. The
 *  same epsilon the vertical recipe's driver uses (`@orb/ui` message-list/list-window.ts). */
const EDGE_EPSILON_PX = 1;

/**
 * Keep `data-fade-start` / `data-fade-end` on a horizontally scrolling box in sync with its scroll position.
 *
 * The element must carry the `scroll-fade-x` class; the hook only decides WHICH edges are currently hiding
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
