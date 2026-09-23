import type { ScrollMode } from "@orb/kit/scroll-mode";
import type { Range } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { GapToken } from "#lib";
import { assertBoundedScrollHeight, cn, FOCUS_RING_OUTLINE, gapPxFor, usePrefersReducedMotion } from "#lib";
import { rowLiveness } from "./announce.ts";
import { useScrollportSync, useTailRepin } from "./content-growth.ts";
import { attachUserScrollInput, shouldAdjustForResizedItem, USER_SCROLL_YIELD_MS } from "./follow-yield.ts";
import type { MessageListRowMeta } from "./list-window.ts";
import { composeRangeExtractor, updateEdgeFades } from "./list-window.ts";
import type { MessageListRowNavigation } from "./row-roving.ts";
import { MESSAGE_LIST_ROW_SLOT, useRowRoving } from "./row-roving.ts";

// Chat rows are tall and expensive Markdown trees. Two rows covers a fast scroll gesture without parsing
// multiple offscreen viewports of multi-kilobyte messages during cold room entry.
const DEFAULT_OVERSCAN = 2;

// 80px reads as "pinned to end" for real content; the library's 1px default is too tight for sub-pixel rounding.
const DEFAULT_SCROLL_END_THRESHOLD_PX = 80;

// Tolerance for matching virtual-core's own last scrollTop write vs. a genuine external scroll.
const PROGRAMMATIC_SCROLL_EPSILON_PX = 2;

export interface MessageListHandle {
  /** Whether the viewport is currently pinned to the tail. */
  readonly isAtEnd: () => boolean;
  /** Pixel distance from the true end of the list. */
  readonly getDistanceFromEnd: () => number;
  /** Imperatively scrolls to the last item. */
  readonly scrollToEnd: () => void;
  /**
   * `pin-prompt` mode only: scroll the item at `index` to the viewport TOP and hold it there while
   * content grows below (a bottom spacer lets a short reply still reach the top). A real no-op under
   * `scrollMode="follow"` (guarded below) — the caller owns which index is "the prompt" (the primitive
   * is domain-agnostic).
   */
  readonly pinToIndex: (index: number) => void;
}

export interface MessageListProps<T> {
  /** Accessible name for the live log region (for example, "Conversation messages" or "Log entries"). */
  readonly ariaLabel?: string;
  readonly items: readonly T[];
  /** Stable per-item key — must be id-based, not index (the list both appends and prepends). */
  readonly getItemKey: (item: T, index: number) => string | number;
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Rows rendered beyond the visible window on each side; default is deeper than virtual-list's. */
  readonly overscan?: number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: GapToken;
  /** Block-axis breathing INSIDE the scroll content (virtual-core `paddingStart`/`paddingEnd`), as a
   *  spacing token — deliberately NOT CSS `padding-block` on the scroll container: sticky `top: 0`
   *  resolves against the scroller's CONTENT box, so container padding pinned the sticky band below the
   *  visible top over a guillotined strip of its own prose (#204). Same token map as `gapToken`. */
  readonly blockPaddingToken?: GapToken;
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
   * Stream-display scroll behavior. `follow` (default) = the sealed sticky-tail behavior. `pin-prompt` =
   * tail-follow OFF; the caller pins the just-sent message to the top via the handle's `pinToIndex` on
   * turn start and it holds while the reply streams below. Byte-identical to today under `follow`.
   */
  readonly scrollMode?: ScrollMode;
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
  /**
   * `"none"` (default) leaves every row's controls in the document tab order — right for a short,
   * bounded log. `"roving"` makes the WHOLE list one tab stop (see `row-roving.ts` for the why and the
   * mechanism): exactly one row is tabbable, ArrowUp/ArrowDown/Home/End move that row, Escape returns
   * focus from a row's controls to the row itself, and a non-focused row's controls are held out of the
   * sequential order. Mandatory for any log whose length is unbounded.
   */
  readonly rowNavigation?: MessageListRowNavigation;
  readonly renderItem: (item: T, index: number, meta: MessageListRowMeta) => ReactNode;
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
  ariaLabel,
  items,
  getItemKey,
  estimateSize,
  overscan = DEFAULT_OVERSCAN,
  gapToken,
  blockPaddingToken,
  scrollEndThreshold = DEFAULT_SCROLL_END_THRESHOLD_PX,
  followTail = true,
  scrollMode = "follow",
  rangeExtractor,
  keepMounted,
  useCachedMeasurements = false,
  rowNavigation = "none",
  renderItem,
  className,
  scrollContainerRef,
  ref,
}: MessageListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // Follow-the-tail intent, moved ONLY by an external scroll (never by virtual-core's own drift).
  const stickToBottomRef = useRef(true);
  const viewportNodeRef = useRef<HTMLOListElement | null>(null);
  // Last scrollTop virtual-core wrote via `scrollToFn`, used to tell its own drift from an external scroll.
  const programmaticTopRef = useRef<number | null>(null);
  // pin-prompt mode: tail-follow is OFF (the prompt pin replaces it); everything below keys off this.
  const pinMode = scrollMode === "pin-prompt";
  const tailFollowActive = !pinMode && followTail;
  // The item index currently pinned to the viewport top (null = none) + the bottom spacer that lets a
  // short reply's pinned prompt still reach the top. Both inert (spacer 0) in `follow` mode → byte-identical.
  const pinnedIndexRef = useRef<number | null>(null);
  const [pinSpacerPx, setPinSpacerPx] = useState(0);
  const setFollowing = useCallback((value: boolean): void => {
    if (stickToBottomRef.current !== value) {
      stickToBottomRef.current = value;
    }
  }, []);
  // Wall clock of the last real user scroll INPUT (see USER_SCROLL_YIELD_MS). Never state: it is read
  // inside virtual-core's own scroll path, which must not depend on a React commit having landed.
  const userScrollAtRef = useRef(Number.NEGATIVE_INFINITY);
  const userOwnsAxis = (): boolean => performance.now() - userScrollAtRef.current < USER_SCROLL_YIELD_MS;

  const itemAt = (index: number): T => {
    const item = items.at(index);
    if (item === undefined) {
      throw new Error(`MessageList: virtual index ${index} has no backing item`);
    }
    return item;
  };

  const roving = rowNavigation === "roving";
  // The scrollport height, for `MessageListRowMeta.exceedsViewport`. State (not a ref) because a row's
  // rendered output depends on it; written only when the container actually resizes.
  const [scrollportHeightPx, setScrollportHeightPx] = useState(0);
  // The roving hook must run BEFORE the virtualizer (its `activeIndex` feeds the range extractor, which is
  // a virtualizer option), but it needs to SCROLL through the virtualizer — so the call is late-bound
  // through a ref written in an effect below, never during render.
  const scrollToIndexRef = useRef<(index: number) => void>(() => undefined);
  const scrollToIndex = useCallback((index: number): void => scrollToIndexRef.current(index), []);
  // The ONE tabbable row's index (-1 when the mode is off) — see row-roving.ts for the whole technique.
  const activeIndex = useRowRoving({ enabled: roving, getItemKey, items, scrollToIndex, viewportRef: viewportNodeRef });

  const composedRangeExtractor = composeRangeExtractor(items, keepMounted, rangeExtractor, activeIndex);

  // pin-prompt never auto-follows an append (the pin owns placement); otherwise today's behavior
  // (instant when tail-follow is on — see the scrollToFn note below — else virtual-core's smooth).
  const followTailAppend: boolean | "smooth" = reducedMotion || followTail ? true : "smooth";
  const followOnAppend: boolean | "smooth" = pinMode ? false : followTailAppend;

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    // EVERY LENGTH HANDED TO THE VIRTUALIZER IS AN INTEGER, AND THAT IS A CRISPNESS INVARIANT (#1362 —
    // docs/law/integer-line-boxes.md Law 3), not defensiveness. `directDomUpdatesMode: "position"` makes
    // react-virtual write `el.style.top = ${item.start}px` on every row, and `item.start` is the running
    // sum of paddingStart + Σ(size + gap). virtual-core already rounds MEASURED sizes (its own
    // `measureElement` does `Math.round(borderBoxSize)`), so the only fractional input is what the caller
    // supplies — and a caller's estimate is routinely fractional by construction: the chat transcript's is
    // a calibrated `96 + chars * 0.28` (message-list-surface.ts, #1181). One unmeasured row above the
    // viewport therefore puts every row below it on a fraction of a pixel, which every promoted layer
    // inside those rows inherits with baseline snapping OFF. Measured on the isolated stage before this
    // rounding: `li[data-slot=message-list-row]` at `top -0.484 device px` under an integer-landing
    // `ol[data-slot=message-list-viewport]`, carried into `promoted-layer-offset` on the row's own bubble
    // and swipe strip. Rounding here rather than at the call site is the one-home answer: the invariant
    // belongs to whoever writes the `top`, so a future caller cannot reintroduce it. The cost is bounded
    // at half a pixel of estimate error per unmeasured row, which the estimate is already wrong by more
    // than, in both directions, by its own calibration.
    estimateSize: (index): number => Math.round(estimateSize(index)),
    overscan,
    gap: Math.round(gapPxFor(gapToken)),
    paddingStart: Math.round(gapPxFor(blockPaddingToken)),
    // pin-prompt's bottom spacer: extra scrollable height below the last row so a short reply's pinned
    // prompt can still climb to the top. 0 (= virtual-core default) in `follow` mode → byte-identical.
    paddingEnd: Math.round(gapPxFor(blockPaddingToken) + pinSpacerPx),
    getItemKey: (index) => getItemKey(itemAt(index), index),
    // exactOptionalPropertyTypes distinguishes an omitted prop from one set to undefined.
    ...(composedRangeExtractor === undefined ? {} : { rangeExtractor: composedRangeExtractor }),
    anchorTo: "end",
    followOnAppend,
    // Force followOnAppend instant when tail-follow is on: a smooth scroll fires intermediate
    // positions that wouldn't match `programmaticTopRef`, tripping the external-scroll detector below.
    ...(tailFollowActive
      ? {
          scrollToFn: (offset: number, options: { adjustments?: number; behavior?: ScrollBehavior }) => {
            const el = scrollRef.current;
            if (el === null) {
              return;
            }
            // THE YIELD (see USER_SCROLL_YIELD_MS): while the reader's hand is on the axis AND we still
            // think we are following, every programmatic write is dropped — that pair IS the tug-of-war,
            // and dropping it is what lets the wheel land and the scroll event reach the intent detector.
            // Scoped to `stickToBottomRef` deliberately: a blanket drop also swallows the LEGITIMATE
            // anchor adjustment a prepend needs ("load older history"), and the prepend-stability CT
            // caught exactly that — an 800px jump. A reader who has already scrolled away is not being
            // marched at, so nothing there needs yielding.
            if (userOwnsAxis() && stickToBottomRef.current) {
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

  // The content-growth signal both `contentHeightPx` effects key on — virtual-core's own written number,
  // never a ResizeObserver on the box it writes. The mechanism, and the two timing facts the shape
  // produces, are `./content-growth.ts`'s header (#1384).
  const contentHeightPx = virtualizer.getTotalSize();

  // The tail-adjustment veto (see `follow-yield.ts` for WHY — it is the fix for the 12px march that
  // drags a reader parked inside a long streaming reply).
  //
  // ⚠ This is an INSTANCE FIELD, not an option — `Virtualizer` only ever READS
  // `this.shouldAdjustScrollPositionOnItemSizeChange` and nothing in virtual-core or react-virtual
  // assigns it from `options`. Passing it to `useVirtualizer` is a SILENT no-op (verified against
  // virtual-core 3.17.3's shipped source; it cost this lane a green-looking run).
  useLayoutEffect((): (() => void) => {
    const lastIndex = items.length - 1;
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance): boolean =>
      shouldAdjustForResizedItem({
        hasCachedSize: instance.itemSizeCache.has(item.key),
        index: item.index,
        lastIndex,
        scrollDirection: instance.scrollDirection,
        scrollOffset: scrollRef.current?.scrollTop ?? 0,
        start: item.start,
      });
    return (): void => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [virtualizer, items.length]);

  // The reader's own hand on the axis — passive listeners, wired in `follow-yield.ts`.
  useLayoutEffect((): (() => void) | undefined => {
    const el = scrollRef.current;
    return el === null
      ? undefined
      : attachUserScrollInput(el, (): void => {
          userScrollAtRef.current = performance.now();
        });
  }, []);

  // Explicit scrollToEnd on mount: anchorTo/followOnAppend alone only govern post-mount behavior.
  useLayoutEffect(() => {
    virtualizer.scrollToEnd({ behavior: "auto" });
  }, [virtualizer]);

  useTailRepin({ contentHeightPx, scrollRef, stickToBottomRef, tailFollowActive, virtualizer });

  // A scroll position matching virtual-core's last recorded write is its own drift/re-pin — ignore
  // it for FOLLOW intent (edge fades track every scroll, whoever moved it). Anything else was moved
  // externally (wheel/touch/keyboard/AT/scrollIntoView) and is trustworthy.
  const onScrollTracked = (): void => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    updateEdgeFades(el);
    // A gesture's scroll chain KEEPS the axis: every scroll event that lands while the reader still owns
    // it renews the yield, so the window means "until the scrolling their input started has stopped",
    // not "150ms of wall clock". Without this the window can expire mid-flick under load — measured as a
    // 578px re-pin in one contended CT worker while the same test passed 3/3 in isolation. Our own march
    // cannot renew it: those writes happen with `userOwnsAxis()` already false.
    if (userOwnsAxis()) {
      userScrollAtRef.current = performance.now();
    }
    if (!tailFollowActive) {
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
    (node: HTMLOListElement | null): void => {
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
        // An explicit jump abandons an active pin: clear the pinned index + collapse the
        // spacer BEFORE the end offset is computed, else getMaxScrollOffset() (= scrollHeight -
        // clientHeight) counts the spacer void and the jump lands past the last real row into it.
        // Defer one frame so paddingEnd=0 lands in the scroll height first (mirrors pinToIndex).
        if (pinnedIndexRef.current !== null) {
          pinnedIndexRef.current = null;
          setPinSpacerPx(0);
          requestAnimationFrame(() => {
            virtualizer.scrollToEnd({ behavior: reducedMotion ? "auto" : "smooth" });
          });
          return;
        }
        virtualizer.scrollToEnd({ behavior: reducedMotion ? "auto" : "smooth" });
      },
      pinToIndex: (index) => {
        // A real no-op outside pin-prompt mode: follow mode owns tail placement, so a stray pin would
        // arm the spacer and fight the sticky-tail. Keeps `follow` byte-identical.
        if (!pinMode) {
          return;
        }
        const el = scrollRef.current;
        pinnedIndexRef.current = index;
        // A full viewport of scrollable space below the last row so the pinned prompt can climb to the
        // top even when the reply is short; the resize observer collapses it once real content fills that
        // space. Defer the scroll one frame so the new paddingEnd lands in the scroll height first.
        setPinSpacerPx(el === null ? 0 : el.clientHeight);
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(index, { align: "start", behavior: reducedMotion ? "auto" : "smooth" });
        });
      },
    }),
    [virtualizer, reducedMotion, setFollowing, pinMode],
  );

  // Unbounded-height tripwire: thrown, not warned — identical to virtual-list.
  useLayoutEffect(() => assertBoundedScrollHeight(scrollRef.current, "MessageList"), []);

  // Edge fades, the `exceedsViewport` denominator and pin-prompt's spacer release — everything that keys on
  // the SCROLLPORT rather than on a scroll event. Both of its triggers, and why the scroller keeps a real
  // ResizeObserver while content growth does not, are `./content-growth.ts`'s header.
  useScrollportSync({ contentHeightPx, pinnedIndexRef, scrollRef, setPinSpacerPx, setScrollportHeightPx, virtualizer });

  // Late-bind the roving hook's scroll (declared above the virtualizer, used below it).
  useEffect((): void => {
    scrollToIndexRef.current = (index: number): void => virtualizer.scrollToIndex(index, { align: "auto", behavior: "auto" });
  }, [virtualizer]);

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
      aria-label={ariaLabel}
      // OFF is explicit because `role="log"` implies polite — `announce.ts` owns the whole rule (#1499).
      aria-live="off"
      onScroll={onScrollTracked}
      className={cn("relative overflow-auto overscroll-contain", className)}
      data-slot="message-list-scroll"
    >
      {/* A real list inside the log: semantic rows make the virtual position metadata valid. WHAT ANNOUNCES — why `log` not `feed`/`grid`, why only the tail is live: ./announce.ts. */}
      <ol ref={setViewportRef} className="relative m-0 w-full list-none p-0" data-slot="message-list-viewport">
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <li
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-slot={MESSAGE_LIST_ROW_SLOT}
            className={cn("absolute inset-x-0", roving && FOCUS_RING_OUTLINE)}
            aria-setsize={items.length}
            aria-posinset={virtualItem.index + 1}
            aria-live={rowLiveness(virtualItem.index, items.length)}
            {...(roving ? { tabIndex: virtualItem.index === activeIndex ? 0 : -1, "data-active": virtualItem.index === activeIndex ? "" : undefined } : {})}
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index, {
              exceedsViewport: scrollportHeightPx > 0 && virtualizer.itemSizeCache.has(virtualItem.key) && virtualItem.size > scrollportHeightPx,
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
