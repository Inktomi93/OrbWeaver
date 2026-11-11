// The scroll WINDOW's two pure/DOM-only helpers, apart from message-list.tsx: what the reader can see past each edge, and
// which indices the virtualizer must render regardless of where the window sits.

import type { Range } from "@tanstack/react-virtual";
import { defaultRangeExtractor } from "@tanstack/react-virtual";
import { useSyncExternalStore } from "react";
import { SCROLL_EDGE_EPSILON_PX } from "#lib";

/** Marks scroll edges that hide content; the transcript keeps its top ink opaque and fades its tail. */
export function updateEdgeFades(el: HTMLElement): void {
  const scrolled = el.scrollTop > SCROLL_EDGE_EPSILON_PX;
  el.toggleAttribute("data-fade-top", scrolled);
  el.toggleAttribute("data-fade-bottom", el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_EDGE_EPSILON_PX);
}

let printing = false;

function subscribePrinting(notify: () => void): () => void {
  const set = (next: boolean) => (): void => {
    printing = next;
    notify();
  };
  const start = set(true);
  const end = set(false);
  addEventListener("beforeprint", start);
  addEventListener("afterprint", end);
  return (): void => {
    removeEventListener("beforeprint", start);
    removeEventListener("afterprint", end);
  };
}

/**
 * True from `beforeprint` to `afterprint`. The browser lays out paper right after that event, before any frame or
 * observer runs. An external store's update flushes in the microtask after the listener, so the rows land in time.
 */
export function usePrinting(): boolean {
  return useSyncExternalStore(subscribePrinting, () => printing);
}

/**
 * The row ref while printing: it places the row where the screen expects it, as the virtualizer's `position` mode
 * does, but never measures it. A screen behind a print dialog still paints, and an unplaced row piles at the top.
 */
export const placeWithoutMeasure =
  (start: number) =>
  (node: HTMLLIElement | null): void => {
    if (node !== null) {
      node.style.top = `${String(start)}px`;
    }
  };

/** Paper has no scroll window: every row prints. */
export const everyRow = (count: number): (() => number[]) => {
  const all = Array.from({ length: count }, (_, index) => index);
  return (): number[] => all;
};

// Merges keepMounted's forced indices — plus the roving mode's ACTIVE ROW, which must survive a
// scroll-away or the list's single tab stop disappears mid-thread — into the library's base range;
// sorted ascending because virtual-core requires ascending indices from its range extractors.
export function composeRangeExtractor<T>(
  items: readonly T[],
  keepMounted: ((item: T) => boolean) | undefined,
  activeIndex: number,
): ((range: Range) => number[]) | undefined {
  if (keepMounted === undefined && activeIndex < 0) {
    return undefined;
  }
  const forced: number[] = activeIndex < 0 ? [] : [activeIndex];
  for (const [index, item] of items.entries()) {
    if (keepMounted?.(item) === true) {
      forced.push(index);
    }
  }
  return (range: Range): number[] => {
    const union = new Set<number>(defaultRangeExtractor(range));
    for (const index of forced) {
      union.add(index);
    }
    return Array.from(union).sort((a, b) => a - b);
  };
}
