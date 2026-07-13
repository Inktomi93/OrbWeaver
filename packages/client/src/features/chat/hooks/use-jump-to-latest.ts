// `useJumpToLatest` — the state behind the floating "jump to latest" pill. It answers two questions
// the pill needs, and the WHOLE point is WHERE it gets the first one:
//
//   1. "Is the reader actually at the tail RIGHT NOW?" — read from the scroll node's REAL geometry
//      (`scrollHeight - scrollTop - clientHeight`), NOT the seal's follow-INTENT signal. Intent and
//      position desync the instant virtual-core writes `scrollTop` itself during a re-measure: the
//      intent boolean would report "at tail" while the reader is stranded 9,600px up (P0 2026-07-13).
//      Geometry is the truth. It is sampled at SETTLE (debounced ~90ms after scrolling stops), so the
//      transient drift virtual-core introduces mid-cascade is already corrected by the seal's re-pin
//      before we read — no flash on a pinned send, no false "caught up" for a history reader (a send
//      at `scrollTop=0` fires no scroll event at all, so the last-settled "not at tail" correctly
//      persists).
//   2. "How many messages landed below since I scrolled away?" — canon growth (`messagesCount` delta
//      from a snapshot taken while at the tail) plus `+1` for a live turn (a streaming reply shows
//      immediately). `messagesCount` (a tanstack query) and `live` (the turn-phase store) update in
//      SEPARATE commits, so on turn-settle `live` can flip false a commit BEFORE the committed reply
//      grows `messagesCount` — the raw formula then momentarily reads 0 and the pill self-hides over a
//      genuinely-unread reply (P0 2026-07-13). Content below an away reader is strictly MONOTONIC, so
//      the count is LATCHED to its running max while away and reset only on return: one atomic value,
//      no cross-source commit race to observe. NOT the new-arrivals fresh-keys, which MUTE the
//      ghost→committed settle and so undercount replies.
//
// The pill is shown iff the reader is away from the tail AND ≥1 message is below. `onJump` fires ONLY
// the handle's imperative `scrollToEnd` (which also re-enables the seal's follow); it does NOT flip
// at-tail synchronously — a state update in the same tick re-renders the surface into the virtualizer
// and CANCELS the in-flight native smooth scroll (P0 2026-07-13). at-tail instead updates from the
// geometry-at-settle sample once the scroll arrives, which then hides the pill and resets the latch.

import type { MessageListHandle } from "@orb/ui/message-list";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Within this many px of the true end still counts as "at the tail" (mirrors the seal's own tail
 *  threshold). Read at settle, so it's the real resting distance — no drift to absorb. */
const AT_TAIL_THRESHOLD_PX = 80;

/** Debounce (ms) after the last scroll event before sampling position — long enough for a re-measure
 *  drift cascade + the seal's re-pin to settle, short enough to feel responsive. */
const SETTLE_DEBOUNCE_MS = 90;

export interface UseJumpToLatestArgs {
  /** The committed message count (canon) — the count's growth source. */
  readonly messagesCount: number;
  /** Whether a turn is live (a streaming reply below the fold counts as one incoming message). */
  readonly live: boolean;
  /** The seal's imperative handle — `scrollToEnd` on jump. */
  readonly listHandleRef: RefObject<MessageListHandle | null>;
}

export interface JumpToLatestState {
  /** Attach to `<MessageList scrollContainerRef>` — the real scroll node this hook samples. */
  readonly scrollContainerRef: (node: HTMLDivElement | null) => void;
  /** Whether the reader is at/near the tail (settle-sampled geometry). */
  readonly atTail: boolean;
  /** New messages below the fold since the reader scrolled away (0 while at the tail). */
  readonly count: number;
  /** Show the pill — away from the tail AND ≥1 below. */
  readonly visible: boolean;
  /** Jump to the tail (also re-enables follow) and hide the pill. */
  readonly onJump: () => void;
}

export function useJumpToLatest({
  messagesCount,
  live,
  listHandleRef,
}: UseJumpToLatestArgs): JumpToLatestState {
  // Position truth. Starts at the tail (a chat opens bottom-anchored).
  const [atTail, setAtTail] = useState(true);
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced settle sampler: on the last scroll of a cascade, read the resting geometry.
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

  // Attach the scroll listener to the seal's real scroll node; swap cleanly on a node change.
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

  // The count. `snapshot` = the canon count last seen while at the tail (setState-during-render, the
  // compiler-clean "adjust state on prop change"), frozen while the reader is away so the delta counts
  // only what arrived below them.
  const [snapshot, setSnapshot] = useState(messagesCount);
  if (atTail && snapshot !== messagesCount) {
    setSnapshot(messagesCount);
  }

  // The unread count, LATCHED to its running max while away from the tail and reset to 0 the instant
  // the reader reaches it. The raw formula (`messagesCount` delta + a live `+1`) is CORRECT in every
  // steady state, but it reads across two independently-timed sources — canon growth (query) and the
  // live flag (turn-phase store) — that commit in different renders, so at turn-settle it dips through
  // 0 before the committed reply lands (see header). Content below an away reader only grows until they
  // return, so `max(previous, raw)` bridges that dip with no false hide, and a genuine second arrival
  // still raises the max. Reset happens through the `atTail ? 0` branch (setState-during-render).
  const [unread, setUnread] = useState(0);
  const rawUnread = Math.max(0, messagesCount - snapshot) + (live ? 1 : 0);
  const count = atTail ? 0 : Math.max(unread, rawUnread);
  if (count !== unread) {
    setUnread(count);
  }

  const onJump = useCallback((): void => {
    // Imperative scroll ONLY — at-tail updates from the geometry-at-settle sample once the scroll
    // arrives. A synchronous `setAtTail(true)` here re-renders the surface (new `items`/`renderItem`
    // refs) into the virtualizer and cancels the native smooth scroll mid-flight (P0 2026-07-13).
    listHandleRef.current?.scrollToEnd();
  }, [listHandleRef]);

  return { scrollContainerRef, atTail, count, visible: !atTail && count > 0, onJump };
}
