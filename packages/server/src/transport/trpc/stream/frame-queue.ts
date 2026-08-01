// The ONE bounded merge queue behind a multiplexed socket (SSE-1 §7). Every attached room's pump pushes
// here; the socket generator drains it and stamps the wire ordinal. Bounded because one socket is one
// consumer for N producers — a slow client (or a background tab) accumulates on THIS side, not upstream
// (each pump's `on(emitter, …)` still buffers exactly as it does today; this spec bounds the socket half).
//
// OVERFLOW IS NEVER A SILENT DROP. Each channel's policy is derived from that channel's EXISTING healing
// story, and both policies ANNOUNCE:
//   • `lag`      — drop the room's pending live tail, emit `roomLagged{cursor}`, KEEP the room attached, and
//                  tell the socket to RESTART that room's pump from the shed room's last-delivered cursor
//                  (`onShed`). Legal only for a DURABLE room, and the restart is what makes it legal: the
//                  pump's own high-water mark has already passed the shed rows, so nothing but a replay from
//                  the delivered cursor can refill them — with the identical per-viewer verdict.
//   • `collapse` — keep at most ONE pending frame per (room, event type), newest payload wins, FIFO position
//                  preserved. Legal only for a channel whose client handler is a pure INVALIDATION trigger
//                  (N identical `chatsChanged` invalidate exactly like 1). A channel that carries CONTENT
//                  must pick `lag`.
// That "pure invalidation trigger" property is not expressible to tsc, so it lives as a documented row in a
// total `Record<StreamChannel, OverflowPolicy>` plus a unit test per policy.
//
// CONTROL FRAMES ARE NEVER DROPPED and never wait behind a full queue — a room's degradation notice is
// exactly what a saturated socket must still deliver, and it is what an UNRELATED room's client is waiting
// on. Repeat `roomLagged` for a room already announcing one collapses (one notice per burst), so the
// control lane cannot grow with the flood that triggered it.

import type { StreamChannel, StreamControlFrame, StreamDataFrame, StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";

/** Ratified hygiene bound (§14.6). Not load-bearing — it is the point where a room starts announcing that
 *  the client should heal instead of the socket growing without limit. */
export const FRAME_QUEUE_CAPACITY = 512;

/** File-local by design: a transport-internal policy label has no cross-boundary consumer, and an exported
 *  type outside a `contract/` home is `no-inline-types` RED. The TABLE below is the exported surface. */
type OverflowPolicy = "lag" | "collapse";

/** Per-channel overflow policy — total over ROOMS (control is not a room channel). Each row cites the
 *  property that makes it safe; see the file header for why `collapse` is not universally legal. */
export const OVERFLOW_POLICIES: Record<StreamChannel, OverflowPolicy> = {
  /** every member is a coarse invalidation trigger (`data/invalidation.ts` USER map) */
  user: "collapse",
  /** durable inbox + `collectSince` replay */
  notifications: "lag",
  /** durable chat log + `replayChatEvents` — carries CONTENT, so never collapse */
  chat: "lag",
  /** `RPG_BUS_FILTERS` are path invalidations */
  rpg: "collapse",
  /** ephemeral chips by design — no durable row */
  automation: "collapse",
  /** the durable `progress` COLUMN is the truth a `workloads.list` read re-renders (D117 (10)) — a live frame
   *  is a redraw trigger, and a progress snapshot is absolute, so the newest of a type is the whole story */
  workloads: "collapse",
};

interface QueuedFrame {
  /** `roomKey(ref)` for a data frame; `null` for a control frame (never room-dropped). */
  readonly key: string | null;
  /** The (room, type) identity a `collapse` push replaces; `null` when the policy is `lag`. */
  readonly collapseKey: string | null;
  readonly frame: StreamFrame;
}

export interface FrameQueueOptions {
  /** The room's last DELIVERED durable seq (`null` for a live-only room) — what a `roomLagged` carries. */
  readonly cursorFor: (key: string) => number | null;
  /**
   * A room just SHED frames (a `lag` overflow). The socket heals by restarting that room's pump from the
   * room's (last-delivered) cursor, so the durable replay refills exactly what was shed — without this the
   * shed rows are gone for good: the pump's own high-water mark has already passed them, and nothing else
   * ever re-offers them. Fired once per emitted lag NOTICE, and a notice collapses while one is still
   * pending, so the restart rate is bounded by the drain rate (a permanently-stalled consumer cannot
   * thrash it).
   */
  readonly onShed?: ((ref: StreamRoomRef) => void) | undefined;
  readonly capacity?: number;
}

export interface FrameQueue {
  /** Enqueue one room DATA frame under its channel's overflow policy. */
  readonly push: (ref: StreamRoomRef, frame: StreamDataFrame) => void;
  /** Enqueue a control frame — admitted regardless of capacity (see the header). */
  readonly pushControl: (frame: StreamControlFrame) => void;
  /** End the stream: the drain loop finishes once the buffer empties. */
  readonly close: () => void;
  /** Pending frame count — the backpressure probe the tests assert on. */
  readonly size: () => number;
  /** The single consumer. One socket generator per queue. */
  readonly drain: () => AsyncGenerator<StreamFrame>;
}

/** The (room, type) identity a collapse push replaces. Every non-notifications arm nests a bus event with
 *  its own `type`; notifications is a `lag` channel, so its key is never consulted. */
function collapseKeyOf(frame: StreamDataFrame): string {
  return frame.channel === "notifications" ? `seq:${frame.seq}` : frame.event.type;
}

function isPendingLagFor(item: QueuedFrame, key: string): boolean {
  const { frame } = item;
  return frame.channel === "control" && frame.type === "roomLagged" && roomKey(frame.ref) === key;
}

/**
 * Build a socket's frame queue. `cursorFor` reads the room's last delivered DURABLE seq (`null` for a
 * live-only room) — it is what a `roomLagged` frame carries so the client resumes at the right place; the
 * queue never reads a frame's payload beyond the routing fields (the byte-blind rule, §4.3).
 */
export function createFrameQueue(opts: FrameQueueOptions): FrameQueue {
  const capacity = opts.capacity ?? FRAME_QUEUE_CAPACITY;
  const items: QueuedFrame[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  function bump(): void {
    const w = wake;
    wake = null;
    w?.();
  }

  function pushControl(frame: StreamControlFrame): void {
    if (closed) {
      return;
    }
    if (frame.type === "roomLagged") {
      const key = roomKey(frame.ref);
      if (items.some((item) => isPendingLagFor(item, key))) {
        return; // one lag notice per burst — the flood must not grow the control lane
      }
    }
    items.push({ key: null, collapseKey: null, frame });
    bump();
  }

  /** Announce the shed AND ask the socket to heal it. The notice carries the room's last DELIVERED cursor,
   *  which is also where the healing pump restarts — one number, one meaning. `pushControl` collapses a
   *  repeat notice while one is pending, so a burst heals once. */
  function announceLag(ref: StreamRoomRef, key: string): void {
    // The PARK fires on EVERY shed; only the NOTICE is rate-limited. Skipping the park while a notice is
    // still pending would leave the room producing into a queue nobody is draining, shedding its own output
    // on every push — and it was the shape of a real hole: rows shed in that window had no resume to refill
    // them once the pump had been restarted by something else (a re-attach).
    opts.onShed?.(ref);
    pushControl({ channel: "control", type: "roomLagged", ref, cursor: opts.cursorFor(key) });
  }

  /** `collapse`: at most ONE pending frame per (room, type). Newest payload wins, FIFO position kept. */
  function pushCollapsing(ref: StreamRoomRef, key: string, frame: StreamDataFrame): void {
    const collapseKey = collapseKeyOf(frame);
    const at = items.findIndex((item) => item.key === key && item.collapseKey === collapseKey);
    if (at !== -1) {
      items[at] = { key, collapseKey, frame };
      return;
    }
    if (items.length >= capacity) {
      announceLag(ref, key);
      return;
    }
    items.push({ key, collapseKey, frame });
    bump();
  }

  /** `lag`: on overflow shed THIS room's pending tail (never another room's), announce, keep the room. */
  function pushLagging(ref: StreamRoomRef, key: string, frame: StreamDataFrame): void {
    if (items.length < capacity) {
      items.push({ key, collapseKey: null, frame });
      bump();
      return;
    }
    const kept = items.filter((item) => item.key !== key);
    items.length = 0;
    items.push(...kept);
    announceLag(ref, key);
  }

  function push(ref: StreamRoomRef, frame: StreamDataFrame): void {
    if (closed) {
      return;
    }
    const key = roomKey(ref);
    if (OVERFLOW_POLICIES[ref.channel] === "collapse") {
      pushCollapsing(ref, key, frame);
      return;
    }
    pushLagging(ref, key, frame);
  }

  /** Park until `bump()` — the ONE await in the drain loop. Declared outside it so the resolver capture is
   *  not a closure over a loop variable. */
  function nextTick(): Promise<void> {
    return new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  // Drains while the queue is open, and keeps draining after `close()` until the buffer empties — a socket
  // that is shutting down still owes its subscriber the frames it already accepted.
  async function* drain(): AsyncGenerator<StreamFrame> {
    while (!closed || items.length > 0) {
      const item = items.shift();
      if (item === undefined) {
        // biome-ignore lint/performance/noAwaitInLoops: the drain loop IS a wait-for-the-next-frame loop — the `await` is the wait, and hoisting it out would need unbounded promise recursion on a long-lived socket.
        await nextTick();
        continue;
      }
      yield item.frame;
    }
  }

  return {
    push,
    pushControl,
    close: (): void => {
      closed = true;
      bump();
    },
    size: (): number => items.length,
    drain,
  };
}
