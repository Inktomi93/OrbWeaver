// The scroll WINDOW's two pure/DOM-only helpers, split out of message-list.tsx to keep the primitive
// under the 450-line cap (UI-Primitives-and-Reuse.md §13.7): what the reader can see past each edge, and
// which indices the virtualizer must render regardless of where the window sits.

import type { Range, Virtualizer } from "@tanstack/react-virtual";
import { defaultRangeExtractor } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { useEffect, useSyncExternalStore } from "react";

// An edge fades only when more than this many px of content lie beyond it — sub-pixel rounding must
// not flicker the fade on an unscrolled list.
const EDGE_FADE_EPSILON_PX = 1;

/** Marks scroll edges that hide content; the transcript keeps its top ink opaque and fades its tail. */
export function updateEdgeFades(el: HTMLElement): void {
  const scrolled = el.scrollTop > EDGE_FADE_EPSILON_PX;
  el.toggleAttribute("data-fade-top", scrolled);
  el.toggleAttribute("data-fade-bottom", el.scrollHeight - el.scrollTop - el.clientHeight > EDGE_FADE_EPSILON_PX);
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

/** Mounting every row for paper re-measures the rows above a scrolled-up reader, so the row they were on is put back
 *  after the print. A reader at the tail follows it and needs nothing. */
export function usePrintAnchor(
  scrollRef: RefObject<HTMLDivElement | null>,
  following: RefObject<boolean>,
  virtualizer: Virtualizer<HTMLDivElement, HTMLLIElement>,
): void {
  useEffect((): (() => void) => {
    let anchor: { readonly index: number; readonly past: number } | null = null;
    const hold = (): void => {
      const top = scrollRef.current?.scrollTop ?? 0;
      const item = following.current ? undefined : virtualizer.getVirtualItemForOffset(top);
      anchor = item === undefined ? null : { index: item.index, past: top - item.start };
    };
    const put = (): void => {
      const held = anchor;
      anchor = null;
      if (held !== null) {
        requestAnimationFrame(() => {
          const [start] = virtualizer.getOffsetForIndex(held.index, "start") ?? [];
          if (start !== undefined) {
            virtualizer.scrollToOffset(start + held.past);
          }
        });
      }
    };
    addEventListener("beforeprint", hold);
    addEventListener("afterprint", put);
    return (): void => {
      removeEventListener("beforeprint", hold);
      removeEventListener("afterprint", put);
    };
  }, [scrollRef, following, virtualizer]);
}

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
