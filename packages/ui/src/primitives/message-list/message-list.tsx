import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode, Ref } from "react";
import { useImperativeHandle, useLayoutEffect, useRef } from "react";
import { cn } from "#lib";
import { TOKENS } from "#tokens";

// Same intent-token gap contract as the virtual-list seal (kept as a small local duplicate rather
// than a cross-import — the two sealed dirs each own their own tiny gap-token→px conversion; see
// the primitive contract §2.2 "intra-package composition" note, which permits but doesn't require
// sharing between sibling seals, and this is a 6-line helper, not shared state).
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type MessageListGapToken = (typeof GAP_TOKENS)[number];
const ROOT_FONT_SIZE_PX = 16;

// Chat rows run tall and variable (multi-paragraph messages); a deeper overscan than the generic
// virtual-list default avoids pop-in on quick scrollback (the neo message-list-surface precedent).
const DEFAULT_OVERSCAN = 10;

// D43 §11.3 tripwire, identical to virtual-list — an unbounded scroll container makes windowing a
// no-op and must THROW, not warn.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

// virtual-core's own chat-example default (verified against the TanStack Virtual chat guide, R8):
// "within N px of the true end" reads as pinned. 1px (the library's generic default) is too tight
// for real content — sub-pixel layout rounding would constantly misclassify a bottomed-out reader
// as "scrolled away."
const DEFAULT_SCROLL_END_THRESHOLD_PX = 80;

function gapPxFor(token: MessageListGapToken): number {
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface MessageListHandle {
  /** Whether the viewport is currently pinned to the tail (virtual-core's own scroll-end threshold). */
  readonly isAtEnd: () => boolean;
  /** The "jump to latest" action — imperatively scrolls to the last item. */
  readonly scrollToEnd: () => void;
}

export interface MessageListProps<T> {
  readonly items: readonly T[];
  /**
   * Stable per-item key — MUST be id-based (never the index). Chat histories both append (new
   * turns) and prepend (loading older history); an id key is what lets the virtualizer's
   * measurement cache and the bottom-anchor survive a prepend without re-measuring or losing the
   * reader's place (the same discipline as virtual-list's `getItemKey`).
   */
  readonly getItemKey: (item: T, index: number) => string | number;
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Rows rendered beyond the visible window on each side. Defaults deeper than virtual-list's
   *  (10) — chat rows are tall/variable, so a shallow overscan flashes rows in on scrollback. */
  readonly overscan?: number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: MessageListGapToken;
  /** How close to the true end (px) still counts as "pinned" for `followOnAppend`/`isAtEnd`. */
  readonly scrollEndThreshold?: number;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Caller-owned sizing/skin for the scroll container — the BOUNDED height comes from here. */
  readonly className?: string;
  /**
   * An escape hatch to the real scrolling DOM node. The list owns no scroll-restoration logic
   * itself (domain/router-agnostic — it doesn't know what a "chat" or a "route" is), but a real
   * `overflow: auto` element with native `scrollTop` is exactly what an external scroll-restoration
   * hook (e.g. a router's `useElementScrollRestoration`) or an `IntersectionObserver` needs to
   * attach to. Pair this ref with that hook at the call site.
   */
  readonly scrollContainerRef?: Ref<HTMLDivElement>;
  /** Imperative handle (`isAtEnd`/`scrollToEnd`) — React 19 ref-as-prop, no `forwardRef`. */
  readonly ref?: Ref<MessageListHandle>;
}

/**
 * The `@tanstack/react-virtual` chat-thread seal (ui-package-design §6.1/§9 — the `message-list`
 * row, un-parked). Builds on the SAME discipline as `virtual-list` (`directDomUpdates: true` +
 * `containerRef`, `useFlushSync: false`, `directDomUpdatesMode: "position"`, the unbounded-height
 * tripwire), plus the chat-specific bottom-anchor behavior virtual-core ships for exactly this case:
 *
 * - **Bottom-anchored on mount** — an explicit `virtualizer.scrollToEnd()` in a mount-only
 *   `useLayoutEffect`, the pattern the TanStack Virtual maintainers recommend (R8 — verified live;
 *   `anchorTo`/`followOnAppend` alone do NOT auto-scroll on first paint, they only govern behavior
 *   AFTER mount). Always instant (`behavior: "auto"`) regardless of motion pref — a chat opening
 *   scrolled to the top and animating down to the tail would itself be the jarring motion.
 * - **Stick-to-bottom on append** (`anchorTo: "end"` + `followOnAppend`) — virtual-core re-checks
 *   `isAtEnd()` (within `scrollEndThreshold` px of the true end) AND that the last item's key
 *   actually changed before it scrolls; a reader who has scrolled up to read history is never
 *   yanked back down by a new item landing below. `prefers-reduced-motion` swaps the follow
 *   behavior from `"smooth"` to `"auto"` (immediate, no animation) rather than skipping the follow
 *   entirely — the list still tracks the tail, it just doesn't animate the jump.
 * - **`measureElement` + `data-index`** on every row reserves each row's box and re-measures it
 *   after paint, so variable-height messages (one line vs. many paragraphs) don't reflow the whole
 *   list — the same wiring as virtual-list. `anchorTo: "end"` also keeps the tail pinned as
 *   estimates are replaced by real measurements (virtual-core's own resize-adjustment, not
 *   `followOnAppend`), so the mount-time `scrollToEnd()` doesn't drift once rows settle.
 * - Domain-agnostic: takes `items` + `renderItem` + `getItemKey` only. It has no idea what a
 *   "message" or a "chat" is — the chat-client chunk supplies ghost-row and ordinary-row rendering
 *   entirely through `renderItem`.
 *
 * Usage:
 * ```tsx
 * <MessageList
 *   items={messages}
 *   getItemKey={(m) => m.id}
 *   estimateSize={() => estimatedRowPx}
 *   renderItem={(m) => <MessageRow message={m} />}
 *   className="h-full"
 * />
 * ```
 */
export function MessageList<T>({
  items,
  getItemKey,
  estimateSize,
  overscan = DEFAULT_OVERSCAN,
  gapToken,
  scrollEndThreshold = DEFAULT_SCROLL_END_THRESHOLD_PX,
  renderItem,
  className,
  scrollContainerRef,
  ref,
}: MessageListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const itemAt = (index: number): T => {
    const item = items.at(index);
    if (item === undefined) {
      throw new Error(`MessageList: virtual index ${index} has no backing item`);
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
    // The chat-thread anchor pair (verified against virtual-core@3.17's pendingScrollAnchor path):
    // `followOnAppend` only fires when the viewport was already at the end AND the item count grew
    // AND the last key actually changed — so it never fights a reader who scrolled up.
    anchorTo: "end",
    followOnAppend: prefersReducedMotion() ? true : "smooth",
    scrollEndThreshold,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    useFlushSync: false,
  });

  // Bottom-anchored initial render (R8 — verified against the TanStack Virtual maintainers'
  // recommended pattern for GitHub discussion #911 "how to scroll to bottom of a list at init":
  // `anchorTo`/`followOnAppend` alone only govern POST-mount behavior; the first paint needs an
  // explicit nudge). `virtualizer`'s identity is stable across re-renders (a ref-held instance), so
  // this fires once per mount despite the dependency array.
  useLayoutEffect(() => {
    virtualizer.scrollToEnd({ behavior: "auto" });
  }, [virtualizer]);

  useImperativeHandle(
    ref,
    (): MessageListHandle => ({
      isAtEnd: () => virtualizer.isAtEnd(),
      scrollToEnd: () =>
        virtualizer.scrollToEnd({ behavior: prefersReducedMotion() ? "auto" : "smooth" }),
    }),
    [virtualizer],
  );

  // The unbounded-window tripwire (D43 §11.3) — thrown, not warned. Identical to virtual-list.
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
      className={cn("overflow-auto overscroll-contain", className)}
    >
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
