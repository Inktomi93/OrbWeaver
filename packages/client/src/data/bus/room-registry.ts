// The client room registry (SSE-1 §6) — `roomKey → { ref, subscribers }`, ref-counted attach/detach over
// the ONE socket. It is the client half of the multiplex: `useBusRoom` declares interest, this decides when
// that interest becomes an `attach`/`detach` mutation, and `useOrbSocket` routes arriving frames back to it.
//
// REF-COUNTED, KEYED BY `roomKey` — the two properties that make the starvation class unmakeable:
//   • N hooks on the SAME room cost ONE attach (and one detach when the last of them leaves), so a second
//     consumer of a room is free instead of "one more always-on stream".
//   • the attach decision keys on the roomKey STRING, never on a ref object's identity. A re-render that
//     rebuilds `{ channel: "rpg", chatId }` cannot re-attach anything — which is exactly the failure mode a
//     `useSubscription(input)` per hook is exposed to, and the one that made "why are there two rpg streams?"
//     a question anyone could ask.
//
// THE TRANSPORT BINDS LATE. `useOrbSocket` mounts once at the composition root, but a room hook can render
// before it (React commits children first). So joins made before `bindTransport` are recorded and FLUSHED on
// bind — the client-side twin of the server's order-independent cell.
//
// RE-ANNOUNCE ON RECONNECT. Spec §5.3 makes reconnect server-sticky (the cell survives the socket), so
// re-attaching is not required for correctness. We do it anyway on every live edge AFTER the first, because
// the cell is reaped 60s after going dark and a laptop that slept for an hour would otherwise reconnect onto
// an EMPTY cell and go permanently silent with no error anywhere. Attach is idempotent server-side (§5.4),
// so it costs one batched mutation per reconnect — the same edge that already fires the gap-heal. The FIRST
// live edge is deliberately excluded: every joined room already announced itself when the transport bound.
//
// THE GAP-HEAL IS A RE-CONNECT INSTRUMENT, NEVER A PAGE-LOAD ONE (BOOT-4X, `46d75eaf`). `onSocketLive` fires
// for a room only once that room HAS ALREADY BEEN LIVE in this page. The rule was measured, not reasoned:
// healing on the first connect re-fetched every mounted user root a SECOND time on every page load
// (persona.list / character.list / settings.getUserSettings / chat.listChats each ×2, the heal wave landing
// ~5ms AFTER the mount wave had RESOLVED — `invalidateQueries` only rides an in-flight fetch while it IS in
// flight, and these were not). A first connect has no downtime window to close: the reads it would heal were
// issued by that same page load, in the same commit as the subscription.
//
// It is tracked PER ROOM, not per socket, because a room has two ways to become live and both matter:
//   • the SOCKET reconnects while the room is attached — the classic dropped-stream gap;
//   • the ROOM re-attaches after having been detached (a chat switch away and back). Its reads are served
//     from a `staleTime: Infinity` cache that went stale while nothing was announcing writes — the same
//     downtime window, at room granularity. This is BOOT-4X's own "a REMOUNT keeps an old cache across a
//     detached stream, which IS a real gap and correctly heals", generalized to every room.
// A room's FIRST attach in a page is excluded by the same argument as the first connect: whatever mounts
// alongside it is fetching right then.
//
// Scope is the PAGE LOAD (a module-level set, the `seqGuard` idiom — not a hook-local ref): a fresh module
// means a fresh QueryClient, whose data cannot predate this socket.

import type { StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";

/** What one subscriber of a room wants. `onEvent` receives the room's DATA frame (its bus event rides
 *  verbatim on `.event`); the other two are the degradation surfaces. */
export interface RoomSubscriber {
  readonly onEvent: (frame: StreamDataFrame) => void;
  /** The GAP-HEAL edge: this room went live again after having been live before — a socket reconnect, or a
   *  re-attach after the room was detached. NEVER on the room's first live edge of a page (BOOT-4X). */
  readonly onSocketLive?: (() => void) | undefined;
  /** The room's typed failure (`roomFailed`), or a socket-level fault. The room is detached server-side. */
  readonly onError?: ((message: string) => void) | undefined;
  /** A durable room's replay request (`0` = from the beginning). Live-only rooms pass nothing. */
  readonly sinceSeq?: number | null | undefined;
}

/** How the registry reaches the wire. Bound by `useOrbSocket` (which owns the imperative tRPC client). */
export interface RoomTransport {
  readonly attach: (ref: StreamRoomRef, sinceSeq: number | null) => Promise<void>;
  readonly detach: (ref: StreamRoomRef) => Promise<void>;
}

export interface RoomRegistry {
  /** Declare interest in a room. Returns the leave function (the last leaver detaches). */
  readonly join: (ref: StreamRoomRef, subscriber: RoomSubscriber) => () => void;
  /** Wire (or unwire) the socket's mutation channel; binding flushes every pending attach. */
  readonly bindTransport: (transport: RoomTransport | null) => void;
  /** Route one arriving DATA frame to its room's subscribers. A frame for an unjoined room is dropped. */
  readonly deliver: (frame: StreamDataFrame) => void;
  /** The socket went live (connect or reconnect): re-announce every room, then fan out the gap-heal to the
   *  rooms that had already been live (BOOT-4X — never on a first live edge). */
  readonly socketLive: () => void;
  /** The socket left the live state (drop / reconnecting / idle). The next `socketLive` is a RE-connect for
   *  every attached room, which is exactly what the gap-heal exists for. */
  readonly socketDown: () => void;
  /** A room lagged — the socket shed its tail. Same healing edge as a reconnect for that ONE room. */
  readonly lagged: (ref: StreamRoomRef) => void;
  /** A room failed (or the whole socket did, with `ref` omitted): surface it to the affected subscribers. */
  readonly failed: (message: string, ref?: StreamRoomRef) => void;
  /** Currently-joined room keys — the CT/probe lens. */
  readonly joined: () => readonly string[];
}

interface RoomEntry {
  readonly ref: StreamRoomRef;
  readonly subscribers: Set<RoomSubscriber>;
}

function lowestSinceSeq(entry: RoomEntry): number | null {
  let lowest: number | null = null;
  for (const subscriber of entry.subscribers) {
    const wanted = subscriber.sinceSeq ?? null;
    if (wanted !== null && (lowest === null || wanted < lowest)) {
      lowest = wanted;
    }
  }
  return lowest;
}

export function createRoomRegistry(): RoomRegistry {
  const rooms = new Map<string, RoomEntry>();
  let transport: RoomTransport | null = null;
  // Has the SOCKET ever been live? The first live edge needs no re-announce (every joined room announced
  // itself on bind); only a RECONNECT does, and only because the server may have reaped the cell.
  let everLive = false;
  /** Is the socket live RIGHT NOW? A room joining a live socket goes live immediately. */
  let socketIsLive = false;
  /** Room keys that have been live at least once in this page — the BOOT-4X gate (see the header). Never
   *  pruned on detach: "this room's cache may predate now" stays true for the rest of the page load. */
  const everLiveRooms = new Set<string>();

  // Attach/detach are fire-and-forget from the caller's view: a refused attach is the room's OWN verdict
  // (a leak-free NOT_FOUND for a room the viewer may not have), and it must not become an unhandled
  // rejection or a toast — the room simply never delivers, which is the withhold-not-throw posture the
  // per-proc streams already had.
  function announce(entry: RoomEntry): void {
    if (transport === null) {
      return; // the socket has not mounted yet — bindTransport flushes every joined room
    }
    void transport.attach(entry.ref, lowestSinceSeq(entry)).catch(() => undefined);
  }

  function retire(entry: RoomEntry): void {
    if (transport === null) {
      return;
    }
    void transport.detach(entry.ref).catch(() => undefined);
  }

  /** One room reached the live state. Heals ONLY if it had already been live in this page — the BOOT-4X
   *  gate, at room granularity (see the header). Records the visit either way. */
  function roomWentLive(key: string, entry: RoomEntry): void {
    const hadBeenLive = everLiveRooms.has(key);
    everLiveRooms.add(key);
    if (!hadBeenLive) {
      return; // first live edge for this room in this page — its reads ARE the fresh state
    }
    for (const subscriber of entry.subscribers) {
      subscriber.onSocketLive?.();
    }
  }

  function join(ref: StreamRoomRef, subscriber: RoomSubscriber): () => void {
    const key = roomKey(ref);
    const entry = rooms.get(key) ?? { ref, subscribers: new Set<RoomSubscriber>() };
    entry.subscribers.add(subscriber);
    const isFirst = entry.subscribers.size === 1;
    rooms.set(key, entry);
    if (isFirst) {
      announce(entry);
      if (socketIsLive) {
        // Joining an ALREADY-live socket: this room is live now, so its own live edge is here, not at the
        // next `socketLive()` (which may never come). A RE-join after a detach heals; a first join does not.
        roomWentLive(key, entry);
      }
    }
    return (): void => {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size > 0) {
        return;
      }
      rooms.delete(key);
      retire(entry);
    };
  }

  return {
    join,
    bindTransport: (next): void => {
      transport = next;
      if (next === null) {
        return;
      }
      for (const entry of rooms.values()) {
        announce(entry);
      }
    },
    deliver: (frame): void => {
      const entry = rooms.get(roomKey(frame));
      if (entry === undefined) {
        return; // a room nobody joined — the real server never sends one, and a stale frame must not fan out
      }
      for (const subscriber of entry.subscribers) {
        subscriber.onEvent(frame);
      }
    },
    socketLive: (): void => {
      const reconnected = everLive;
      everLive = true;
      socketIsLive = true;
      for (const [key, entry] of rooms) {
        if (reconnected) {
          announce(entry);
        }
        roomWentLive(key, entry);
      }
    },
    socketDown: (): void => {
      socketIsLive = false;
    },
    lagged: (ref): void => {
      const entry = rooms.get(roomKey(ref));
      for (const subscriber of entry?.subscribers ?? []) {
        subscriber.onSocketLive?.();
      }
    },
    failed: (message, ref): void => {
      const affected = ref === undefined ? [...rooms.values()] : [rooms.get(roomKey(ref))];
      for (const entry of affected) {
        for (const subscriber of entry?.subscribers ?? []) {
          subscriber.onError?.(message);
        }
      }
    },
    joined: (): readonly string[] => [...rooms.keys()],
  };
}

/** The per-document registry — one socket, one registry, mirroring the module-scope tRPC client at the door. */
export const roomRegistry: RoomRegistry = createRoomRegistry();
