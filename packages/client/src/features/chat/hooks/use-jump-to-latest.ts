// The state behind the floating "jump to latest" pill. At-tail reads from the scroll node's real
// geometry, sampled at settle (debounced), never the seal's follow-intent signal — intent desyncs from
// position the instant virtual-core writes scrollTop during a re-measure. The unread count is latched
// to its running max while away from the tail: messagesCount and the live turn-phase flag commit in
// separate renders, so the raw delta formula can dip through 0 mid-settle and self-hide over a
// genuinely-unread reply.
//
// `pinActive` (PD-147 pin-prompt): while the just-sent prompt is pinned to the viewport top and its
// reply streams below, the primitive arms a ~viewport-tall bottom spacer (paddingEnd). Raw
// scrollHeight-scrollTop-clientHeight then counts that void, so distance-from-bottom stays > threshold
// even though the newest content is on-screen — a false "N new". The surface knows the pin is armed
// (its own pinMode × live), so it feeds that in and we treat it as at-tail: suppresses the false pill
// AND keeps the snapshot synced, so no stale count survives once the pin collapses.

import type { MessageListHandle } from "@orb/ui/message-list";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const AT_TAIL_THRESHOLD_PX = 80;
const SETTLE_DEBOUNCE_MS = 90;

export interface UseJumpToLatestArgs {
  readonly messagesCount: number;
  readonly live: boolean;
  /** True while a pin-prompt pin is armed (surface's pinMode × live) — its bottom spacer inflates the
   *  raw distance-from-bottom, so we force at-tail to keep the pill from firing over on-screen content. */
  readonly pinActive: boolean;
  readonly listHandleRef: RefObject<MessageListHandle | null>;
}

export interface JumpToLatestState {
  readonly scrollContainerRef: (node: HTMLDivElement | null) => void;
  readonly atTail: boolean;
  readonly count: number;
  readonly visible: boolean;
  readonly onJump: () => void;
}

export function useJumpToLatest({ messagesCount, live, pinActive, listHandleRef }: UseJumpToLatestArgs): JumpToLatestState {
  const [atTailSampled, setAtTail] = useState(true);
  // An armed pin means the newest content is on-screen regardless of the spacer-inflated geometry.
  const atTail = pinActive || atTailSampled;
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sampleAtSettle = useCallback((): void => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(() => {
      const node = scrollNodeRef.current;
      if (node !== null) {
        setAtTail(node.scrollHeight - node.scrollTop - node.clientHeight <= AT_TAIL_THRESHOLD_PX);
      }
    }, SETTLE_DEBOUNCE_MS);
  }, []);

  const scrollContainerRef = useCallback(
    (node: HTMLDivElement | null): void => {
      const previous = scrollNodeRef.current;
      if (previous !== null) {
        previous.removeEventListener("scroll", sampleAtSettle);
      }
      scrollNodeRef.current = node;
      if (node !== null) {
        node.addEventListener("scroll", sampleAtSettle, { passive: true });
      }
    },
    [sampleAtSettle],
  );

  useEffect(
    (): (() => void) => (): void => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  // snapshot = the canon count last seen while at the tail, frozen while the reader is away.
  const [snapshot, setSnapshot] = useState(messagesCount);
  if (atTail && snapshot !== messagesCount) {
    setSnapshot(messagesCount);
  }

  const [unread, setUnread] = useState(0);
  const rawUnread = Math.max(0, messagesCount - snapshot) + (live ? 1 : 0);
  const count = atTail ? 0 : Math.max(unread, rawUnread);
  if (count !== unread) {
    setUnread(count);
  }

  const onJump = useCallback((): void => {
    // Imperative scroll only — a synchronous setAtTail here would re-render the surface into the
    // virtualizer and cancel the native smooth scroll mid-flight.
    listHandleRef.current?.scrollToEnd();
  }, [listHandleRef]);

  return { scrollContainerRef, atTail, count, visible: !atTail && count > 0, onJump };
}
