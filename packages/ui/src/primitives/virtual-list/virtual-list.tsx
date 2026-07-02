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
  readonly renderItem: (item: T, index: number) => ReactNode;
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
  renderItem,
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

  return (
    <div ref={scrollRef} className={cn("overflow-auto overscroll-contain", className)}>
      <div ref={virtualizer.containerRef} className="relative w-full">
        {virtualizer.getVirtualItems().map((virtualItem) => (
          // Rows are position:absolute WITHOUT their own main-axis position — directDomUpdates
          // ("position" mode) writes `top` straight to the DOM; setting it here would fight it.
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className="absolute inset-x-0"
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
