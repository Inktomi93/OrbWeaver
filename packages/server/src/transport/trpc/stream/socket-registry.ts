// ASSUMES(single-replica): the socket cells are per-process in-memory transport state, exactly like the
// three live buses (`bus-channel.ts`) and `presence-registry.ts`. A second replica would need cells behind a
// shared store keyed the same way — nothing else about this module changes.
//
// The socket registry: which rooms a tab's ONE socket wants, surviving across the socket's
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
// RECONCILIATION: an earlier design modeled pending work as a `commands: AsyncQueue<…>` drained by
// the live generator. There is nothing for such a queue to carry: while the socket is DARK the desired state
// IS `cell.rooms` (a queue would only re-derive it), and while the socket is LIVE the mutation can notify the
// generator SYNCHRONOUSLY, which preserves in-order application trivially. So the queue collapses to
// `cell.rooms` + one optional listener, with identical observable behavior.
//
// TRUST BOUNDARY: `socketId` is CLIENT-MINTED and is NOT a capability. The cell records its owner and
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
//
// THE CELL IS SINGLE-OWNER, AND OWNERSHIP TRANSFERS AT `goLive` — NOT at the predecessor's death. A server
// learns a socket died when a write to it fails: on a clean close that is immediate, but on a HALF-OPEN TCP
// (NAT rebind, sleep/wake, a silently-dead proxy — the whole motivating class for this module) the writes buffer in the
// kernel and the error surfaces after the retransmission timeout, minutes later. The client meanwhile
// reconnects at 45s (`reconnectAfterInactivityMs`), so two generators legitimately overlap on one cell. Three
// things follow, and all three are properties of THIS module:
//   • `connectionSeq` — bumped by `goLive`, and the epoch a room's announce is recorded against. That makes
//     the reconnect barrier (`socket.ts`) per-CONNECTION rather than per-teardown: the new generator holds a
//     resumable room because the room was announced under the PREVIOUS epoch, with no dependence on the
//     zombie dying on time.
//   • EVICTION — `goLive` tells the outgoing generator to stop (`onEvicted`) before installing the new one,
//     so a zombie cannot keep pumping into a dead socket (and advancing shared cursors with it).
//   • EVICTION IS ALSO THE CREDENTIAL EDGE. A socket freezes
//     its Principal at connect and lives for the connection's lifetime, so before this NOTHING server-side
//     killed a live stream when its session was revoked: a logged-out or disabled tab kept receiving events
//     until the socket died of natural causes. `evictSession` (logout — per-SESSION) and `evictUser`
//     (admin revoke-all / disable / back-channel logout) reuse the SAME `onEvicted` signal the takeover path
//     uses, composed at ENTRY (the cake holds: `domain/sessions` never imports transport).
//   • OWNERSHIP-CHECKED TEARDOWN — `goDark` takes the listener that is finishing and no-ops unless it is
//     still the owner. Without it a zombie's late teardown nulls the LIVE generator's listener (silent rooms
//     on a live socket), marks a live cell dark (reap-eligible, cursors discarded), and undercounts
//     `liveSocketCount` (the `/api/_debug` starvation pin).

import type { StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import { DomainNotFoundError, DomainRateLimitError } from "@orb/kit/errors";
import type { SessionId, SocketId, UserId } from "@orb/kit/ids";

/** Ratified hygiene bounds. None is load-bearing; they exist so a client bug cannot grow the maps. */
export const SOCKET_REAP_MS = 60_000;
export const ROOMS_PER_SOCKET = 32;
export const SOCKETS_PER_USER = 8;

/** One attached room's desired state. `cursor` is the last DURABLE seq delivered (null for a live-only room)
 *  — the resume point a reconnect's pump starts from, and what a `roomLagged` frame carries. */
export interface SocketRoom {
  readonly ref: StreamRoomRef;
  cursor: number | null;
  /**
   * WHICH CONNECTION the client announced this room for — the RECONNECT BARRIER's state (`socket.ts`). A
   * resumable room must not resume delivery on a reconnect until the client has said where IT got to,
   * because the server's cursor counts what it handed the dying socket's writer, which is ahead of what the
   * client received.
   *
   * An epoch rather than a boolean, because the barrier cannot depend on the previous generator's teardown
   * running on time (a half-open TCP defers it for minutes while the client is already back). An attach
   * during a LIVE connection counts for that connection; an attach while the cell is DARK counts for the
   * NEXT one, which is what keeps the announce order-independent against `connect` exactly like the attach
   * that mints the cell.
   */
  announcedFor: number;
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
  /** A NEW generator took the cell over: stop producing. Called synchronously by `goLive` on the OUTGOING
   *  listener, so a socket the server has not yet noticed is dead cannot keep pumping into it. */
  readonly onEvicted: () => void;
}

export interface SocketCell {
  readonly socketId: SocketId;
  readonly userId: UserId;
  /**
   * WHICH SESSION the current connection authenticated with — `null` for a caller with no cookie session at
   * all (the owner fallback, forward-header SSO: there is no session to sign out of, so there is nothing to
   * evict per-session). Re-stamped on every `adopt`, because a reconnect is a fresh request with a fresh
   * cookie: the cell survives a re-login, and it must not keep pointing at the session that just ended.
   *
   * WHY IT LIVES HERE AND NOT ON THE PRINCIPAL (owner-ruled 2026-08-14): logout is per-SESSION — signing
   * out on the phone must not kill the desktop — and the socket is the only long-lived thing that outlives the
   * request its Principal was minted from. D135 says the ROLE verdict has one home; a session id is not a
   * role, and threading it through the Principal would put a per-connection fact into the immutable identity
   * every domain reads. So the seam surfaces it BESIDE the Principal and it lands here, on the connection
   * record, where the only consumer is {@link SocketRegistry.evictSession}.
   */
  sessionId: SessionId | null;
  readonly rooms: Map<string, SocketRoom>;
  listener: SocketListener | null;
  live: boolean;
  /** Epoch-ms the socket went dark; `null` while live. The reap clock. */
  lastSeenAt: number | null;
  /** Bumped by every `goLive` — the identity of the CURRENT connection, and what `SocketRoom.announcedFor`
   *  is measured against. Starts at 0 on a fresh cell, so the attach that mints a room (announcing for the
   *  next connection, 1) matches the first `goLive`. */
  connectionSeq: number;
}

export interface SocketRegistry {
  /** Create-or-adopt the cell for `(userId, socketId)`, stamping the connecting request's `sessionId`
   *  (`null` = no cookie session; see {@link SocketCell.sessionId}). Throws a leak-free `DomainNotFoundError`
   *  when the socket belongs to another principal, and `DomainRateLimitError` past the per-user socket cap. */
  readonly adopt: (userId: UserId, socketId: SocketId, sessionId: SessionId | null) => SocketCell;
  /** Record the room as wanted (idempotent). A LOWER `sinceSeq` on an already-attached room is honored — it
   *  is a REPLAY REQUEST; a higher one never rewinds the cursor forward. */
  readonly attach: (userId: UserId, socketId: SocketId, ref: StreamRoomRef, sinceSeq: number | null) => void;
  /** Drop the room (idempotent — detaching an unattached room is a no-op). */
  readonly detach: (userId: UserId, socketId: SocketId, ref: StreamRoomRef) => void;
  /** The live generator's lifecycle edges. `goLive` TAKES OVER the cell: it evicts the outgoing listener,
   *  bumps `connectionSeq` (re-arming the reconnect barrier), and installs this one. `goDark` starts the
   *  reap clock and LEAVES the rooms in place so a reconnect re-hydrates them — and no-ops entirely unless
   *  `listener` is still the owner, so a zombie generator's late teardown cannot touch a live cell. */
  readonly goLive: (cell: SocketCell, listener: SocketListener) => void;
  readonly goDark: (cell: SocketCell, listener: SocketListener) => void;
  /**
   * SESSION DEATH → SOCKET DEATH, for ONE session (logout). Ends every live generator whose cell
   * authenticated with `sessionId` and returns how many it ended. The other devices of the same human are
   * untouched — that is the whole point of the per-SESSION arm.
   *
   * Eviction is a STOP signal, not a state edit: it calls the generator's `onEvicted`, and the generator's own
   * `finally` runs `goDark`, which is the ownership-checked transition (a cell darked from the outside would
   * race a takeover and undercount `liveSocketCount`). The ROOMS are deliberately left in place: a reconnect
   * on a still-valid cookie resumes them through the existing barrier, and a reconnect on the revoked one
   * fails `authedProcedure` with UNAUTHORIZED, which is what reaches the client's recovery ladder.
   * A `null` `sessionId` matches nothing — a sessionless connection cannot be signed out of.
   */
  readonly evictSession: (sessionId: SessionId) => number;
  /** SESSION DEATH → SOCKET DEATH, for a whole USER (admin revoke-all / disable / password reset / the
   *  OIDC back-channel logout). Same mechanism as {@link SocketRegistry.evictSession}, wider net — and the
   *  net has to be wider here: a disable is a statement about the human, and it must also reach the sockets
   *  that authenticated with NO session (the owner fallback, forward-header SSO) which no session id names. */
  readonly evictUser: (userId: UserId) => number;
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

  /**
   * Create-or-return the cell, WITHOUT touching its session stamp — the shape `attach` needs. An attach may
   * mint the cell (order-independent creation), and it must never OVERWRITE the stamp `connect` put there:
   * a re-announce carrying no session would blank the live connection's identity and make its logout evict
   * nothing. A cell minted here starts sessionless, which is exactly right — it has no generator to evict
   * until a `connect` adopts it and stamps the session that connection authenticated with.
   */
  function ensureCell(userId: UserId, socketId: SocketId): SocketCell {
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
    const cell: SocketCell = { socketId, userId, sessionId: null, rooms: new Map(), listener: null, live: false, lastSeenAt: now(), connectionSeq: 0 };
    cells.set(socketId, cell);
    return cell;
  }

  /** The CONNECT arm: the cell, with this connection's session stamped onto it. A reconnect is a new request
   *  with its own cookie, so the stamp is refreshed every time — a cell that outlived a re-login must not
   *  still name the session that ended. */
  function adopt(userId: UserId, socketId: SocketId, sessionId: SessionId | null): SocketCell {
    const cell = ensureCell(userId, socketId);
    cell.sessionId = sessionId;
    return cell;
  }

  /** Stop every live generator the predicate picks, and report how many. The listener's `onEvicted` is the
   *  ONLY thing fired: the generator's own `finally` runs `goDark` (ownership-checked), and the cell keeps its
   *  rooms so a reconnect on a still-valid credential resumes them through the existing barrier. */
  function evictWhere(match: (cell: SocketCell) => boolean): number {
    let evicted = 0;
    for (const cell of cells.values()) {
      if (cell.live && cell.listener !== null && match(cell)) {
        cell.listener.onEvicted();
        evicted += 1;
      }
    }
    return evicted;
  }

  function attach(userId: UserId, socketId: SocketId, ref: StreamRoomRef, sinceSeq: number | null): void {
    const cell = ensureCell(userId, socketId);
    const key = roomKey(ref);
    const room = cell.rooms.get(key);
    if (room === undefined) {
      if (cell.rooms.size >= ROOMS_PER_SOCKET) {
        throw new DomainRateLimitError(`Too many attached rooms on one stream (${ROOMS_PER_SOCKET}).`);
      }
      cell.rooms.set(key, { ref, cursor: sinceSeq, announcedFor: announceEpoch(cell) });
      cell.listener?.onAttach(ref, sinceSeq);
      return;
    }
    // The client has spoken for this room — the reconnect barrier's lift signal, recorded against the
    // connection it counts for, whether or not the socket is live yet (an announce can beat `connect`,
    // exactly like the attach that mints the cell can).
    room.announcedFor = announceEpoch(cell);
    // Idempotent re-attach. Only a LOWER cursor means anything (replay-from-here); anything else leaves the
    // live pump exactly where it is — a re-announce must never skip a room forward past undelivered rows.
    if (sinceSeq !== null && (room.cursor === null || sinceSeq < room.cursor)) {
      room.cursor = sinceSeq;
      cell.listener?.onAttach(ref, sinceSeq);
      return;
    }
    cell.listener?.onAnnounce(ref);
  }

  /** Which connection an announce arriving NOW counts for: the live one, or — while the cell is dark — the
   *  next one to take over. */
  function announceEpoch(cell: SocketCell): number {
    return cell.live ? cell.connectionSeq : cell.connectionSeq + 1;
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
      // TAKEOVER, not merely "a socket connected": evict the outgoing generator first, so a socket the
      // server has not yet noticed is dead stops producing into it (and stops advancing shared cursors).
      cell.listener?.onEvicted();
      // The new connection's identity. Every room announced under an EARLIER epoch is held by the barrier
      // until the client re-announces it — which is what makes the barrier independent of when (or whether)
      // the previous generator's teardown ever runs.
      cell.connectionSeq += 1;
      cell.live = true;
      cell.lastSeenAt = null;
      cell.listener = listener;
    },
    goDark: (cell, listener): void => {
      if (cell.listener !== listener) {
        return; // a superseded generator finishing: it owns nothing here any more
      }
      cell.live = false;
      cell.listener = null;
      cell.lastSeenAt = now();
    },
    evictSession: (sessionId: SessionId): number => evictWhere((cell) => cell.sessionId === sessionId),
    evictUser: (userId: UserId): number => evictWhere((cell) => cell.userId === userId),
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
