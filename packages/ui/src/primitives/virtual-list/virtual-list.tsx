import type { Range } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "#lib";
import { TOKENS } from "#tokens";

// Intent-token gap between rows (maps to the `--spacing-*` scale — never a raw px). Declared once as
// an `as const` tuple, union derived (§7.5 no-inline-union-redecl); both stay local (no-inline-types
// + useComponentExportOnlyModules) — consumers name it via `VirtualListProps<T>["gapToken"]`.
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type VirtualListGapToken = (typeof GAP_TOKENS)[number];

// The virtualizer's `gap` option is a px number; spacing tokens are authored in rem.
// Assumes the browser-default root font size — acceptable for row-gap geometry.
const ROOT_FONT_SIZE_PX = 16;

// TanStack's own default, made explicit (rows rendered beyond the visible window on each side).
const DEFAULT_OVERSCAN = 1;

// D43 §11.3 tripwire: a scroll element taller than this many viewports at mount means the parent
// gave the list no bounded height, so the "window" is the whole list and virtualization is a no-op.
// neo's console.warn version of this check let a 200ms-commit list ship — hence a THROWN error.
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
   * Round-robins rows across N lanes (TanStack's masonry primitive — each virtual item gets a
   * `lane` index) instead of one column. Passthrough only: this seal stays a 1D row list, so a
   * lanes>1 caller owns the lane→horizontal-position CSS itself (e.g. via the `data-lane`
   * attribute this seal stamps on every row) — see `@orb/ui/media-grid` for the uniform-grid shape
   * this is NOT (that seal deliberately derives its own CSS-grid columns instead, per its own doc).
   */
  readonly lanes?: number;
  /**
   * Overrides which indices get rendered for a given scroll range — the escape hatch for a caller
   * that needs to keep specific rows mounted outside the normal overscan window (e.g. always
   * keeping a pinned/sticky row alive). Passthrough straight to the virtualizer; omit for the
   * library default (a plain overscan-padded contiguous range).
   */
  readonly rangeExtractor?: (range: Range) => number[];
  readonly renderItem: (item: T, index: number) => ReactNode;
  /**
   * When provided, scrolls to this item index (end-aligned) any time the VALUE changes — the
   * declarative "pin to bottom on append" seam (log-viewer's autoscroll composes this instead of
   * reaching for the virtualizer directly). Respects `prefers-reduced-motion` itself, so every
   * composer gets it free rather than each caller re-deriving the check.
   */
  readonly scrollToIndex?: number;
  /** Caller-owned sizing/skin for the scroll container — the BOUNDED height comes from here. */
  readonly className?: string;
}

/**
 * The `@tanstack/react-virtual` seal (UI-Gates §7 — the Virtual×Compiler footgun row): a windowed
 * list whose virtualizer config the call site cannot get wrong. Owns `directDomUpdates: true` +
 * `containerRef` (the React-19-Compiler fix, react-virtual 3.14+ — NOT `"use no memo"`),
 * `useFlushSync: false` (kills the React-19 lifecycle flushSync warning),
 * `directDomUpdatesMode: "position"` (transform mode creates a stacking context that breaks
 * `position:fixed` descendants — iframe/media rows), and the `measureElement` + `data-index`
 * row wiring. The parent MUST give the list a bounded height (via `className`) — an unbounded
 * scroll element throws at mount (D43 §11.3).
 *
 * Usage:
 * ```tsx
 * <VirtualList
 *   items={messages}
 *   getItemKey={(m) => m.id}
 *   estimateSize={() => estimatedRowPx}
 *   gapToken="row"
 *   renderItem={(m) => <MessageRow message={m} />}
 *   className="h-full"
 * />
 * ```
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
  className,
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
    // Conditionally spread (not a bare `lanes`/`rangeExtractor` key): `exactOptionalPropertyTypes`
    // distinguishes an omitted optional property from one explicitly set to `undefined` — a bare
    // key here would widen the virtualizer's own `lanes: number` (no `| undefined`) and fail tsc.
    ...(lanes === undefined ? {} : { lanes }),
    ...(rangeExtractor === undefined ? {} : { rangeExtractor }),
    // UI-Gates §7: the sealed Compiler-safe mode — scroll positioning bypasses React renders, so
    // the Compiler caching getVirtualItems() can no longer freeze the list (upstream #736).
    directDomUpdates: true,
    // Transform mode breaks position:fixed descendants (iframe/media rows) — position writes top.
    directDomUpdatesMode: "position",
    // React 19: flushSync from the scroll path fires the "called from inside a lifecycle" warning.
    useFlushSync: false,
  });

  // The unbounded-window tripwire (D43 §11.3) — thrown, not warned.
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

  // The declarative "scroll to index" seam — fires only when the VALUE changes (an append that
  // grows total item count), not on every render. `align: "end"` is the "pin to bottom" shape;
  // reduced-motion is checked here (not left to the caller) so every composer gets it free.
  // `virtualizer` (== the `useState`-held instance above) is referentially stable across renders,
  // so listing it/its methods as a dependency does not cause extra re-fires.
  useLayoutEffect(() => {
    if (scrollToIndex === undefined) {
      return;
    }
    const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    virtualizer.scrollToIndex(scrollToIndex, {
      align: "end",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [scrollToIndex, virtualizer, virtualizer.scrollToIndex]);

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-auto overscroll-contain", className)}
      data-slot="virtual-list-scroll"
    >
      <div
        ref={virtualizer.containerRef}
        className="relative w-full"
        data-slot="virtual-list-viewport"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          // Rows are position:absolute WITHOUT their own main-axis position — directDomUpdates
          // ("position" mode) writes `top` straight to the DOM; setting it here would fight it.
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-lane={lanes === undefined ? undefined : virtualItem.lane}
            data-slot="virtual-list-row"
            className="absolute inset-x-0"
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
