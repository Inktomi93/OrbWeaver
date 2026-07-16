import type { Range } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn, prefersReducedMotionNow } from "#lib";
import { TOKENS } from "#tokens";

// Intent-token gap between rows (maps to the --spacing-* scale — never a raw px).
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type VirtualListGapToken = (typeof GAP_TOKENS)[number];

// The virtualizer's `gap` option is a px number; spacing tokens are authored in rem.
const ROOT_FONT_SIZE_PX = 16;

// TanStack's own default, made explicit.
const DEFAULT_OVERSCAN = 1;

// A scroll element taller than this many viewports at mount means the parent gave the list no
// bounded height, so the whole list is the "window" and virtualization is a no-op — thrown, not warned.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

function gapPxFor(token: VirtualListGapToken): number {
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

export interface VirtualListProps<T> {
  readonly items: readonly T[];
  /**
   * Stable per-item key — MUST be id-based, never the index. Index keys break prepend stability
   * (the anchor engine re-finds the visible item by key after a data shift) and force a remount on
   * the ghost→canonical id swap; an id key keeps the row's React identity across both.
   */
  readonly getItemKey: (item: T, index: number) => string | number;
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Rows rendered beyond the visible window on each side. Defaults to the lib default (1). */
  readonly overscan?: number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: VirtualListGapToken;
  /**
   * Round-robins rows across N lanes instead of one column. Passthrough only: this seal stays a 1D
   * row list, so a `lanes>1` caller owns the lane→horizontal-position CSS via `data-lane`.
   */
  readonly lanes?: number;
  /** Overrides which indices render for a given scroll range (e.g. keep a pinned row mounted). */
  readonly rangeExtractor?: (range: Range) => number[];
  readonly renderItem: (item: T, index: number) => ReactNode;
  /**
   * Scrolls to this item index (end-aligned) any time the value changes — the declarative "pin to
   * bottom on append" seam. Respects prefers-reduced-motion itself.
   */
  readonly scrollToIndex?: number;
  /** Fires when the rendered window's last index comes within `endApproachRows` of the tail. */
  readonly onEndApproach?: () => void;
  /** Tail-proximity threshold in rows for `onEndApproach`. @defaultValue 8 */
  readonly endApproachRows?: number;
  /** Caller-owned sizing/skin for the scroll container — the BOUNDED height comes from here. */
  readonly className?: string;
  readonly "aria-label"?: string;
}

const DEFAULT_END_APPROACH_ROWS = 8;

/**
 * The `@tanstack/react-virtual` seal: a windowed list whose virtualizer config the call site
 * cannot get wrong (`directDomUpdates`/`containerRef`/`useFlushSync: false`/position-mode DOM
 * updates/measureElement + data-index wiring). The parent must give the list a bounded height via
 * `className` — an unbounded scroll element throws at mount.
 */
export function VirtualList<T>({
  items,
  getItemKey,
  estimateSize,
  overscan = DEFAULT_OVERSCAN,
  gapToken,
  lanes,
  rangeExtractor,
  renderItem,
  scrollToIndex,
  onEndApproach,
  endApproachRows = DEFAULT_END_APPROACH_ROWS,
  className,
  "aria-label": ariaLabel,
}: VirtualListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const itemAt = (index: number): T => {
    const item = items.at(index);
    if (item === undefined) {
      throw new Error(`VirtualList: virtual index ${index} has no backing item`);
    }
    return item;
  };

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    gap: gapToken === undefined ? 0 : gapPxFor(gapToken),
    getItemKey: (index) => getItemKey(itemAt(index), index),
    // exactOptionalPropertyTypes: a bare key here would widen lanes: number (no | undefined) and fail tsc.
    ...(lanes === undefined ? {} : { lanes }),
    ...(rangeExtractor === undefined ? {} : { rangeExtractor }),
    directDomUpdates: true,
    // Transform mode breaks position:fixed descendants (iframe/media rows) — position writes top.
    directDomUpdatesMode: "position",
    // React 19: flushSync from the scroll path fires the "called from inside a lifecycle" warning.
    useFlushSync: false,
  });

  // The unbounded-window tripwire — thrown, not warned.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const maxHeightPx = window.innerHeight * UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER;
    const measuredPx = el.getBoundingClientRect().height;
    if (measuredPx > maxHeightPx) {
      throw new Error(
        `VirtualList: the scroll container measured ${Math.round(measuredPx)}px tall — over ` +
          `${UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER}× the viewport (${Math.round(maxHeightPx)}px). ` +
          "The parent gave the list no bounded height, so every row is 'visible' and " +
          "virtualization is a no-op. Fix: constrain the parent (e.g. h-full inside a sized " +
          "layout region) so the list scrolls inside a real window.",
      );
    }
  }, []);

  // With directDomUpdates, React re-renders exactly when the rendered range changes, so this effect
  // fires once per window shift, never per scroll frame. Duplicate-fetch guarding is the caller's.
  const virtualItems = virtualizer.getVirtualItems();
  const lastRenderedIndex = virtualItems.length === 0 ? -1 : (virtualItems.at(-1)?.index ?? -1);
  useLayoutEffect(() => {
    if (onEndApproach === undefined || items.length === 0) {
      return;
    }
    if (lastRenderedIndex >= items.length - endApproachRows) {
      onEndApproach();
    }
  }, [onEndApproach, lastRenderedIndex, items.length, endApproachRows]);

  // Fires only when the value changes, not on every render. align: "end" is the pin-to-bottom shape.
  useLayoutEffect(() => {
    if (scrollToIndex === undefined) {
      return;
    }
    virtualizer.scrollToIndex(scrollToIndex, {
      align: "end",
      behavior: prefersReducedMotionNow() ? "auto" : "smooth",
    });
  }, [scrollToIndex, virtualizer, virtualizer.scrollToIndex]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: virtualized DOM structure requires divs
    <div
      ref={scrollRef}
      className={cn("overflow-auto overscroll-contain", className)}
      data-slot="virtual-list-scroll"
      role="list"
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
    >
      <div ref={virtualizer.containerRef} className="relative w-full" data-slot="virtual-list-viewport">
        {virtualItems.map((virtualItem) => (
          // biome-ignore lint/a11y/useSemanticElements: virtualized DOM structure requires divs
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-lane={lanes === undefined ? undefined : virtualItem.lane}
            data-slot="virtual-list-row"
            className="absolute inset-x-0"
            role="listitem"
            aria-setsize={items.length}
            aria-posinset={virtualItem.index + 1}
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
