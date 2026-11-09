import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

// `lib/` compiles without the DOM lib, so the bar, its scroller and the observer are reached through minimal structural types.
interface PinnedBox {
  readonly parentElement: PinnedBox | null;
  readonly clientHeight: number;
  readonly offsetHeight: number;
  readonly scrollHeight: number;
}
interface BoxObserver {
  readonly observe: (target: PinnedBox) => void;
  readonly disconnect: () => void;
}
type BoxObserverConstructor = new (listener: () => void) => BoxObserver;
type ComputedStyleOf = (box: PinnedBox) => { readonly overflowY: string };

function isStyleReader(value: unknown): value is ComputedStyleOf {
  return typeof value === "function";
}

function isObserverConstructor(value: unknown): value is BoxObserverConstructor {
  return typeof value === "function";
}

/** The most of its scroll box a pinned bar may take before the pane has too little left to read or press. */
const PINNED_BAR_MAX_SHARE = 0.4;

function scrollerOf(bar: PinnedBox, styleOf: ComputedStyleOf): PinnedBox | null {
  for (let up = bar.parentElement; up !== null; up = up.parentElement) {
    if (/auto|scroll/u.test(styleOf(up).overflowY)) {
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
export function usePinnedBarCap(ref: RefObject<PinnedBox | null>): number | null {
  const [cap, setCap] = useState<number | null>(null);
  useLayoutEffect(() => {
    const styleRead: unknown = Reflect.get(globalThis, "getComputedStyle");
    const observerRead: unknown = Reflect.get(globalThis, "ResizeObserver");
    const styleOf = isStyleReader(styleRead) ? styleRead : undefined;
    const Observer = isObserverConstructor(observerRead) ? observerRead : undefined;
    const bar = ref.current;
    const scroller = bar === null || styleOf === undefined ? null : scrollerOf(bar, styleOf);
    if (bar === null || scroller === null || Observer === undefined) {
      return;
    }
    const measure = (): void => {
      const limit = Math.floor(scroller.clientHeight * PINNED_BAR_MAX_SHARE);
      // A bar already held to the cap reads its natural height from its scrollHeight.
      setCap(Math.max(bar.offsetHeight, bar.scrollHeight) > limit ? limit : null);
    };
    measure();
    const observer = new Observer(measure);
    observer.observe(bar);
    observer.observe(scroller);
    return (): void => observer.disconnect();
  }, [ref]);
  return cap;
}
