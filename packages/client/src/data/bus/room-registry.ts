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

import type { StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";

/** What one subscriber of a room wants. `onEvent` receives the room's DATA frame (its bus event rides
 *  verbatim on `.event`); the other two are the degradation surfaces. */
export interface RoomSubscriber {
  readonly onEvent: (frame: StreamDataFrame) => void;
  /** Every transition into a LIVE socket — first connect AND every reconnect. The gap-heal edge. */
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
  /** The socket went live (connect or reconnect): re-announce every room, then fan out the gap-heal. */
  readonly socketLive: () => void;
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
  // Has the socket ever been live? The FIRST live edge needs no re-announce (every joined room announced
  // itself on bind); only a RECONNECT does, and only because the server may have reaped the cell.
  let everLive = false;

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

  function join(ref: StreamRoomRef, subscriber: RoomSubscriber): () => void {
    const key = roomKey(ref);
    const entry = rooms.get(key) ?? { ref, subscribers: new Set<RoomSubscriber>() };
    entry.subscribers.add(subscriber);
    const isFirst = entry.subscribers.size === 1;
    rooms.set(key, entry);
    if (isFirst) {
      announce(entry);
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
      for (const entry of rooms.values()) {
        if (reconnected) {
          announce(entry);
        }
        for (const subscriber of entry.subscribers) {
          subscriber.onSocketLive?.();
        }
      }
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
