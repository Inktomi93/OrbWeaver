import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

/** The most of its scroll box a pinned bar may take before the pane has too little left to read or press. */
const PINNED_BAR_MAX_SHARE = 0.4;

function scrollerOf(bar: HTMLElement): HTMLElement | null {
  for (let up = bar.parentElement; up !== null; up = up.parentElement) {
    if (/auto|scroll/u.test(getComputedStyle(up).overflowY)) {
      return up;
    }
  }
  return null;
}

/**
 * The height, in px, a pinned bar must stay within so its scroll box keeps room, or `null` while the bar's own height
 * already fits. Enlarged text grows a bar with its copy while the pane around it does not, and a bar that fills the pane
 * covers the controls it pins over with no scroll position that clears them.
 */
export function usePinnedBarCap(ref: RefObject<HTMLElement | null>): number | null {
  const [cap, setCap] = useState<number | null>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    const scroller = bar === null ? null : scrollerOf(bar);
    if (bar === null || scroller === null) {
      return;
    }
    const measure = (): void => {
      const limit = Math.floor(scroller.clientHeight * PINNED_BAR_MAX_SHARE);
      // A bar already held to the cap reads its natural height from its scrollHeight.
      setCap(Math.max(bar.offsetHeight, bar.scrollHeight) > limit ? limit : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(scroller);
    return (): void => observer.disconnect();
  }, [ref]);
  return cap;
}
