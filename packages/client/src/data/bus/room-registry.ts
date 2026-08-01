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
// RE-ANNOUNCE ON RECONNECT — and it carries the room's CURRENT replay request, not its join-time one. Two
// reasons it is load-bearing rather than belt-and-braces:
//   • the cell is reaped 60s after going dark, so a laptop that slept for an hour would otherwise reconnect
//     onto an EMPTY cell and go permanently silent with no error anywhere;
//   • the server's room cursor counts what it DELIVERED — a frame yielded into a dying socket is behind that
//     cursor and would never be replayed. A durable room therefore re-attaches at the CLIENT's own
//     high-water mark (a `sinceSeq` THUNK, re-read here), which is strictly what the client applied; the
//     server honors the lower value by restarting the pump there and the replay refills the real gap.
// Attach is idempotent server-side (§5.4) — an equal mark is a no-op — so this costs one batched mutation
// per reconnect, on the same edge that already fires the gap-heal. The FIRST live edge is deliberately
// excluded: every joined room already announced itself when the transport bound.
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

/**
 * A durable room's replay request. A CONSTANT is a fixed request (`0` = from the beginning); a THUNK is
 * re-read at every announce, which is what makes a reconnect heal correct: the room re-attaches at the
 * client's CURRENT high-water mark instead of the one it happened to hold at join time. The server honors a
 * lower `sinceSeq` by restarting the room's pump there, so the durable replay refills exactly the gap.
 */
export type SinceSeqSource = number | null | (() => number | null);

/** Resolve a replay request at announce time. */
function resolveSinceSeq(source: SinceSeqSource | undefined): number | null {
  return typeof source === "function" ? source() : (source ?? null);
}

/** What one subscriber of a room wants. `onEvent` receives the room's DATA frame (its bus event rides
 *  verbatim on `.event`); the other two are the degradation surfaces. */
export interface RoomSubscriber {
  readonly onEvent: (frame: StreamDataFrame) => void;
  /** The GAP-HEAL edge: this room went live again after having been live before — a socket reconnect, or a
   *  re-attach after the room was detached. NEVER on the room's first live edge of a page (BOOT-4X). */
  readonly onSocketLive?: (() => void) | undefined;
  /** The room's typed failure (`roomFailed`), or a socket-level fault. The room is detached server-side. */
  readonly onError?: ((message: string) => void) | undefined;
  /** A durable room's replay request (`0` = from the beginning), constant or re-read per announce. Live-only
   *  rooms pass nothing. */
  readonly sinceSeq?: SinceSeqSource | undefined;
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
  /** A room lagged — the socket shed its tail. The DELIVERY gap is healed server-side (the shed restarts
   *  that room's pump from its last-delivered cursor, `stream/socket.ts`), so this only fans the room's own
   *  gap-heal for the reads a live-only room has no other way to refresh. */
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

/** The announce retry schedule — 3 attempts over ~1s, which covers the realistic failure (a flap that
 *  outlives the reconnect by a beat, a server restart between the two requests) without holding a room's
 *  first frames for a human-noticeable time. Hygiene numbers, not load-bearing. */
const ANNOUNCE_RETRY_FIRST_MS = 250;
const ANNOUNCE_RETRY_SECOND_MS = 750;
const ANNOUNCE_RETRY_BACKOFF_MS = [ANNOUNCE_RETRY_FIRST_MS, ANNOUNCE_RETRY_SECOND_MS] as const;

/** What a room whose announce never landed says. The room is genuinely not receiving — the honest thing is
 *  to say so rather than let a live socket look like a quiet chat. */
const ANNOUNCE_FAILED_MESSAGE = "Live updates could not be started for this room. Reload to try again.";

function lowestSinceSeq(entry: RoomEntry): number | null {
  let lowest: number | null = null;
  for (const subscriber of entry.subscribers) {
    const wanted = resolveSinceSeq(subscriber.sinceSeq);
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

  /**
   * THE ANNOUNCE IS RETRIED, because the server now WAITS for it. A durable room's re-announce is what lifts
   * the server's reconnect barrier (`stream/socket.ts`), so a swallowed failure no longer costs just the
   * rewind — it costs ALL delivery for that room, for the life of the connection: nothing retries, the pump
   * never runs (so it cannot even shed and self-heal), and the 15s ping keeps the socket alive so no
   * inactivity reconnect ever comes. Silence with no signal, until the user leaves and re-enters the chat.
   *
   * `stream.attach` is idempotent by design, so retrying is free. Exhausting the retries surfaces to the
   * room's own `onError` rather than staying quiet — a refusal worth seeing (the room/socket caps) reads as
   * an error, and the leak-free NOT_FOUND for a room the viewer may not have costs three cheap round trips
   * before saying so. Fire-and-forget from the caller's view either way: never an unhandled rejection.
   */
  function announce(entry: RoomEntry): void {
    attemptAnnounce(entry, 0);
  }

  /** One attach attempt, re-scheduling itself on failure. A chained timer rather than an await-loop: the
   *  caller is a synchronous lifecycle edge (join / bind / socketLive), so nothing here may block it. */
  function attemptAnnounce(entry: RoomEntry, attempt: number): void {
    const wire = transport;
    // The socket has not mounted yet (bindTransport flushes every joined room), or this room was left /
    // replaced mid-retry — either way there is nothing left to announce.
    if (wire === null || rooms.get(roomKey(entry.ref)) !== entry) {
      return;
    }
    // The replay request is re-read per attempt: the client's high-water mark may have advanced while a
    // previous attempt was in flight.
    void wire.attach(entry.ref, lowestSinceSeq(entry)).catch(() => retryAnnounce(entry, attempt));
  }

  function retryAnnounce(entry: RoomEntry, attempt: number): void {
    const backoff = ANNOUNCE_RETRY_BACKOFF_MS[attempt];
    if (backoff === undefined) {
      for (const subscriber of entry.subscribers) {
        subscriber.onError?.(ANNOUNCE_FAILED_MESSAGE);
      }
      return;
    }
    setTimeout(() => attemptAnnounce(entry, attempt + 1), backoff);
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
