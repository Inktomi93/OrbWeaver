// Seats the completion list against the room the live document leaves: the visual viewport (a soft keyboard
// shrinks it) cut down by every clipping ancestor. Measured, not rendered state, so it runs off a ref.
import { subscribeKeyboardInset } from "#lib";

/** The list's own attribute for "seated above the field"; `variants.ts` keys the flipped arm off it. */
export const LIST_ABOVE_ATTRIBUTE = "data-above";

interface Band {
  readonly top: number;
  readonly bottom: number;
}

export interface ListPlacement {
  readonly above: boolean;
  /** The block size the chosen side can hold, so the list scrolls inside it. */
  readonly room: number;
}

/** Below the field unless that is short and the side above holds more. */
export function placeList(field: Band, bounds: Band, wanted: number, gap: number): ListPlacement {
  const below = bounds.bottom - field.bottom - gap;
  const above = field.top - bounds.top - gap;
  const goesAbove = below < wanted && above > below;
  return { above: goesAbove, room: Math.max(0, goesAbove ? above : below) };
}

function clipsBlock(overflowY: string): boolean {
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden" || overflowY === "clip";
}

function visibleBounds(field: Element): Band {
  const view = window.visualViewport;
  let top = view === null ? 0 : view.offsetTop;
  let bottom = view === null ? window.innerHeight : view.offsetTop + view.height;
  for (let ancestor = field.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    if (clipsBlock(getComputedStyle(ancestor).overflowY)) {
      const box = ancestor.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
    }
  }
  return { top, bottom };
}

function seat(list: HTMLElement, field: HTMLElement): void {
  // The unclamped height is what the list wants; read it with the last clamp lifted. A taller box lowers the
  // scroll ceiling and the browser clamps `scrollTop` to it, so put the offset back.
  const scrolled = list.scrollTop;
  list.style.removeProperty("max-block-size");
  const wanted = list.offsetHeight;
  const fieldBox = field.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(list).marginBlockStart);
  const { above, room } = placeList(fieldBox, visibleBounds(field), wanted, gap);
  list.toggleAttribute(LIST_ABOVE_ATTRIBUTE, above);
  list.style.setProperty("max-block-size", `min(var(--height-scroll-md), ${room}px)`);
  list.scrollTop = scrolled;
}

/**
 * Ref callback for the listbox. It seats the list in its positioned parent now and again whenever the
 * viewport, a scroller, or either box changes size. React runs the returned cleanup on unmount.
 */
export function seatListbox(list: HTMLElement | null): (() => void) | undefined {
  const field = list?.parentElement;
  if (list === null || field === null || field === undefined) {
    return undefined;
  }
  const measure = (): void => seat(list, field);
  measure();
  const resize = new ResizeObserver(measure);
  resize.observe(list);
  resize.observe(field);
  const unsubscribe = subscribeKeyboardInset(measure);
  // A scroll on any ancestor moves the field under the viewport edge; scroll does not bubble, so capture it.
  // The list's own scroll moves nothing it measures.
  const onScroll = (event: Event): void => {
    if (event.target !== list) {
      measure();
    }
  };
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return (): void => {
    resize.disconnect();
    unsubscribe();
    window.removeEventListener("scroll", onScroll, { capture: true });
  };
}
