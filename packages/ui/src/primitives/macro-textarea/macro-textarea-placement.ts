// Seats the completion list against the room the live document leaves: the visual viewport (a soft keyboard
// shrinks it) cut down by every clipping ancestor. Measured, not rendered state, so it runs off a ref.
import { subscribeKeyboardInset } from "#lib";

/** The list's own attributes for "seated above the field" and "seated inside the band"; `variants.ts` keys its arms off them. */
const LIST_ABOVE_ATTRIBUTE = "data-above";
const LIST_INSIDE_ATTRIBUTE = "data-inside";

interface Band {
  readonly top: number;
  readonly bottom: number;
}

/** What the list asks of the room around the field. */
interface ListSize {
  /** The block size the list wants unclamped. */
  readonly wanted: number;
  /** The margin it keeps from the field. */
  readonly gap: number;
  /** The least it needs to be usable: its chrome plus the first row. */
  readonly row: number;
}

export interface ListPlacement {
  readonly side: "below" | "above" | "inside";
  /** The block size the chosen side can hold, so the list scrolls inside it. */
  readonly room: number;
  /** Inside the band only: the list's top edge, measured from the field's top edge. */
  readonly offset: number;
}

/**
 * Below the field unless that is short and the side above holds more. A field taller than the band leaves neither
 * side a row, so the list lies over the field at the band's bottom edge, which is where a keyboard stops it.
 */
function placeList(field: Band, bounds: Band, size: ListSize): ListPlacement {
  const { wanted, gap, row } = size;
  const below = bounds.bottom - field.bottom - gap;
  const above = field.top - bounds.top - gap;
  if (Math.max(below, above) < row) {
    const room = Math.max(0, Math.min(wanted, bounds.bottom - bounds.top - 2 * gap));
    return { side: "inside", room, offset: bounds.bottom - gap - room - field.top };
  }
  const goesAbove = below < wanted && above > below;
  return { side: goesAbove ? "above" : "below", room: goesAbove ? above : below, offset: 0 };
}

/** The block size the list needs to be usable: its own chrome, a leading group header and the first option. */
function firstRowExtent(list: HTMLElement): number {
  const style = getComputedStyle(list);
  let extent =
    Number.parseFloat(style.paddingBlockStart) +
    Number.parseFloat(style.paddingBlockEnd) +
    Number.parseFloat(style.borderBlockStartWidth) +
    Number.parseFloat(style.borderBlockEndWidth);
  for (const child of list.children) {
    extent += child.getBoundingClientRect().height;
    if (child.getAttribute("role") === "option") {
      break;
    }
  }
  return extent;
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
  const { side, room, offset } = placeList(fieldBox, visibleBounds(field), { wanted, gap, row: firstRowExtent(list) });
  list.toggleAttribute(LIST_ABOVE_ATTRIBUTE, side === "above");
  list.toggleAttribute(LIST_INSIDE_ATTRIBUTE, side === "inside");
  if (side === "inside") {
    list.style.setProperty("inset-block-start", `${offset}px`);
  } else {
    list.style.removeProperty("inset-block-start");
  }
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
