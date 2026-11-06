import type { ScrollMode } from "@orb/kit/scroll-mode";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { GapToken } from "#lib";
import { assertBoundedScrollHeight, cn, FOCUS_RING_OUTLINE, gapPxFor, usePrefersReducedMotion } from "#lib";
import { rowLiveness } from "./announce.ts";
import { useScrollportSync, useTailRepin } from "./content-growth.ts";
import { attachUserScrollInput, shouldAdjustForResizedItem, USER_SCROLL_YIELD_MS } from "./follow-yield.ts";
import { composeRangeExtractor, everyRow, placeWithoutMeasure, updateEdgeFades, usePrinting } from "./list-window.ts";
import type { ReadingRow } from "./reading-row.ts";
import { holdReadingRow, readingRowOf } from "./reading-row.ts";
import type { MessageListRowNavigation, RowRovingOptions } from "./row-roving.ts";
import { MESSAGE_LIST_ROW_SLOT, useRowRoving } from "./row-roving.ts";

// Chat rows are tall and expensive Markdown trees. Two rows covers a fast scroll gesture without parsing
// multiple offscreen viewports of multi-kilobyte messages during cold room entry.
const OVERSCAN = 2;

/** The slot of the leading chrome's box. A caller that renders its chrome without rows (an empty thread) wraps it in
 *  the same slot, so a stylesheet that picks a copy by this slot reads one shape. */
export const MESSAGE_LIST_LEADING_SLOT = "message-list-leading";

// The leading action pins while it holds keyboard focus, or while its content asks to stay in view. The fill covers the
// rows under it on a plain background; over a wallpaper the action's own plate does.
const LEADING_ACTION_PIN = [
  "has-[:focus-visible,[data-keep-in-view]]:sticky has-[:focus-visible,[data-keep-in-view]]:inset-bs-0 has-[:focus-visible,[data-keep-in-view]]:z-(--z-overlay)",
  "not-in-data-[has-bg-image]:has-[:focus-visible,[data-keep-in-view]]:bg-background has-[:focus-visible,[data-keep-in-view]]:rounded-card",
];

// 80px reads as "pinned to end" for real content; the library's 1px default is too tight for sub-pixel rounding.
const SCROLL_END_THRESHOLD_PX = 80;

// Tolerance for matching virtual-core's own last scrollTop write vs. a genuine external scroll.
const PROGRAMMATIC_SCROLL_EPSILON_PX = 2;

export interface MessageListHandle {
  /** Imperatively scrolls to the last item. */
  readonly scrollToEnd: () => void;
  /**
   * `pin-prompt` mode only: scroll the item at `index` to the viewport TOP and hold it there while
   * content grows below (a bottom spacer lets a short reply still reach the top). A real no-op under
   * `scrollMode="follow"` (guarded below) — the caller owns which index is "the prompt" (the primitive
   * is domain-agnostic).
   */
  readonly pinToIndex: (index: number) => void;
  /** Reveal and focus a mounted row; false keeps a caller request pending until virtualization renders it. */
  readonly revealIndex: (index: number) => boolean;
}

export interface MessageListProps<T> {
  /** Accessible name for the live log region (for example, "Conversation messages" or "Log entries"). */
  readonly ariaLabel?: string;
  readonly items: readonly T[];
  readonly getItemKey: RowRovingOptions<T>["getItemKey"];
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: GapToken;
  /** Block-axis breathing INSIDE the scroll content (virtual-core `paddingStart`/`paddingEnd`), as a
   *  spacing token — deliberately NOT CSS `padding-block` on the scroll container: sticky `top: 0`
   *  resolves against the scroller's CONTENT box, so container padding pinned the sticky band below the
   *  visible top over a guillotined strip of its own prose (#204). Same token map as `gapToken`. */
  readonly blockPaddingToken?: GapToken;
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
   * Predicate naming which items must stay mounted as real DOM nodes even off-screen — for stateful
   * rows (edit-in-place, a Tier-B `sandbox-frame` iframe). Cap the matched set; heavy pinning defeats
   * virtualization.
   */
  readonly keepMounted?: (item: T) => boolean;
  /**
   * `"none"` (default) leaves every row's controls in the document tab order — right for a short,
   * bounded log. `"roving"` makes the WHOLE list one tab stop (see `row-roving.ts` for the why and the
   * mechanism): exactly one row is tabbable, ArrowUp/ArrowDown/Home/End move that row, Escape returns
   * focus from a row's controls to the row itself, and a non-focused row's controls are held out of the
   * sequential order. Mandatory for any log whose length is unbounded.
   */
  readonly rowNavigation?: MessageListRowNavigation;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /**
   * Chrome that scrolls with the rows, above the first one. It is part of the scroll content, so it leaves with the
   * oldest rows and comes back with them, and it is not a row: no position, no roving stop.
   */
  readonly leading?: ReactNode;
  /**
   * A control below `leading` (a history pager) that scrolls the same way but stays reachable from any row: it pins over
   * the rows, at its own size, while it holds keyboard focus or contains a `data-keep-in-view` element, and the rows stay put.
   */
  readonly leadingAction?: ReactNode;
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
  gapToken,
  blockPaddingToken,
  followTail = true,
  scrollMode = "follow",
  keepMounted,
  rowNavigation = "none",
  renderItem,
  leading,
  leadingAction,
  className,
  scrollContainerRef,
  ref,
}: MessageListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Stable on purpose: React detaches a changed ref before a commit and reattaches it after the children's refs. A row's
  // first measure runs in between, and with the scroller gone its compensating write would be dropped.
  const setScrollNode = useCallback((node: HTMLDivElement | null): void => {
    scrollRef.current = node;
  }, []);
  useLayoutEffect((): (() => void) | undefined => {
    if (typeof scrollContainerRef === "function") {
      scrollContainerRef(scrollRef.current);
      return (): void => {
        scrollContainerRef(null);
      };
    }
    if (scrollContainerRef) {
      scrollContainerRef.current = scrollRef.current;
      return (): void => {
        scrollContainerRef.current = null;
      };
    }
    return undefined;
  }, [scrollContainerRef]);
  const [leadingNode, setLeadingNode] = useState<HTMLDivElement | null>(null);
  const [leadingActionNode, setLeadingActionNode] = useState<HTMLDivElement | null>(null);
  // The height of the leading chrome and its action, without the top inset. The inset and the `scrollMargin` that counts it apply only
  // while there is chrome to show: a caller's chrome can be all `display: none`, and an empty header must shift nothing.
  // virtual-core takes it as `scrollMargin`, so every offset it computes (ends, reveals, pins, a prepend's anchor) counts it.
  const [leadingPx, setLeadingPx] = useState(0);
  const leadingPxRef = useRef(0);
  // The row at the reader's top edge and how far into it they are, kept from the last scroll; null while following.
  const readingRowRef = useRef<ReadingRow | null>(null);
  // The scroller's position as of its last scroll event. Focus reads this rather than the live value because a browser may
  // have scrolled to the focused control before its focus event fires.
  const settledTopRef = useRef(0);
  const holdingRef = useRef(false);
  const holdReadingRowRef = useRef<() => void>(() => undefined);
  const leadingInsetPx = Math.round(gapPxFor(blockPaddingToken));
  useLayoutEffect((): (() => void) | undefined => {
    if (leadingNode === null) {
      setLeadingPx(0);
      return undefined;
    }
    const measure = (): void => {
      const chrome = leadingNode.getBoundingClientRect().height - Number.parseFloat(getComputedStyle(leadingNode).paddingBlockStart);
      const next = Math.round(chrome + (leadingActionNode?.getBoundingClientRect().height ?? 0));
      // The chrome changes height when the caller's regime flips (a text-size change, a rotation), and rows re-measure in
      // the same pass; together they lose the reader's row, so the row read before the change is held through it.
      if (next !== leadingPxRef.current) {
        leadingPxRef.current = next;
        holdReadingRowRef.current();
      }
      setLeadingPx(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(leadingNode);
    if (leadingActionNode !== null) {
      observer.observe(leadingActionNode);
    }
    return (): void => observer.disconnect();
  }, [leadingNode, leadingActionNode]);
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
  // A scrollport resize re-pins the tail so the keyboard cannot cover the newest content.
  const [scrollportHeightPx, setScrollportHeightPx] = useState(0);
  // The roving hook must run BEFORE the virtualizer (its `activeIndex` feeds the range extractor, which is
  // a virtualizer option), but it needs to SCROLL through the virtualizer — so the call is late-bound
  // through a ref written in an effect below, never during render.
  const scrollToIndexRef = useRef<(index: number) => void>(() => undefined);
  const scrollToIndex = useCallback((index: number): void => scrollToIndexRef.current(index), []);
  // The ONE tabbable row's index (-1 when the mode is off) — see row-roving.ts for the whole technique.
  const activeIndex = useRowRoving({ enabled: roving, getItemKey, items, scrollToIndex, viewportRef: viewportNodeRef });

  const printing = usePrinting();
  const composedRangeExtractor = printing ? everyRow(items.length) : composeRangeExtractor(items, keepMounted, activeIndex);

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
    overscan: OVERSCAN,
    gap: Math.round(gapPxFor(gapToken)),
    paddingStart: Math.round(gapPxFor(blockPaddingToken)),
    scrollMargin: leadingPx > 0 ? leadingPx + leadingInsetPx : 0,
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
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    useCachedMeasurements: false,
    directDomUpdates: true,
    // "position" mode (plain top writes) avoids a new stacking context per row, which would break
    // portaled/fixed descendants (future edit-in-place overlays, Tier-B iframes).
    directDomUpdatesMode: "position",
    useFlushSync: false,
    // Row measurements resize the virtual container; those writes must leave native resize delivery.
    useAnimationFrameWithResizeObserver: true,
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
  //
  // Every input comes from the instance, and the veto stays installed across commits, because a new row's first measure
  // runs in its ref callback, mid-commit, before the DOM takes a prepend's anchor write. A row above the fold that read
  // the DOM's offset there would go uncompensated and move the reader by its whole delta.
  useLayoutEffect((): (() => void) => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance): boolean =>
      shouldAdjustForResizedItem({
        hasCachedSize: instance.itemSizeCache.has(item.key),
        index: item.index,
        lastIndex: instance.options.count - 1,
        scrollDirection: instance.scrollDirection,
        scrollOffset: instance.scrollOffset ?? 0,
        start: item.start,
      });
    return (): void => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [virtualizer]);

  // The reader's own hand on the axis — passive listeners, wired in `follow-yield.ts`.
  useLayoutEffect((): (() => void) | undefined => {
    const el = scrollRef.current;
    return el === null
      ? undefined
      : attachUserScrollInput(el, (): void => {
          userScrollAtRef.current = performance.now();
        });
  }, []);

  // The leading chrome's measure calls this; it reads the current items and virtualizer, so it is rebound every commit.
  const keyAt = (index: number): unknown => getItemKey(itemAt(index), index);
  const cancelHoldRef = useRef<() => void>(() => undefined);
  useEffect((): void => {
    holdReadingRowRef.current = (): void => {
      const el = scrollRef.current;
      const row = readingRowRef.current;
      // A reader at the chrome is reading it: chrome that grows there pushes the rows down and stays on screen.
      if (el === null || row === null || stickToBottomRef.current || el.scrollTop < leadingPxRef.current) {
        return;
      }
      cancelHoldRef.current();
      holdingRef.current = true;
      cancelHoldRef.current = holdReadingRow({
        scroller: el,
        row,
        count: items.length,
        keyAt,
        reveal: (index): void => virtualizer.scrollToIndex(index, { align: "start", behavior: "auto" }),
        // The reader's hand, or a jump that made the list follow its tail again, ends the hold.
        yieldTo: (): boolean => userOwnsAxis() || stickToBottomRef.current,
        onWrite: (top): void => {
          programmaticTopRef.current = top;
        },
        onDone: (): void => {
          holdingRef.current = false;
          readingRowRef.current = readingRowOf(el, items.length, keyAt);
        },
      });
    };
  });
  useEffect((): (() => void) => (): void => cancelHoldRef.current(), []);
  // Every explicit placement (a jump, a reveal, a pin) outranks a hold still in flight.
  const stopHold = useCallback((): void => {
    cancelHoldRef.current();
    holdingRef.current = false;
  }, []);

  // Tabbing to the leading action scrolls it into view, which would throw the reader to the oldest loaded row. The action
  // pins while it holds focus, so the rows go back where they were. A pointer press is left alone: the reader is at the
  // action already, and a held position would fight the prepend that press may start.
  useEffect((): (() => void) | undefined => {
    if (leadingActionNode === null) {
      return undefined;
    }
    let frame = 0;
    const onFocusIn = (event: FocusEvent): void => {
      const el = scrollRef.current;
      if (el === null || !(event.target instanceof Element) || !event.target.matches(":focus-visible")) {
        return;
      }
      const top = settledTopRef.current;
      const following = stickToBottomRef.current;
      stopHold();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame((): void => {
        el.scrollTop = top;
        programmaticTopRef.current = el.scrollTop;
        setFollowing(following);
      });
    };
    leadingActionNode.addEventListener("focusin", onFocusIn);
    return (): void => {
      cancelAnimationFrame(frame);
      leadingActionNode.removeEventListener("focusin", onFocusIn);
    };
  }, [leadingActionNode, setFollowing, stopHold]);

  // Explicit scrollToEnd on mount: anchorTo/followOnAppend alone only govern post-mount behavior.
  useLayoutEffect(() => {
    virtualizer.scrollToEnd({ behavior: "auto" });
  }, [virtualizer]);

  useTailRepin({ contentHeightPx, scrollRef, scrollportHeightPx, stickToBottomRef, tailFollowActive, virtualizer });

  // A scroll position matching virtual-core's last recorded write is its own drift/re-pin — ignore
  // it for FOLLOW intent (edge fades track every scroll, whoever moved it). Anything else was moved
  // externally (wheel/touch/keyboard/AT/scrollIntoView) and is trustworthy.
  const onScrollTracked = (): void => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    updateEdgeFades(el);
    settledTopRef.current = el.scrollTop;
    if (!holdingRef.current) {
      readingRowRef.current = readingRowOf(el, items.length, keyAt);
    }
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
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_END_THRESHOLD_PX);
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
      scrollToEnd: () => {
        stopHold();
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
      revealIndex: (index): boolean => {
        stopHold();
        setFollowing(false);
        pinnedIndexRef.current = null;
        setPinSpacerPx(0);
        virtualizer.scrollToIndex(index, { align: "start", behavior: "auto" });
        const row = scrollRef.current?.querySelector<HTMLElement>(`[data-slot="${MESSAGE_LIST_ROW_SLOT}"][data-index="${index}"]`);
        if (row === null || row === undefined) {
          return false;
        }
        row.focus({ preventScroll: true });
        return document.activeElement === row;
      },
      pinToIndex: (index) => {
        stopHold();
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
    [virtualizer, reducedMotion, setFollowing, pinMode, stopHold],
  );

  // Unbounded-height tripwire: thrown, not warned — identical to virtual-list.
  useLayoutEffect(() => assertBoundedScrollHeight(scrollRef.current, "MessageList"), []);

  // Edge fades, tail re-pinning and pin-prompt's spacer release — everything that keys on
  // the SCROLLPORT rather than on a scroll event. Both of its triggers, and why the scroller keeps a real
  // ResizeObserver while content growth does not, are `./content-growth.ts`'s header.
  useScrollportSync({ contentHeightPx, pinnedIndexRef, scrollRef, setPinSpacerPx, setScrollportHeightPx, virtualizer });

  // Late-bind the roving hook's scroll (declared above the virtualizer, used below it).
  useEffect((): void => {
    scrollToIndexRef.current = (index: number): void => virtualizer.scrollToIndex(index, { align: "auto", behavior: "auto" });
  }, [virtualizer]);

  return (
    <div
      ref={setScrollNode}
      role="log"
      aria-label={ariaLabel}
      // OFF is explicit because `role="log"` implies polite — `announce.ts` owns the whole rule (#1499).
      aria-live="off"
      onScroll={onScrollTracked}
      className={cn("relative overflow-auto overscroll-contain", className)}
      data-slot="message-list-scroll"
    >
      {leading === undefined && leadingAction === undefined ? null : (
        // In flow above the row viewport, so it scrolls with the rows; its top inset is the rows' own block breathing.
        // Paper says what the transcript leaves out on its own, so none of this chrome prints.
        <div
          ref={setLeadingNode}
          className="print:hidden"
          data-slot={MESSAGE_LIST_LEADING_SLOT}
          style={{ paddingBlockStart: leadingPx > 0 ? leadingInsetPx : 0 }}
        >
          {leading}
        </div>
      )}
      {leadingAction === undefined ? null : (
        // A sibling of the chrome, never inside it: a sticky box cannot leave its parent, and the chrome ends with the oldest row.
        <div ref={setLeadingActionNode} className={cn("inline-fit max-inline-full print:hidden", LEADING_ACTION_PIN)}>
          {leadingAction}
        </div>
      )}
      {/* A real list inside the log: semantic rows make the virtual position metadata valid. WHAT ANNOUNCES — why `log` not `feed`/`grid`, why only the tail is live: ./announce.ts. */}
      <ol ref={setViewportRef} className="relative m-0 list-none p-0 inline-full" data-slot="message-list-viewport">
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <li
            key={virtualItem.key}
            // Nothing is measured while printing: the first measure of a row mounted for paper above a scrolled-up reader
            // re-places every row below it. Rows are still placed at their screen offset; paper flows them statically.
            ref={printing ? placeWithoutMeasure(virtualItem.start - virtualizer.options.scrollMargin) : virtualizer.measureElement}
            data-index={virtualItem.index}
            data-slot={MESSAGE_LIST_ROW_SLOT}
            className={cn("absolute inset-x-0", roving && FOCUS_RING_OUTLINE)}
            aria-setsize={items.length}
            aria-posinset={virtualItem.index + 1}
            aria-live={rowLiveness(virtualItem.index, items.length)}
            {...(roving ? { tabIndex: virtualItem.index === activeIndex ? 0 : -1, "data-active": virtualItem.index === activeIndex ? "" : undefined } : {})}
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </li>
        ))}
      </ol>
    </div>
  );
}
