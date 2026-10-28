// The state behind the floating "jump to latest" pill. At-tail reads from the scroll node's real
// geometry, sampled when the scroll ends (`scrollend`, or a debounced `scroll` where the browser lacks it), never the seal's follow-intent signal — intent desyncs from
// position the instant virtual-core writes scrollTop during a re-measure. The unread count is latched
// to its running max while away from the tail: canon and the live turn-phase flag commit in
// separate renders, so the raw delta formula can dip through 0 mid-settle and self-hide over a
// genuinely-unread reply.
//
// `pinActive` (pin-prompt): while the just-sent prompt is pinned to the viewport top and its
// reply streams below, the primitive arms a ~viewport-tall bottom spacer (paddingEnd). Raw
// scrollHeight-scrollTop-clientHeight then counts that void, so distance-from-bottom stays > threshold
// even though the newest content is on-screen — a false "N new". The surface knows the pin is armed
// (its own pinMode × live), so it feeds that in and we treat it as at-tail: suppresses the false pill
// AND keeps the snapshot synced, so no stale count survives once the pin collapses.

import type { MessageView } from "@orb/contracts/chat";
import type { MessageListHandle } from "@orb/ui/message-list";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

const AT_TAIL_THRESHOLD_PX = 80;
// Safari and iOS before 26.2 have no `scrollend`; a quiet period after the last `scroll` stands in for it.
const SETTLE_DEBOUNCE_MS = 90;

export interface UseJumpToLatestArgs {
  readonly messages: readonly Pick<MessageView, "seq">[];
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

export function useJumpToLatest({ messages, live, pinActive, listHandleRef }: UseJumpToLatestArgs): JumpToLatestState {
  const [atTailSampled, setAtTail] = useState(true);
  // An armed pin means the newest content is on-screen regardless of the spacer-inflated geometry.
  const atTail = pinActive || atTailSampled;
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);

  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sampleAtSettle = (): void => {
    const node = scrollNodeRef.current;
    if (node !== null) {
      setAtTail(node.scrollHeight - node.scrollTop - node.clientHeight <= AT_TAIL_THRESHOLD_PX);
    }
  };

  const sampleAfterQuiet = (): void => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(sampleAtSettle, SETTLE_DEBOUNCE_MS);
  };

  const scrollContainerRef = (node: HTMLDivElement | null): void => {
    const previous = scrollNodeRef.current;
    if (previous !== null) {
      previous.removeEventListener("scrollend", sampleAtSettle);
      previous.removeEventListener("scroll", sampleAfterQuiet);
    }
    scrollNodeRef.current = node;
    if (node !== null) {
      const [type, listener] = "onscrollend" in node ? (["scrollend", sampleAtSettle] as const) : (["scroll", sampleAfterQuiet] as const);
      node.addEventListener(type, listener, { passive: true });
    }
  };

  useEffect(
    (): (() => void) => (): void => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  // Older pages change the loaded count, not the newest canon the reader has seen.
  const tailSeq = messages.at(-1)?.seq ?? 0;
  const [snapshot, setSnapshot] = useState(tailSeq);
  if (atTail && snapshot !== tailSeq) {
    setSnapshot(tailSeq);
  }

  const [unread, setUnread] = useState(0);
  const rawUnread = messages.filter((message) => message.seq > snapshot).length + (live ? 1 : 0);
  const count = atTail ? 0 : Math.max(unread, rawUnread);
  if (count !== unread) {
    setUnread(count);
  }

  const onJump = (): void => {
    // Imperative scroll only — a synchronous setAtTail here would re-render the surface into the
    // virtualizer and cancel the native smooth scroll mid-flight.
    listHandleRef.current?.scrollToEnd();
  };

  return { scrollContainerRef, atTail, count, visible: !atTail && count > 0, onJump };
}
