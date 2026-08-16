// The scroll WINDOW's two pure/DOM-only helpers, split out of message-list.tsx to keep the primitive
// under the 450-line cap (UI-Primitives-and-Reuse.md §13.7): what the reader can see past each edge, and
// which indices the virtualizer must render regardless of where the window sits.

import type { Range } from "@tanstack/react-virtual";
import { defaultRangeExtractor } from "@tanstack/react-virtual";

/** Per-row facts the list MEASURED, handed to `renderItem` so a row can react to its own rendered size
 *  without measuring anything itself (the virtualizer already owns the measurement). */
export interface MessageListRowMeta {
  /**
   * This row's MEASURED height exceeds the scrollport — i.e. the reader cannot see the whole row at
   * once, so anything that must stay visible while they read it (a speaker attribution) has to be
   * sticky. False until the row has actually been measured: the `estimateSize` guess is not evidence,
   * and treating it as such flashes the sticky treatment on and off at mount.
   */
  readonly exceedsViewport: boolean;
}

// An edge fades only when more than this many px of content lie beyond it — sub-pixel rounding must
// not flicker the fade on an unscrolled list.
const EDGE_FADE_EPSILON_PX = 1;

/** Edge-fade state for the styles-tier mask (`client/styles/globals.css` keys on these attributes):
 *  an edge dissolves ONLY while content is actually scrolled past it, so a short thread never renders
 *  its first/last rows half-faded against nothing. */
export function updateEdgeFades(el: HTMLElement): void {
  el.toggleAttribute("data-fade-top", el.scrollTop > EDGE_FADE_EPSILON_PX);
  el.toggleAttribute("data-fade-bottom", el.scrollHeight - el.scrollTop - el.clientHeight > EDGE_FADE_EPSILON_PX);
}

// Merges keepMounted's forced indices — plus the roving mode's ACTIVE ROW, which must survive a
// scroll-away or the list's single tab stop disappears mid-thread — into rangeExtractor's base range;
// sorted ascending because virtual-core requires ascending indices from its range extractors.
export function composeRangeExtractor<T>(
  items: readonly T[],
  keepMounted: ((item: T) => boolean) | undefined,
  rangeExtractor: ((range: Range) => number[]) | undefined,
  activeIndex: number,
): ((range: Range) => number[]) | undefined {
  if (keepMounted === undefined && activeIndex < 0) {
    return rangeExtractor;
  }
  const forced: number[] = activeIndex < 0 ? [] : [activeIndex];
  for (const [index, item] of items.entries()) {
    if (keepMounted?.(item) === true) {
      forced.push(index);
    }
  }
  const base = rangeExtractor ?? defaultRangeExtractor;
  return (range: Range): number[] => {
    const union = new Set<number>(base(range));
    for (const index of forced) {
      union.add(index);
    }
    return Array.from(union).sort((a, b) => a - b);
  };
}
