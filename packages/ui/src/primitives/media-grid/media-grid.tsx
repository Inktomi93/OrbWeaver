import { useVirtualizer } from "@tanstack/react-virtual";
import type { KeyboardEvent, ReactElement } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn, prefersReducedMotionNow } from "#lib";
import { Check, Icon } from "#primitives/icons";
import { TOKENS } from "#tokens";
import { mediaGridVariants } from "./variants";

// Duplicated from virtual-list's own gap-token conversion rather than shared (independent primitives).
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type MediaGridGapToken = (typeof GAP_TOKENS)[number];
const ROOT_FONT_SIZE_PX = 16;

function gapPxFor(token: MediaGridGapToken | undefined): number {
  if (token === undefined) {
    return 0;
  }
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

// Same tripwire as VirtualList — an unbounded scroll parent makes virtualization a no-op.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

const DEFAULT_MIN_CELL_WIDTH_PX = 96;
const DEFAULT_OVERSCAN = 2;

function computeColumns(containerWidthPx: number, minCellWidthPx: number, gapPx: number): number {
  if (containerWidthPx <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor((containerWidthPx + gapPx) / (minCellWidthPx + gapPx)));
}

function computeCellEstimatePx(containerWidthPx: number, columns: number, gapPx: number): number {
  return Math.max(1, (containerWidthPx - gapPx * (columns - 1)) / columns);
}

// Pointer-follow spotlight reveal (globals.css paints it via --x/--y). A delegated pointermove on
// the scroll root writes the vars directly (style.setProperty, no React state, zero re-render).
function attachSpotlight(root: HTMLElement | null): (() => void) | undefined {
  const matchMedia = globalThis.matchMedia?.bind(globalThis);
  if (root === null || matchMedia === undefined) {
    return;
  }
  // Fine-pointer only + honor reduced-motion, so a touch/reduced-motion user never installs the listener.
  if (!matchMedia("(pointer: fine)").matches || prefersReducedMotionNow()) {
    return;
  }
  const onMove = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const cell = target.closest<HTMLElement>('[data-slot="media-grid-cell"]');
    if (cell === null) {
      return;
    }
    const rect = cell.getBoundingClientRect();
    cell.style.setProperty("--x", `${event.clientX - rect.left}px`);
    cell.style.setProperty("--y", `${event.clientY - rect.top}px`);
  };
  root.addEventListener("pointermove", onMove);
  return (): void => root.removeEventListener("pointermove", onMove);
}

export type MediaGridKey = string | number;

export interface MediaGridItem {
  readonly id: MediaGridKey;
  /**
   * The full-resolution/original asset. Always the rendered `src` when `animated` — resizing an
   * animated GIF/WebP freeze-frames it. Also the fallback `src` for a static item with no `thumbUrl`.
   */
  readonly url?: string;
  /** An optimized/smaller variant preferred over `url` — used ONLY for non-animated items. */
  readonly thumbUrl?: string;
  /** When true, `url` is used verbatim (never `thumbUrl`) — see `url`'s doc. */
  readonly animated?: boolean;
  /** The cell's accessible name (`aria-label` on the gridcell — not the `<img>`, which is decorative). */
  readonly alt: string;
}

export interface MediaGridSelection {
  readonly selectedIds: ReadonlySet<MediaGridKey>;
  readonly onToggle: (id: MediaGridKey) => void;
}

export interface MediaGridProps<T extends MediaGridItem> {
  readonly items: readonly T[];
  /** Minimum cell width (px) the responsive column count is derived from. Default 96. */
  readonly minCellWidth?: number;
  /** Gap between cells (both axes) as a spacing intent token. */
  readonly gapToken?: MediaGridGapToken;
  /** Rows rendered beyond the visible window on each side. Defaults to 2. */
  readonly overscan?: number;
  /**
   * Turns every cell into a toggle: click/Enter/Space calls `onToggle` instead of `onActivate`,
   * and selected cells get `aria-selected` + a checkmark badge. Omit entirely for a plain
   * browse/activate grid — toggle browse↔select by conditionally passing this prop, not a second
   * mode flag.
   */
  readonly selection?: MediaGridSelection;
  /** Fires on click/Enter/Space when `selection` is NOT set (e.g. open a lightbox). */
  readonly onActivate?: (item: T) => void;
  /** Accessible name for the `role="grid"` region. */
  readonly ariaLabel?: string;
  /** Caller-owned sizing/skin for the scroll container — the BOUNDED height comes from here. */
  readonly className?: string;
}

function pickSrc(item: MediaGridItem): string | undefined {
  if (item.animated === true) {
    return item.url ?? item.thumbUrl;
  }
  return item.thumbUrl ?? item.url;
}

type MediaGridSlots = ReturnType<typeof mediaGridVariants>;

interface MediaGridCellProps<T extends MediaGridItem> {
  readonly item: T;
  readonly flatIndex: number;
  readonly colIndex: number;
  readonly focused: boolean;
  readonly selectable: boolean;
  readonly selected: boolean;
  readonly slots: MediaGridSlots;
  readonly onActivate: (item: T, index: number) => void;
  readonly onFocusCell: (index: number) => void;
  readonly registerRef: (index: number, el: HTMLDivElement | null) => void;
}

/** One grid cell — split out from `MediaGrid`'s row map to keep that closure's complexity in bounds. */
function MediaGridCell<T extends MediaGridItem>({
  item,
  flatIndex,
  colIndex,
  focused,
  selectable,
  selected,
  slots,
  onActivate,
  onFocusCell,
  registerRef,
}: MediaGridCellProps<T>): ReactElement {
  const src = pickSrc(item);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(item, flatIndex);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: same APG grid pattern — <td> implies tabular DATA, which doesn't apply to a media picker cell.
    <div
      aria-colindex={colIndex + 1}
      aria-label={item.alt}
      aria-selected={selectable ? selected : undefined}
      className={slots.cell()}
      data-selected={selected ? "" : undefined}
      data-slot="media-grid-cell"
      onClick={(): void => onActivate(item, flatIndex)}
      onFocus={(): void => onFocusCell(flatIndex)}
      onKeyDown={onKeyDown}
      ref={(el): void => registerRef(flatIndex, el)}
      role="gridcell"
      tabIndex={focused ? 0 : -1}
    >
      {src === undefined ? (
        <div className={slots.placeholder()} data-slot="media-grid-placeholder" />
      ) : (
        <img
          alt=""
          className={slots.image()}
          data-slot="media-grid-image"
          decoding="async"
          loading="lazy"
          src={src}
        />
      )}
      {selectable && selected ? (
        <span className={slots.selectedBadge()} data-slot="media-grid-selected-badge">
          <Icon icon={Check} size="xs" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The virtualized 2D media grid: a responsive N-column grid, sibling to `virtual-list`'s 1D row
 * shape. Only the ROW axis is virtualized — a plain row virtualizer with CSS grid-template-columns,
 * since TanStack's `lanes` masonry option doesn't fit a uniform square grid. Column count is
 * measured from the scroll container's width via ResizeObserver (`minCellWidth` is a floor).
 * Keyboard: roving tabindex — ArrowLeft/Right ±1, ArrowUp/Down ±`columns`, Home/End to first/last.
 */
export function MediaGrid<T extends MediaGridItem>({
  items,
  minCellWidth = DEFAULT_MIN_CELL_WIDTH_PX,
  gapToken,
  overscan = DEFAULT_OVERSCAN,
  selection,
  onActivate,
  ariaLabel,
  className,
}: MediaGridProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);
  const cellEstimateRef = useRef(DEFAULT_MIN_CELL_WIDTH_PX);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cellRefs = useRef(new Map<number, HTMLDivElement>());
  const pendingFocusRef = useRef<number | null>(null);
  const slots = useMemo(() => mediaGridVariants(), []);

  const gapPx = gapPxFor(gapToken);
  const rowCount = items.length === 0 ? 0 : Math.ceil(items.length / columns);
  const safeFocusedIndex = Math.min(focusedIndex, Math.max(items.length - 1, 0));

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    // Rows are pure layout groupings, not persistent entities — index keys are correct here (unlike
    // VirtualList's id-keyed rows) since galleries only append, never reorder/prepend.
    getItemKey: (index) => index,
    estimateSize: () => cellEstimateRef.current,
    overscan,
    gap: gapPx,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    useFlushSync: false,
  });

  // Only column count needs manual measurement; row height (aspect-square) is picked up by the
  // virtualizer's own measureElement ResizeObserver once mounted.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const apply = (widthPx: number): void => {
      const next = computeColumns(widthPx, minCellWidth, gapPx);
      cellEstimateRef.current = computeCellEstimatePx(widthPx, next, gapPx);
      setColumns((prev) => (prev === next ? prev : next));
    };
    apply(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      apply(entry.contentRect.width);
    });
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [minCellWidth, gapPx]);

  // Delegated on the stable root since cells mount/unmount under virtualization.
  useLayoutEffect(() => attachSpotlight(scrollRef.current), []);

  // Unbounded-window tripwire: thrown, not warned. Identical to VirtualList's.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const maxHeightPx = window.innerHeight * UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER;
    const measuredPx = el.getBoundingClientRect().height;
    if (measuredPx > maxHeightPx) {
      throw new Error(
        `MediaGrid: the scroll container measured ${Math.round(measuredPx)}px tall — over ` +
          `${UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER}× the viewport (${Math.round(maxHeightPx)}px). ` +
          "The parent gave the grid no bounded height, so every row is 'visible' and " +
          "virtualization is a no-op. Fix: constrain the parent (e.g. h-full inside a sized " +
          "layout region) so the grid scrolls inside a real window.",
      );
    }
  }, []);

  // Retries every render until the pending target cell has mounted (post scrollToIndex) — cheap
  // Map lookup, no-op once satisfied.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) {
      return;
    }
    const el = cellRefs.current.get(pending);
    if (el !== undefined) {
      el.focus();
      pendingFocusRef.current = null;
    }
  });

  function moveFocusTo(index: number): void {
    const clamped = Math.min(Math.max(index, 0), items.length - 1);
    if (clamped === safeFocusedIndex) {
      return;
    }
    setFocusedIndex(clamped);
    pendingFocusRef.current = clamped;
    rowVirtualizer.scrollToIndex(Math.floor(clamped / columns), { align: "auto" });
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        next = safeFocusedIndex + 1;
        break;
      case "ArrowLeft":
        next = safeFocusedIndex - 1;
        break;
      case "ArrowDown":
        next = safeFocusedIndex + columns;
        break;
      case "ArrowUp":
        next = safeFocusedIndex - columns;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    moveFocusTo(next);
  }

  function activate(item: T, index: number): void {
    setFocusedIndex(index);
    if (selection !== undefined) {
      selection.onToggle(item.id);
      return;
    }
    onActivate?.(item);
  }

  function registerCellRef(index: number, el: HTMLDivElement | null): void {
    if (el === null) {
      cellRefs.current.delete(index);
    } else {
      cellRefs.current.set(index, el);
    }
  }

  return (
    /* eslint-disable jsx-a11y/interactive-supports-focus */
    // biome-ignore lint/a11y/useFocusableInteractive: roving tabindex lives on the gridcell children (MediaGridCell), never the grid container itself — per APG grid pattern.
    // biome-ignore lint/a11y/useSemanticElements: APG composite grid widget — role="grid" on a div is first-class ARIA, not a semantic workaround. <table> implies tabular data which doesn't apply to a media picker.
    <div
      aria-colcount={columns}
      aria-label={ariaLabel}
      aria-rowcount={rowCount}
      className={cn(slots.root(), className)}
      data-slot="media-grid-root"
      onKeyDown={onGridKeyDown}
      ref={scrollRef}
      role="grid"
    >
      {/* eslint-enable jsx-a11y/interactive-supports-focus */}
      <div
        className="relative w-full"
        data-slot="media-grid-viewport"
        ref={rowVirtualizer.containerRef}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowStart = virtualRow.index * columns;
          const rowItems = items.slice(rowStart, rowStart + columns);
          return (
            // biome-ignore lint/a11y/useFocusableInteractive: rows are structural groupings only in the APG grid pattern — roving tabindex lives on the gridcell children, never the row itself.
            // biome-ignore lint/a11y/useSemanticElements: same APG grid pattern as the root — <tr> implies tabular data, which doesn't apply here.
            <div
              aria-rowindex={virtualRow.index + 1}
              className="absolute inset-x-0 grid"
              data-index={virtualRow.index}
              data-slot="media-grid-row"
              key={virtualRow.key}
              // position:absolute without main-axis position — directDomUpdates writes `top` directly.
              ref={rowVirtualizer.measureElement}
              role="row"
              style={{
                columnGap: gapPx,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item, colIndex) => (
                <MediaGridCell
                  colIndex={colIndex}
                  flatIndex={rowStart + colIndex}
                  focused={rowStart + colIndex === safeFocusedIndex}
                  item={item}
                  key={item.id}
                  onActivate={activate}
                  onFocusCell={setFocusedIndex}
                  registerRef={registerCellRef}
                  selectable={selection !== undefined}
                  selected={selection?.selectedIds.has(item.id) ?? false}
                  slots={slots}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
