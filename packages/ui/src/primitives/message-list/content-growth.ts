// EVERYTHING THAT REACTS TO MEASURED CONTENT HEIGHT — the message list's two `contentHeightPx` layout
// effects, split out of message-list.tsx to keep the primitive under the 450-line cap
// (UI-Primitives-and-Reuse.md §13.7), like list-window.ts, follow-yield.ts, pin-spacer.ts and announce.ts.
// The seal keeps the WHEN (which refs, which render); this file owns the WHAT and the WHY.
//
// THE SIGNAL COMES FROM VIRTUAL-CORE, NOT FROM A ResizeObserver (#1384, c53958876). Both effects need
// "the measured content got taller"; both used to observe `viewportNodeRef` — virtual-core's own container
// (`setViewportRef` → `containerRef`), whose height IT writes from inside its own `measureElement`
// ResizeObserver callback. Observing a box another observer resizes is what Chrome reports as
// `ResizeObserver loop completed with undelivered notifications` (×2 per room open, live-A/B isolated to
// exactly these two). `getTotalSize()` IS that written number, so this keys on the CAUSE rather than the
// effect and costs no observer at all. The SCROLLER's own ResizeObserver stays, because nobody else writes
// that box — a container resize is a real, separate trigger.
//
// ── TWO TIMING FACTS THE c53958876 SHAPE PRODUCES, stated because neither is obvious from the call site ──
//
// (a) THE MOUNT SYNC IS GATED, SO AN EMPTY LIST WAITS FOR THE SCROLLER'S OBSERVER. `useScrollportSync` runs
//     its `sync()` at effect time only when `contentHeightPx > 0`, and `getTotalSize()` on an empty list is
//     `paddingStart + paddingEnd` — which is exactly 0 when no `blockPaddingToken` is passed
//     (`gapPxFor(undefined) === 0`, `lib/virtual-gap.ts`). So an empty list seeds NO edge-fade attributes
//     and NO scrollport height at mount; the first delivery of the scroller's own ResizeObserver is what
//     runs `sync()` for the first time. That is correct — there is nothing to fade past and no row to
//     measure against — but it means "after mount" is not the same instant as "after the first sync" for a
//     list that starts empty, and a caller/probe that reads `data-fade-*` on an empty list is reading a
//     state that has not been written yet rather than one that was written false. A list given a
//     `blockPaddingToken` has a non-zero total even when empty, so it takes the mount path instead.
//
// (b) THE TAIL RE-PIN FIRES ON EFFECT SETUP, NOT ONLY ON GROWTH — and `stickToBottomRef` is the only thing
//     between it and the reader. `useTailRepin` has no "did it actually grow?" comparison: any run of the
//     effect whose guards pass calls `scrollToEnd`, and the effect runs on setup as well as on every
//     `contentHeightPx` change. The guard chain is therefore load-bearing rather than defensive — follow
//     intent (`stickToBottomRef`, moved only by a real external scroll), a measured list
//     (`contentHeightPx > 0`, which is also the "nothing to pin to yet" gate) and a laid-out scroller
//     (`clientHeight > 0`). A reader who has scrolled away is protected by the ref alone.

import type { Virtualizer } from "@tanstack/react-virtual";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useLayoutEffect } from "react";
import { updateEdgeFades } from "./list-window.ts";
import { pinSpacerSpent } from "./pin-spacer.ts";

/** The virtualizer instance both effects read — spelled once so neither hook re-states the type params. */
type MessageListVirtualizer = Virtualizer<HTMLDivElement, HTMLLIElement>;

/**
 * May the tail re-pin run? See (b): there is no growth comparison, so every guard here is what stands
 * between an effect setup and a scroll the reader did not ask for.
 *
 * - `tailFollowActive` — off entirely under `pin-prompt` (the pin owns placement) and under `followTail: false`.
 * - `sticking` — the reader's own follow intent, moved only by an external scroll.
 * - `contentHeightPx > 0` — the list has been measured; before that there is no end to pin to.
 * - `clientHeightPx > 0` — the scroller has a box; scrolling an unlaid-out element is a no-op that also
 *   records a programmatic write, which the external-scroll detector would then have to un-learn.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function shouldRepinTail(input: {
  readonly tailFollowActive: boolean;
  readonly sticking: boolean;
  readonly contentHeightPx: number;
  readonly clientHeightPx: number;
}): boolean {
  return input.tailFollowActive && input.sticking && input.contentHeightPx > 0 && input.clientHeightPx > 0;
}

/**
 * Whether the mount-time `sync()` runs at all — see (a). `false` on an empty, unpadded list, which then
 * takes its first sync from the scroller's ResizeObserver instead.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function shouldSyncOnMount(contentHeightPx: number): boolean {
  return contentHeightPx > 0;
}

/**
 * The scrollport-height state update, EQUALITY-GUARDED. This is the `exceedsViewport` denominator, and the
 * guard is why a streaming turn does not re-render the whole list through this path: a row growing changes
 * the OL's height, never the scrollport's, so `sync()` runs and this returns the identical number.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function nextScrollportHeight(previousPx: number, clientHeightPx: number): number {
  return previousPx === clientHeightPx ? previousPx : clientHeightPx;
}

/**
 * Re-pin the tail as measured content grows. `followOnAppend` only re-pins on a COUNT change, never on an
 * existing row growing taller — so a just-sent message plus a streaming ghost re-measuring past their
 * `estimateSize` would otherwise strand the reader above their own message.
 */
export function useTailRepin(input: {
  readonly virtualizer: MessageListVirtualizer;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly stickToBottomRef: RefObject<boolean>;
  readonly tailFollowActive: boolean;
  readonly contentHeightPx: number;
}): void {
  const { virtualizer, scrollRef, stickToBottomRef, tailFollowActive, contentHeightPx } = input;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el !== null && shouldRepinTail({ tailFollowActive, sticking: stickToBottomRef.current, contentHeightPx, clientHeightPx: el.clientHeight })) {
      virtualizer.scrollToEnd({ behavior: "auto" });
    }
    // The refs are stable boxes; the effect must re-run on measured growth and on the mode flip only.
  }, [virtualizer, scrollRef, stickToBottomRef, tailFollowActive, contentHeightPx]);
}

/**
 * Seed + track everything that depends on the SCROLLPORT rather than on a scroll event: the edge fades,
 * the `exceedsViewport` denominator, and `pin-prompt`'s spacer release. Two carriers, per the header —
 * CONTAINER resizes ride the scroller's own ResizeObserver, CONTENT growth rides `contentHeightPx`.
 */
export function useScrollportSync(input: {
  readonly virtualizer: MessageListVirtualizer;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly pinnedIndexRef: RefObject<number | null>;
  readonly contentHeightPx: number;
  readonly setScrollportHeightPx: Dispatch<SetStateAction<number>>;
  readonly setPinSpacerPx: Dispatch<SetStateAction<number>>;
}): void {
  const { virtualizer, scrollRef, pinnedIndexRef, contentHeightPx, setScrollportHeightPx, setPinSpacerPx } = input;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const sync = (): void => {
      updateEdgeFades(el);
      setScrollportHeightPx((prev) => nextScrollportHeight(prev, el.clientHeight));
      // pin-prompt: drop the pin once the spacer is spent (pin-spacer.ts owns that decision).
      const pinnedIndex = pinnedIndexRef.current;
      if (pinnedIndex === null) {
        return;
      }
      const rendered = virtualizer.getVirtualItems();
      if (
        pinSpacerSpent(
          el.clientHeight,
          rendered.find((v) => v.index === pinnedIndex),
          rendered.at(-1),
        )
      ) {
        pinnedIndexRef.current = null;
        setPinSpacerPx(0);
      }
    };
    if (shouldSyncOnMount(contentHeightPx)) {
      sync();
    }
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [virtualizer, scrollRef, pinnedIndexRef, contentHeightPx, setScrollportHeightPx, setPinSpacerPx]);
}
