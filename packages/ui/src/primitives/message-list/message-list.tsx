import type { Range } from "@tanstack/react-virtual";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode, Ref } from "react";
import { useCallback, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { TOKENS } from "#tokens";

// Local duplicate of virtual-list's gap-token→px conversion; each sealed dir owns its own.
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type MessageListGapToken = (typeof GAP_TOKENS)[number];
const ROOT_FONT_SIZE_PX = 16;

// Chat rows are tall/variable; deeper overscan than virtual-list's default avoids pop-in on scrollback.
const DEFAULT_OVERSCAN = 10;

// Unbounded scroll container makes windowing a no-op — must throw, not warn.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

// 80px reads as "pinned to end" for real content; the library's 1px default is too tight for sub-pixel rounding.
const DEFAULT_SCROLL_END_THRESHOLD_PX = 80;

// Tolerance for matching virtual-core's own last scrollTop write vs. a genuine external scroll.
const PROGRAMMATIC_SCROLL_EPSILON_PX = 2;

function gapPxFor(token: MessageListGapToken): number {
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

// Merges keepMounted's forced indices into rangeExtractor's base range; sorted ascending because
// virtual-core requires ascending indices from its range extractors.
function composeRangeExtractor<T>(
  items: readonly T[],
  keepMounted: ((item: T) => boolean) | undefined,
  rangeExtractor: ((range: Range) => number[]) | undefined,
): ((range: Range) => number[]) | undefined {
  if (keepMounted === undefined) {
    return rangeExtractor;
  }
  const forced: number[] = [];
  for (const [index, item] of items.entries()) {
    if (keepMounted(item)) {
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

export interface MessageListHandle {
  /** Whether the viewport is currently pinned to the tail. */
  readonly isAtEnd: () => boolean;
  /** Pixel distance from the true end of the list. */
  readonly getDistanceFromEnd: () => number;
  /** Imperatively scrolls to the last item. */
  readonly scrollToEnd: () => void;
}

export interface MessageListProps<T> {
  readonly items: readonly T[];
  /** Stable per-item key — must be id-based, not index (the list both appends and prepends). */
  readonly getItemKey: (item: T, index: number) => string | number;
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Rows rendered beyond the visible window on each side; default is deeper than virtual-list's. */
  readonly overscan?: number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: MessageListGapToken;
  /** How close to the true end (px) still counts as "pinned" for `followOnAppend`/`isAtEnd`. */
  readonly scrollEndThreshold?: number;
  /**
   * Keep the tail pinned as content resizes while the reader is at the bottom, not just on append.
   * Default `true` — a just-sent message + streaming ghost re-measure far past their `estimateSize`
   * and would otherwise strand the reader above their own message. Pass `false` for a caller with its
   * own pin-not-yank logic (e.g. `log-viewer`).
   */
  readonly followTail?: boolean;
  /**
   * Low-level index-space override for the rendered range. Composes as the base window when
   * `keepMounted` is also set; the library default otherwise.
   */
  readonly rangeExtractor?: (range: Range) => number[];
  /**
   * Predicate naming which items must stay mounted as real DOM nodes even off-screen — for stateful
   * rows (edit-in-place, a Tier-B `sandbox-frame` iframe). Cap the matched set; heavy pinning defeats
   * virtualization.
   */
  readonly keepMounted?: (item: T) => boolean;
  /**
   * Passthrough for virtual-core's measurement-cache freeze — a static bypass a caller must toggle
   * live (e.g. an `<Activity>`-hidden pane, whose collapse would otherwise wipe measured heights).
   */
  readonly useCachedMeasurements?: boolean;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Caller-owned sizing/skin for the scroll container — the bounded height comes from here. */
  readonly className?: string;
  /** Escape hatch to the real scroll DOM node, e.g. for an external scroll-restoration hook. */
  readonly scrollContainerRef?: Ref<HTMLDivElement>;
  /** Imperative handle — React 19 ref-as-prop, no `forwardRef`. */
  readonly ref?: Ref<MessageListHandle>;
}

/**
 * TanStack Virtual chat-thread seal: bottom-anchored on mount, sticky-tail on append AND resize,
 * keep-mounted rows for stateful content, and an imperative jump-to-latest handle.
 */
export function MessageList<T>({
  items,
  getItemKey,
  estimateSize,
  overscan = DEFAULT_OVERSCAN,
  gapToken,
  scrollEndThreshold = DEFAULT_SCROLL_END_THRESHOLD_PX,
  followTail = true,
  rangeExtractor,
  keepMounted,
  useCachedMeasurements = false,
  renderItem,
  className,
  scrollContainerRef,
  ref,
}: MessageListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // Follow-the-tail intent, moved ONLY by an external scroll (never by virtual-core's own drift).
  const stickToBottomRef = useRef(true);
  const viewportNodeRef = useRef<HTMLDivElement | null>(null);
  // Last scrollTop virtual-core wrote via `scrollToFn`, used to tell its own drift from an external scroll.
  const programmaticTopRef = useRef<number | null>(null);
  const setFollowing = useCallback((value: boolean): void => {
    if (stickToBottomRef.current !== value) {
      stickToBottomRef.current = value;
    }
  }, []);

  const itemAt = (index: number): T => {
    const item = items.at(index);
    if (item === undefined) {
      throw new Error(`MessageList: virtual index ${index} has no backing item`);
    }
    return item;
  };

  const composedRangeExtractor = composeRangeExtractor(items, keepMounted, rangeExtractor);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    gap: gapToken === undefined ? 0 : gapPxFor(gapToken),
    getItemKey: (index) => getItemKey(itemAt(index), index),
    // exactOptionalPropertyTypes distinguishes an omitted prop from one set to undefined.
    ...(composedRangeExtractor === undefined ? {} : { rangeExtractor: composedRangeExtractor }),
    anchorTo: "end",
    followOnAppend: reducedMotion || followTail ? true : "smooth",
    // Force followOnAppend instant when followTail is on: a smooth scroll fires intermediate
    // positions that wouldn't match `programmaticTopRef`, tripping the external-scroll detector below.
    ...(followTail
      ? {
          scrollToFn: (offset: number, options: { adjustments?: number; behavior?: ScrollBehavior }) => {
            const el = scrollRef.current;
            if (el === null) {
              return;
            }
            const top = offset + (options.adjustments ?? 0);
            el.scrollTo(options.behavior === undefined ? { top } : { top, behavior: options.behavior });
            programmaticTopRef.current = el.scrollTop;
          },
        }
      : {}),
    scrollEndThreshold,
    useCachedMeasurements,
    directDomUpdates: true,
    // "position" mode (plain top writes) avoids a new stacking context per row, which would break
    // portaled/fixed descendants (future edit-in-place overlays, Tier-B iframes).
    directDomUpdatesMode: "position",
    useFlushSync: false,
  });

  // Explicit scrollToEnd on mount: anchorTo/followOnAppend alone only govern post-mount behavior.
  useLayoutEffect(() => {
    virtualizer.scrollToEnd({ behavior: "auto" });
  }, [virtualizer]);

  // followOnAppend only re-pins on a count change, never on an existing row growing taller — so a
  // just-sent message + streaming ghost re-measuring past their estimate can strand the reader above
  // their own message. This ResizeObserver re-pins on any content resize while following the tail.
  useLayoutEffect(() => {
    const node = viewportNodeRef.current;
    if (!followTail || node === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (stickToBottomRef.current && el !== null && el.clientHeight > 0) {
        virtualizer.scrollToEnd({ behavior: "auto" });
      }
    });
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [virtualizer, followTail]);

  // A scroll position matching virtual-core's last recorded write is its own drift/re-pin — ignore
  // it. Anything else was moved externally (wheel/touch/keyboard/AT/scrollIntoView) and is trustworthy.
  const onScrollTracked = (): void => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const expected = programmaticTopRef.current;
    if (expected !== null && Math.abs(el.scrollTop - expected) <= PROGRAMMATIC_SCROLL_EPSILON_PX) {
      return;
    }
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= scrollEndThreshold);
  };

  // Stable ref (virtualizer identity is stable) so React runs it only on real mount/unmount — an
  // inline arrow would thrash virtual-core's container registration every render.
  const setViewportRef = useCallback(
    (node: HTMLDivElement | null): void => {
      viewportNodeRef.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer],
  );

  useImperativeHandle(
    ref,
    (): MessageListHandle => ({
      isAtEnd: () => virtualizer.isAtEnd(),
      getDistanceFromEnd: () => virtualizer.getDistanceFromEnd(),
      scrollToEnd: () => {
        setFollowing(true);
        virtualizer.scrollToEnd({ behavior: reducedMotion ? "auto" : "smooth" });
      },
    }),
    [virtualizer, reducedMotion, setFollowing],
  );

  // Unbounded-height tripwire: thrown, not warned — identical to virtual-list.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const maxHeightPx = window.innerHeight * UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER;
    const measuredPx = el.getBoundingClientRect().height;
    if (measuredPx > maxHeightPx) {
      throw new Error(
        `MessageList: the scroll container measured ${Math.round(measuredPx)}px tall — over ` +
          `${UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER}× the viewport (${Math.round(maxHeightPx)}px). ` +
          "The parent gave the list no bounded height, so every row is 'visible' and " +
          "virtualization is a no-op. Fix: constrain the parent (e.g. h-full inside a sized " +
          "layout region) so the list scrolls inside a real window.",
      );
    }
  }, []);

  return (
    <div
      ref={(node): void => {
        scrollRef.current = node;
        if (typeof scrollContainerRef === "function") {
          scrollContainerRef(node);
        } else if (scrollContainerRef) {
          scrollContainerRef.current = node;
        }
      }}
      role="log"
      aria-live="polite"
      onScroll={followTail ? onScrollTracked : undefined}
      className={cn("overflow-auto overscroll-contain", className)}
      data-slot="message-list-scroll"
    >
      <div ref={setViewportRef} className="relative w-full" data-slot="message-list-viewport">
        {virtualizer.getVirtualItems().map((virtualItem) => (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: virtualized off-screen metadata
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-slot="message-list-row"
            className="absolute inset-x-0"
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
