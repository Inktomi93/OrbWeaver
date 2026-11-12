import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

// `lib/` compiles without the DOM lib, so the bar, its scroller and the observer are reached through minimal structural types.
interface EdgeBox {
  readonly getBoundingClientRect: () => { readonly top: number; readonly bottom: number };
}
interface PinnedBox extends EdgeBox {
  readonly parentElement: PinnedBox | null;
  readonly clientHeight: number;
  readonly offsetHeight: number;
  readonly scrollHeight: number;
  scrollTop: number;
  readonly matches: (selectors: string) => boolean;
  readonly querySelectorAll: (selectors: string) => Iterable<EdgeBox>;
  readonly addEventListener: (type: LiftCue, listener: () => void) => void;
  readonly removeEventListener: (type: LiftCue, listener: () => void) => void;
}
interface BoxObserver {
  readonly observe: (target: PinnedBox) => void;
  readonly disconnect: () => void;
}
type BoxObserverConstructor = new (listener: () => void) => BoxObserver;
type ComputedStyleOf = (box: PinnedBox) => {
  readonly overflowY: string;
  readonly paddingTop: string;
  readonly paddingBottom: string;
  readonly borderTopWidth: string;
  readonly borderBottomWidth: string;
};

// What lifts a focused control above the bar besides the bar's own resize: a press, once it has landed (scrolling on the
// press's own focus would move the target out from under the pointer before the press completes), and keyboard focus.
type LiftCue = "click" | "focusin";

/** The controls whose height a capped bar always shows whole. */
const BAR_CONTROLS = "button, a[href], input, select, textarea, [role='button']";

function isStyleReader(value: unknown): value is ComputedStyleOf {
  return typeof value === "function";
}

function isObserverConstructor(value: unknown): value is BoxObserverConstructor {
  return typeof value === "function";
}

function isBox(value: unknown): value is PinnedBox {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "getBoundingClientRect") === "function";
}

function isWithin(node: PinnedBox | null, box: PinnedBox): boolean {
  return node !== null && (node === box || isWithin(node.parentElement, box));
}

// A bar pinned over its scroller's foot must not cover the control the person is on (the row's checkbox that summoned a
// selection bar). Each scroll box from the control up to the bar's scroller moves just far enough to lift the control above
// the bar and inside its own window: a row in a list nested in the pane needs the list and then the pane to move. At the
// pane's end the bar sits in flow after the content, so the move always has room.
function liftFocusAbove(bar: PinnedBox, scroller: PinnedBox, cue: LiftCue | "resize"): void {
  const page: unknown = Reflect.get(globalThis, "document");
  const held: unknown = typeof page === "object" && page !== null ? Reflect.get(page, "activeElement") : undefined;
  if (!isBox(held) || isWithin(held, bar) || !isWithin(held, scroller)) {
    return;
  }
  if (cue === "focusin" && !held.matches(":focus-visible")) {
    return;
  }
  for (let box = held.parentElement; box !== null; box = box.parentElement) {
    if (box.scrollHeight > box.clientHeight) {
      const limit = Math.min(bar.getBoundingClientRect().top, box.getBoundingClientRect().bottom);
      const covered = held.getBoundingClientRect().bottom - limit;
      if (covered > 0) {
        box.scrollTop += covered;
      }
    }
    if (box === scroller) {
      return;
    }
  }
}

// The most of its scroll box a pinned bar may take before the pane has too little left to read or press.
const PINNED_BAR_MAX_SHARE = 0.4;

// The share never cuts below one control shown whole with the bar's own insets: a coarse control at enlarged text in a short
// landscape pane is taller than the share, and a cap below it leaves nothing in the bar pressable.
function oneControlFloor(bar: PinnedBox, styleOf: ComputedStyleOf): number {
  let tallest = 0;
  for (const control of bar.querySelectorAll(BAR_CONTROLS)) {
    const edges = control.getBoundingClientRect();
    tallest = Math.max(tallest, edges.bottom - edges.top);
  }
  const style = styleOf(bar);
  const insets = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth];
  return Math.ceil(tallest + insets.reduce((sum, inset) => sum + (Number.parseFloat(inset) || 0), 0));
}

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
 * already fits: {@link PINNED_BAR_MAX_SHARE} of the scroll box, never less than one of the bar's controls shown whole. Enlarged text grows a bar with its copy while the pane around it does not, and a bar that fills the pane
 * covers the controls it pins over with no scroll position that clears them.
 *
 * @param liftFocus - The bar pins to its scroller's foot: when its size settles, after a press and on keyboard focus, the focused control in the scroller is scrolled above it.
 */
export function usePinnedBarCap(ref: RefObject<PinnedBox | null>, liftFocus = false): number | null {
  const [cap, setCap] = useState<number | null>(null);
  useLayoutEffect(() => {
    const styleRead: unknown = Reflect.get(globalThis, "getComputedStyle");
    const observerRead: unknown = Reflect.get(globalThis, "ResizeObserver");
    const styleOf = isStyleReader(styleRead) ? styleRead : undefined;
    const Observer = isObserverConstructor(observerRead) ? observerRead : undefined;
    const bar = ref.current;
    const scroller = bar === null || styleOf === undefined ? null : scrollerOf(bar, styleOf);
    if (bar === null || scroller === null || styleOf === undefined || Observer === undefined) {
      return;
    }
    const measure = (): void => {
      const limit = Math.max(Math.floor(scroller.clientHeight * PINNED_BAR_MAX_SHARE), oneControlFloor(bar, styleOf));
      // A bar already held to the cap reads its natural height from its scrollHeight.
      setCap(Math.max(bar.offsetHeight, bar.scrollHeight) > limit ? limit : null);
      if (liftFocus) {
        liftFocusAbove(bar, scroller, "resize");
      }
    };
    measure();
    const observer = new Observer(measure);
    observer.observe(bar);
    observer.observe(scroller);
    // A later control under a bar that does not change size (the next row selected) is lifted too.
    const liftAfterPress = (): void => liftFocusAbove(bar, scroller, "click");
    const liftOnFocus = (): void => liftFocusAbove(bar, scroller, "focusin");
    if (liftFocus) {
      scroller.addEventListener("click", liftAfterPress);
      scroller.addEventListener("focusin", liftOnFocus);
    }
    return (): void => {
      observer.disconnect();
      scroller.removeEventListener("click", liftAfterPress);
      scroller.removeEventListener("focusin", liftOnFocus);
    };
  }, [ref, liftFocus]);
  return cap;
}
