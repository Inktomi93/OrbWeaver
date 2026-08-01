// ASSUMES(single-replica): the socket cells are per-process in-memory transport state, exactly like the
// three live buses (`bus-channel.ts`) and `presence-registry.ts`. A second replica would need cells behind a
// shared store keyed the same way — nothing else about this module changes.
//
// The socket registry (SSE-1 §5.1/§5.4): which rooms a tab's ONE socket wants, surviving across the socket's
// own reconnects. The cell — not the live generator — is the durable half, which is what makes three
// otherwise-racy things simple:
//   • ORDER-INDEPENDENT CREATION. Whichever of `attach` / `connect` arrives first mints the cell. That kills
//     the attach-before-connect race by construction (no queue to drain, no window to lose an attach in) and
//     lets an instrument attach first and connect second.
//   • ATTACH→DETACH BEFORE CONNECT COLLAPSES TO NO ROOM. `cell.rooms` is the DESIRED STATE, not a command
//     log: attach writes the entry, detach deletes it, and a socket that connects afterwards re-hydrates from
//     whatever is left. (This is why there is no `AsyncQueue<Command>` — see the reconciliation note below.)
//   • RECONNECT IS SERVER-STICKY. tRPC's EventSource retries `stream.connect` with the SAME socketId; the
//     cell is still here with its per-room cursors, so the new generator resumes each room where the old one
//     stopped. The client does not re-attach for correctness (it does re-announce on the live edge — see
//     `room-registry.ts` — which is idempotent here).
//
// RECONCILIATION vs the spec's §5.1: the spec models pending work as a `commands: AsyncQueue<…>` drained by
// the live generator. There is nothing for such a queue to carry: while the socket is DARK the desired state
// IS `cell.rooms` (a queue would only re-derive it), and while the socket is LIVE the mutation can notify the
// generator SYNCHRONOUSLY, which preserves in-order application trivially. So the queue collapses to
// `cell.rooms` + one optional listener, with identical observable behavior.
//
// TRUST BOUNDARY (§4.1): `socketId` is CLIENT-MINTED and is NOT a capability. The cell records its owner and
// EVERY entry point takes the caller's `userId`; a mismatch is the repo's standard leak-free `NOT_FOUND`
// collapse — never a hijack, never a `FORBIDDEN` that would confirm the socket exists. (The spec describes
// the same property as a composite `${userId}:${socketId}` key; keying on `socketId` with an explicit owner
// gate is the same guarantee expressed as a TESTED refusal rather than a silently-forked second cell.)
//
// COMPOSED AT ENTRY, on the Context — the `presence-registry.ts` posture, not a module singleton like the
// three buses. Two reasons: the reap clock must be the INJECTED one (determinism — `no-raw-clock`), and a
// per-instance registry means a test drives an isolated socket world instead of a process-global one.
//
// REAPING IS LAZY, not a timer: every registry entry point sweeps cells that have been dark past the window.
// A `setInterval` in a transport module would keep the process alive and leak into every test; a dark cell is
// never READ after its window, so a sweep-on-touch is the same guarantee with no scheduler.

import type { StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import { DomainNotFoundError, DomainRateLimitError } from "@orb/kit/errors";
import type { SocketId, UserId } from "@orb/kit/ids";

/** Ratified hygiene bounds (§14.6). None is load-bearing; they exist so a client bug cannot grow the maps. */
export const SOCKET_REAP_MS = 60_000;
export const ROOMS_PER_SOCKET = 32;
export const SOCKETS_PER_USER = 8;

/** One attached room's desired state. `cursor` is the last DURABLE seq delivered (null for a live-only room)
 *  — the resume point a reconnect's pump starts from, and what a `roomLagged` frame carries. */
export interface SocketRoom {
  readonly ref: StreamRoomRef;
  cursor: number | null;
  /**
   * Has the CLIENT announced this room since the socket last went dark? The RECONNECT BARRIER reads it (see
   * `socket.ts`): a resumable room must not resume delivery on a reconnect until the client has said where
   * IT got to, because the server's cursor counts what it handed the dying socket's writer, which is ahead
   * of what the client received. Cleared on `goDark`, set by every `attach` — including one that lands while
   * the socket is still dark, so the barrier is order-independent exactly like cell creation is.
   */
  announced: boolean;
}

/** What a LIVE socket generator registers so room changes reach its pumps in order. */
export interface SocketListener {
  /** A room was added, or an existing room's cursor was REWOUND by a lower `sinceSeq` — start/restart its
   *  pump there. */
  readonly onAttach: (ref: StreamRoomRef, cursor: number | null) => void;
  /** An IDEMPOTENT re-attach of a room whose cursor did not move — the client saying "I still want this, and
   *  I am at (or ahead of) where you are". Carries no cursor change and must not restart a running pump; it
   *  exists so the reconnect barrier can lift on the announce that carries no rewind. */
  readonly onAnnounce: (ref: StreamRoomRef) => void;
  readonly onDetach: (ref: StreamRoomRef) => void;
}

export interface SocketCell {
  readonly socketId: SocketId;
  readonly userId: UserId;
  readonly rooms: Map<string, SocketRoom>;
  listener: SocketListener | null;
  live: boolean;
  /** Epoch-ms the socket went dark; `null` while live. The reap clock. */
  lastSeenAt: number | null;
}

export interface SocketRegistry {
  /** Create-or-adopt the cell for `(userId, socketId)`. Throws a leak-free `DomainNotFoundError` when the
   *  socket belongs to another principal, and `DomainRateLimitError` past the per-user socket cap. */
  readonly adopt: (userId: UserId, socketId: SocketId) => SocketCell;
  /** Record the room as wanted (idempotent). A LOWER `sinceSeq` on an already-attached room is honored — it
   *  is a REPLAY REQUEST; a higher one never rewinds the cursor forward. */
  readonly attach: (userId: UserId, socketId: SocketId, ref: StreamRoomRef, sinceSeq: number | null) => void;
  /** Drop the room (idempotent — detaching an unattached room is a no-op). */
  readonly detach: (userId: UserId, socketId: SocketId, ref: StreamRoomRef) => void;
  /** The live generator's lifecycle edges. `goLive` registers the listener; `goDark` starts the reap clock
   *  and LEAVES the rooms in place so a reconnect re-hydrates them. */
  readonly goLive: (cell: SocketCell, listener: SocketListener) => void;
  readonly goDark: (cell: SocketCell) => void;
  /** Observability (`/api/_debug/stream/sockets`): live sockets, all users or one. */
  readonly liveSocketCount: (userId?: UserId) => number;
  /** Sweep cells dark past the window. Called on every entry point; exposed for the reap test. */
  readonly reap: () => number;
}

export function createSocketRegistry(now: () => number): SocketRegistry {
  const cells = new Map<SocketId, SocketCell>();

  function reap(): number {
    const at = now();
    let removed = 0;
    for (const [socketId, cell] of cells) {
      if (!cell.live && cell.lastSeenAt !== null && at - cell.lastSeenAt >= SOCKET_REAP_MS) {
        cells.delete(socketId);
        removed += 1;
      }
    }
    return removed;
  }

  /** The owner gate — the ONE place a foreign socketId collapses. */
  function owned(userId: UserId, socketId: SocketId): SocketCell | undefined {
    const cell = cells.get(socketId);
    if (cell === undefined) {
      return;
    }
    if (cell.userId !== userId) {
      throw new DomainNotFoundError("socket", socketId);
    }
    return cell;
  }

  function adopt(userId: UserId, socketId: SocketId): SocketCell {
    reap();
    const existing = owned(userId, socketId);
    if (existing !== undefined) {
      return existing;
    }
    // The per-user cap counts the caller's cells only (reaping already dropped the expired ones). The 9th
    // socket is refused rather than evicting a live one — a live socket is a real tab with real rooms.
    let mine = 0;
    for (const cell of cells.values()) {
      if (cell.userId === userId) {
        mine += 1;
      }
    }
    if (mine >= SOCKETS_PER_USER) {
      throw new DomainRateLimitError(`Too many open streams (${SOCKETS_PER_USER}). Close a tab and retry.`);
    }
    const cell: SocketCell = { socketId, userId, rooms: new Map(), listener: null, live: false, lastSeenAt: now() };
    cells.set(socketId, cell);
    return cell;
  }

  function attach(userId: UserId, socketId: SocketId, ref: StreamRoomRef, sinceSeq: number | null): void {
    const cell = adopt(userId, socketId);
    const key = roomKey(ref);
    const room = cell.rooms.get(key);
    if (room === undefined) {
      if (cell.rooms.size >= ROOMS_PER_SOCKET) {
        throw new DomainRateLimitError(`Too many attached rooms on one stream (${ROOMS_PER_SOCKET}).`);
      }
      cell.rooms.set(key, { ref, cursor: sinceSeq, announced: true });
      cell.listener?.onAttach(ref, sinceSeq);
      return;
    }
    // The client has spoken for this room on this connection — the reconnect barrier's lift signal, recorded
    // whether or not the socket is live yet (an announce can beat `connect`, exactly like an attach can).
    room.announced = true;
    // Idempotent re-attach. Only a LOWER cursor means anything (replay-from-here); anything else leaves the
    // live pump exactly where it is — a re-announce must never skip a room forward past undelivered rows.
    if (sinceSeq !== null && (room.cursor === null || sinceSeq < room.cursor)) {
      room.cursor = sinceSeq;
      cell.listener?.onAttach(ref, sinceSeq);
      return;
    }
    cell.listener?.onAnnounce(ref);
  }

  function detach(userId: UserId, socketId: SocketId, ref: StreamRoomRef): void {
    reap();
    const cell = owned(userId, socketId);
    const key = roomKey(ref);
    if (cell === undefined || !cell.rooms.delete(key)) {
      return;
    }
    cell.listener?.onDetach(ref);
  }

  return {
    adopt,
    attach,
    detach,
    goLive: (cell, listener): void => {
      cell.live = true;
      cell.lastSeenAt = null;
      cell.listener = listener;
    },
    goDark: (cell): void => {
      cell.live = false;
      cell.listener = null;
      cell.lastSeenAt = now();
      // Re-arm the reconnect barrier: the next connection must hear from the client before a resumable room
      // resumes delivery (the server's cursor counts what it handed a writer, not what arrived).
      for (const room of cell.rooms.values()) {
        room.announced = false;
      }
    },
    liveSocketCount: (userId?: UserId): number => {
      reap();
      let count = 0;
      for (const cell of cells.values()) {
        if (cell.live && (userId === undefined || cell.userId === userId)) {
          count += 1;
        }
      }
      return count;
    },
    reap,
  };
}
