// The scroll WINDOW's pure/DOM-only helpers, split out of message-list.tsx to keep the primitive under
// the 450-line cap (UI-Primitives-and-Reuse.md §13.7): what the reader can see past each edge, which
// indices the virtualizer must render regardless of where the window sits, and where the window STARTS.

import type { Range, Virtualizer } from "@tanstack/react-virtual";
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

/**
 * WHERE A BOTTOM-ANCHORED WINDOW STARTS (#469) — the estimated offset of the list's far end, for
 * virtual-core's `initialOffset`.
 *
 * `anchorTo: "end"` is a POST-mount contract in virtual-core 3.17.3: it is read on a count change and on
 * a resize adjustment, never to seed the initial position — which is why the primitive also scrolls to
 * the end in a mount layout effect. The consequence was that a cold list rendered its first window from
 * offset 0 and React COMMITTED those HEAD rows before any layout effect ran. Measured on a 500-row list
 * (message-list.ct.tsx's render-log pin): the first mount built indexes 0–6 AND 493–499 — exactly half
 * the first-mount row work thrown away, and on this primitive's own subject each of those rows is a
 * multi-kilobyte Markdown tree tokenized on the frame a room-entry click is judged by.
 *
 * The estimate does not have to be exact: the mount effect still owns the true position and corrects the
 * window in the same layout pass, before paint. It matches virtual-core's own measurement arithmetic —
 * `paddingStart`, then each row's estimate, with one gap BETWEEN rows.
 *
 * ⚠ IT DOES NOT SHIP ALONE. virtual-core never READS the DOM's scroll position: `_scrollToOffset` writes
 * `element.scrollTo` and then waits for the SCROLL EVENT to report the new offset back (`observeOffset`
 * registers listeners only — it does not seed). A list whose content already fits its scrollport emits no
 * such event, because `scrollTo(0)` on a scrollTop that is already 0 is not a scroll, so a seeded offset
 * would stand forever: measured on the 5-row × 40px `useCachedMeasurements` fixture, the virtualizer
 * stayed convinced it sat at 200 in a 200px non-scrollable list, windowed to the last rows, and row 0 was
 * never mounted, never measured, and could not move the total height when it really resized. The seed is
 * therefore paired with {@link anchorToEnd}, which reconciles the offset by hand.
 */
export function estimatedEndOffset(count: number, estimateSize: (index: number) => number, gapPx: number, paddingStartPx: number): number {
  let total = paddingStartPx;
  for (let index = 0; index < count; index += 1) {
    total += estimateSize(index) + (index === 0 ? 0 : gapPx);
  }
  return total;
}

/**
 * Park a bottom-anchored list at its true end on mount, and tell the virtualizer where it landed.
 *
 * The second half is not belt-and-braces — it is what makes {@link estimatedEndOffset}'s seed safe (read
 * that doc for the measured failure it prevents). `element.scrollTo` IS synchronous, so reading
 * `scrollTop` straight back is the truth in both arms — the real end offset for a long thread, 0 for a
 * short one — and it lands before the layout phase's re-render, which is what makes the seed pay off:
 * the first committed window is the tail, not the head.
 */
export function anchorToEnd(virtualizer: Virtualizer<HTMLDivElement, HTMLLIElement>, el: HTMLElement | null): void {
  virtualizer.scrollToEnd({ behavior: "auto" });
  if (el !== null) {
    virtualizer.scrollOffset = el.scrollTop;
  }
}
