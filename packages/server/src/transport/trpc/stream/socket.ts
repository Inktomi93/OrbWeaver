// `runSocket` — the ONE socket generator (SSE-1 §5.2). Given a cell the RESOLVER already adopted, it
// re-hydrates a pump per already-attached room, follows room changes while live, merges every pump into ONE
// bounded queue, and yields the wire envelopes. This is the only place in `stream/` that touches more than
// one room at a time.
//
// THE SETUP SLICE IS ATOMIC BY CONSTRUCTION. An async generator's body does not start until the first
// `next()`, and everything up to its first `await` runs in one uninterrupted task. `attach`/`detach` arrive
// on OTHER tasks (batched HTTP mutations), so starting the re-hydration pumps and registering the room
// listener in that pre-await slice is what makes "an attach cannot land in the gap" true without a lock.
// (The ADOPT is deliberately NOT here — a refusal has to happen while the subscription can still be
// rejected; see `routers/stream.ts`.)
//
// PER-ROOM FAULT ISOLATION — the property that does not exist today. A pump that throws yields a
// `roomFailed` control frame and detaches THAT room; the socket keeps delivering every other room. Today the
// same throw ends the whole stream (`withSubscriptionErrors` yields a terminal frame and returns), which
// under one socket would be a total freshness blackout. `withSubscriptionErrors` still wraps THIS generator,
// for a genuine socket-level fault.
//
// THE ROOM CURSOR COUNTS DELIVERED FRAMES, NEVER ENQUEUED ONES. It advances in the DRAIN loop, as each
// frame is yielded — not in the pump that produced it. An enqueued-but-undelivered frame (shed by a `lag`
// overflow, or still queued when the socket dies) must stay AHEAD of the cursor: rows behind it are never
// re-offered by any replay, so counting them at enqueue would lose them permanently — including a turn
// TERMINAL, which strands the client's slot forever (the stuck-"Stop generating" class). Pre-fold this was
// free: the resume cursor was the tRPC client's own `Last-Event-ID`, i.e. exactly what it had received.
//
// A SHED PAUSES THE ROOM, AND DELIVERING THE NOTICE RESUMES IT. `lag` overflow drops a room's pending tail,
// and the shedding pump's own high-water mark has already passed those rows — nothing would ever re-offer
// them. So the queue calls back (`onShed`) and the socket PAUSES that room's pump; when the `roomLagged`
// frame is actually DELIVERED — proof the consumer is draining again — the room restarts from its
// last-delivered cursor, re-running the room source's attach synthesis + durable replay, which refills the
// gap with the identical per-viewer verdict. Restarting at shed time instead would just re-flood a queue
// nobody is draining and shed again (silently, since a repeat notice collapses), losing the whole middle of
// the log; pausing is the backpressure, and the notice's delivery is the only honest resume signal. The
// client needs no cooperation for any of it, which is what makes it reliable — a client re-attach at the
// announced cursor would be a no-op under the idempotent-attach rule.
//
// THE TRACKED ID IS AN ORDINAL (§3.3): a per-socket counter, never a cursor. It exists only because
// `withSubscriptionErrors` requires uniform tracked envelopes (a mix breaks the client's discriminant
// narrowing). `Last-Event-ID` on connect is deliberately IGNORED — one SSE stream has one resume id and this
// socket carries N independent cursors; the resume truth is the per-room cursor in the cell.

import { randomUUID } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import type { StreamErrorCode, StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey, STREAM_ERROR_CODES } from "@orb/contracts/stream";
import type { SocketId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { getLog, superviseDetached } from "#foundation/observability";
import type { Services } from "../context.ts";
import { classifyDomainError } from "../error-mapping.ts";
import { createFrameQueue } from "./frame-queue.ts";
import { roomSourceFor } from "./room-sources.ts";
import type { SocketCell, SocketListener, SocketRegistry, SocketRoom } from "./socket-registry.ts";

/** The one message an INTERNAL_SERVER_ERROR room frame ever carries. Mirrors the procedure path's
 *  `UNCLASSIFIED_FAULT_MESSAGE` (`trpc.ts`) in a different voice because a ROOM dying is a different event
 *  to a reader than a call failing. */
const ROOM_FAULT_MESSAGE = "The room stopped unexpectedly.";

/** What a room's fault becomes on the wire. A CLASSIFIED error keeps its code + message (the same
 *  typed-terminal-frame contract `withSubscriptionErrors` gives a whole stream); anything else is a
 *  genuine bug and collapses to a generic INTERNAL_SERVER_ERROR — internals never reach a subscriber. */
function roomFailure(err: unknown): { readonly code: StreamErrorCode; readonly message: string } {
  const mapped = classifyDomainError(err);
  if (mapped === null) {
    return { code: "INTERNAL_SERVER_ERROR", message: ROOM_FAULT_MESSAGE };
  }
  // `@orb/contracts` cannot depend on `@trpc/server`, so the wide tRPC code union narrows onto our closed
  // vocabulary HERE — the one mapper seam. The classifier is kept inside that vocabulary by its own
  // header, so a miss means the two drifted.
  //
  // A MISS TAKES THE COLLAPSED MESSAGE TOO, and that is the whole point of this arm rather than a bare
  // `?? "INTERNAL_SERVER_ERROR"`: the frame would otherwise say INTERNAL_SERVER_ERROR while carrying a
  // classified error's real text, which is exactly the "a 500 must never carry a real message" rule the
  // procedure path enforces at its formatter. Code and message move together or not at all.
  const code = STREAM_ERROR_CODES.find((known) => known === mapped.code);
  return code === undefined ? { code: "INTERNAL_SERVER_ERROR", message: ROOM_FAULT_MESSAGE } : { code, message: mapped.message };
}

export interface RunSocketArgs {
  readonly registry: SocketRegistry;
  /** ALREADY ADOPTED by the resolver — so a cross-principal socketId is a real NOT_FOUND rejection of the
   *  subscription rather than a typed frame the client would have to interpret (an async generator's body
   *  does not run until the first pull, which is far too late to refuse a connection). */
  readonly cell: SocketCell;
  readonly principal: Principal;
  readonly services: Services;
  /** The request's multi-human capability — part of every room's `RoomArgs` (a room whose surface is
   *  multi-human-only owns that belt on its attach; see `room-source.ts`). */
  readonly multiHumanCapable: boolean;
  readonly signal: AbortSignal;
}

export async function* runSocket(args: RunSocketArgs): AsyncGenerator<TrackedEnvelope<StreamFrame>> {
  const { registry, cell, principal, services, multiHumanCapable, signal } = args;
  const socketId: SocketId = cell.socketId;
  const queue = createFrameQueue({
    cursorFor: (key) => cell.rooms.get(key)?.cursor ?? null,
    // A `lag` shed heals HERE, server-side (see the header): the shed PAUSES the room; delivering the
    // `roomLagged` frame restarts it from the last-DELIVERED cursor, so the durable replay refills exactly
    // what was shed. Nothing else can — the shedding pump's high-water mark has already passed those rows.
    onShed: (ref) => pausePump(ref),
  });
  const pumps = new Map<string, AbortController>();

  async function pumpRoom(ref: StreamRoomRef, cursor: number | null, control: AbortController): Promise<void> {
    // @orb-waive caught-failure-ownership(err): documented below — a non-abort failure is
    // logged, pushed as a "roomFailed" control frame to the subscriber, and the room detaches. Ends if any
    // of those three consumption steps is removed.
    try {
      const source = roomSourceFor(ref);
      for await (const frame of source.run({ ref, principal, services, multiHumanCapable, cursor, signal: control.signal })) {
        if (control.signal.aborted) {
          return;
        }
        queue.push(ref, frame);
      }
    } catch (err) {
      if (control.signal.aborted) {
        return; // teardown (detach / socket close), not a fault
      }
      const failure = roomFailure(err);
      getLog().warn({ err, channel: ref.channel, userId: principal.userId }, "stream: room pump failed");
      queue.pushControl({ channel: "control", type: "roomFailed", ref, ...failure });
      registry.detach(principal.userId, socketId, ref);
    }
  }

  /**
   * The room cursor advances at DELIVERY — when the frame is actually yielded to the subscriber — never at
   * enqueue. The distinction is the whole resume contract: a frame that is enqueued and then SHED (a `lag`
   * overflow) or left queued when the socket dies must stay AHEAD of the cursor, or the reconnect/heal
   * replay resumes past it and the row is lost for good (rows behind the cursor are never re-offered). Pre-
   * fold this was free — the resume cursor WAS the client's `Last-Event-ID`, i.e. what it had received.
   * A control frame carries no room cursor; a live-only room's frames carry no `seq`.
   */
  function advanceCursorOnDelivery(frame: StreamFrame): void {
    if (frame.channel === "control" || !("seq" in frame)) {
      return;
    }
    const room = cell.rooms.get(roomKey(frame));
    if (room !== undefined) {
      room.cursor = frame.seq;
    }
  }

  /** Stop producing into a saturated queue — the shed's backpressure. No `detached` frame: the room is
   *  still attached and its desired state is untouched; only its pump is parked until the notice lands.
   *  Fires on EVERY shed, including one whose notice collapsed into a pending one (`frame-queue.ts`): the
   *  park is what stops the burn, and rate-limiting it would leave a room producing into a full queue. */
  function pausePump(ref: StreamRoomRef): void {
    const key = roomKey(ref);
    pumps.get(key)?.abort();
    pumps.delete(key);
  }

  /**
   * Re-run a room's pump from its last-DELIVERED cursor — fired when a `roomLagged` frame is actually
   * delivered. UNCONDITIONAL for an attached room, deliberately: an earlier version skipped when a pump was
   * already running (a re-attach having beaten the notice out), which left the rows shed BETWEEN that
   * re-attach and the notice's delivery with nothing to refill them — the running pump's own high-water mark
   * had passed them, and the resume that would have re-read them no-op'd. Restarting from the delivered
   * cursor is always correct and at worst re-offers rows the client already has (its seq guard drops them).
   * A no-op only for a room that is no longer attached (a detach/fault raced the shed).
   */
  function resumeAfterLag(ref: StreamRoomRef): void {
    const room = cell.rooms.get(roomKey(ref));
    if (room !== undefined) {
      startPump(room.ref, room.cursor);
    }
  }

  /**
   * THE RECONNECT BARRIER. A resumable room does not resume delivery on a reconnect until the CLIENT has
   * announced it on this connection. Why it has to be the server's job: the cell's cursor counts frames
   * handed to the PREVIOUS socket's writer, so it sits ahead of what the client actually received, and a
   * pump resumed from it delivers rows the client never asked for — whose seqs then advance the client's own
   * high-water mark PAST the gap, so the rewind attach that follows (carrying the client's true mark) has
   * its whole replay dropped by that guard. It is not a race the client can win: announcing earlier carries
   * a stale mark, announcing later has already lost the gap. Withholding the room for one round trip makes
   * the client's mark the resume truth again — what `Last-Event-ID` did for free before the fold.
   * A LIVE-ONLY room never waits: it has no cursor to be wrong about, and its freshness heal is a blanket
   * invalidate that the delay would only postpone.
   */
  function startOrHoldPump(room: SocketRoom): void {
    if (room.announcedFor === cell.connectionSeq || !roomSourceFor(room.ref).resumable) {
      startPump(room.ref, room.cursor);
    }
  }

  function startPump(ref: StreamRoomRef, cursor: number | null): void {
    const key = roomKey(ref);
    pumps.get(key)?.abort();
    const control = new AbortController();
    pumps.set(key, control);
    queue.pushControl({ channel: "control", type: "attached", ref });
    superviseDetached(`stream-room:${socketId}:${key}:${randomUUID()}`, "stream.room.pump", { channel: ref.channel, userId: principal.userId }, () =>
      pumpRoom(ref, cursor, control),
    );
  }

  /** An idempotent re-announce (no cursor change) — the barrier's lift signal. A room already pumping is
   *  untouched: the announce carries nothing new, and restarting would re-replay for no reason. */
  function liftBarrier(ref: StreamRoomRef): void {
    const key = roomKey(ref);
    const room = cell.rooms.get(key);
    if (room !== undefined && !pumps.has(key)) {
      startPump(room.ref, room.cursor);
    }
  }

  function stopPump(ref: StreamRoomRef): void {
    const key = roomKey(ref);
    pumps.get(key)?.abort();
    pumps.delete(key);
    queue.pushControl({ channel: "control", type: "detached", ref });
  }

  function teardown(): void {
    for (const control of pumps.values()) {
      control.abort();
    }
    pumps.clear();
    queue.close();
  }

  // ── the atomic setup slice (no `await` until the drain loop) ──────────────────────────────────────────
  // The listener object IS this generator's identity on the cell: `goLive` evicts whoever held it before,
  // and every shared-state write below is gated on still being the holder.
  const listener: SocketListener = { onAttach: startPump, onAnnounce: liftBarrier, onDetach: stopPump, onEvicted: teardown };
  registry.goLive(cell, listener);
  for (const room of cell.rooms.values()) {
    startOrHoldPump(room);
  }
  signal.addEventListener("abort", teardown, { once: true });

  /** Is this generator still the cell's owner? A socket the server has not yet noticed is dead can be
   *  superseded at any moment (§8's half-open class), and everything it writes after that belongs to
   *  someone else's connection. */
  const owns = (): boolean => cell.listener === listener;

  let ordinal = 0;
  try {
    for await (const frame of queue.drain()) {
      // Evicted mid-drain: the frames already buffered still go out to this (dead) socket, but they must not
      // touch the CELL — the cursor and the room lifecycle now belong to the connection that took over.
      if (owns()) {
        // DELIVERY, not enqueue (see `advanceCursorOnDelivery`) — and BEFORE the yield, because the yield is
        // where this generator parks: a cursor written after it would not exist for a frame the consumer
        // pulled and then dropped the socket on.
        advanceCursorOnDelivery(frame);
        if (frame.channel === "control" && frame.type === "roomLagged") {
          // The consumer is draining again — resume the room the shed parked, from what it has now received.
          resumeAfterLag(frame.ref);
        }
      }
      ordinal += 1;
      yield tracked(String(ordinal), frame);
    }
  } finally {
    // Reached on client-gone, server shutdown, eviction by a successor, AND the consumer's `.return()`. The
    // room set is LEFT IN PLACE for the reap window — that is what makes a reconnect server-sticky — and
    // `goDark` no-ops unless this generator is still the owner, so a late teardown cannot dark a live cell.
    signal.removeEventListener("abort", teardown);
    teardown();
    registry.goDark(cell, listener);
  }
}
