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
// AN ATTACH IS DEDUPED, AND A DETACH IS DEFERRED — because a React MOUNT is not one lifecycle edge. Measured
// on 4/4 cold loads (side-eye, 2026-08-01): the `user` room attached TWICE on every boot, same socket, same
// ref, and opening a chat produced an attach→detach→attach churn. Two mechanisms, both structural, neither
// fixable by "make StrictMode stop":
//   • the DOUBLE EFFECT — dev StrictMode (and any remount: a Suspense retry, a fast route bounce) runs
//     cleanup then setup, so the last subscriber leaves and re-joins within one commit. Detaching eagerly
//     there throws the room away and buys it back one round-trip later. So the last leaver schedules the
//     detach `ROOM_RETIRE_GRACE_MS` out, and a re-join inside that window CANCELS it: the room never left, so
//     there is nothing to re-announce and — the part that mattered — no re-attach gap-heal wave either.
//   • the RE-BIND — `useOrbSocket`'s effect is double-invoked too, and `bindTransport` flushes every joined
//     room. So an announce carries its replay request forward (`entry.announced`) and an announce that would
//     repeat an identical attach is dropped. A RECONNECT still forces one: there the server may have reaped
//     the cell, which is the whole reason the re-announce exists.
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
// Scope is the PAGE LOAD (a module-level map, the `seqGuard` idiom — not a hook-local ref): a fresh module
// means a fresh QueryClient, whose data cannot predate this socket. The same per-room ledger answers the
// question `liveEpoch` publishes — "how much can this room have missed?" — because the BOOT-4X argument and
// the freshness argument are the SAME argument, and two counters would be two answers waiting to disagree.

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
  /** THIS ROOM's typed failure (`roomFailed`, or an announce that gave up) — the room is detached
   *  server-side and this is its own distinct cause, so a consumer may tell the user about it. A
   *  SOCKET-level fault never arrives here (#222): it is one cause for the whole tab and the socket tells
   *  it once itself. */
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
  /** THIS ROOM failed (a `roomFailed` control frame) — surface it to that room's subscribers. The ref is
   *  REQUIRED (#222): a socket-level fault used to come through here with it omitted, which fanned one
   *  cause to every joined room, and since every room hook's `onError` raises a toast that made one socket
   *  death into N byte-identical alerts. A socket fault is the socket's own story now (`use-orb-socket.ts`
   *  `reportSocketFault`), told once; the freshness those rooms lose is closed by `onSocketLive`'s
   *  gap-heal on the re-connect edge, which is what closed it before too. */
  readonly failed: (message: string, ref: StreamRoomRef) => void;
  /** FORCE every joined room to re-attach, past the dedupe. The session-recovery ladder's resume rung calls
   *  it: a session that died took every room's server-side cell with it (the frozen-principal socket is
   *  refused on reconnect), so the cells this tab believes it holds may not exist. Same instrument
   *  `socketLive` uses on a RE-connect, for the same reason — `stream.attach` is idempotent, so a room that
   *  IS still attached costs one batched mutation and nothing else. */
  readonly reannounceAll: () => void;
  /** Currently-joined room keys — the CT/probe lens. */
  readonly joined: () => readonly string[];
  /**
   * How many times this room has entered LIVE DELIVERY in this page load, and therefore how much this
   * client can have missed: `0` = never attached (unknown — the caller must assume the worst), `1` = it is
   * on its FIRST live edge, so nothing written elsewhere can be unseen (the reads that mounted alongside it
   * ARE the fresh state — the BOOT-4X argument in this file's header, and a fresh module means a fresh
   * QueryClient), `≥2` = it has been dark since it first attached (a reconnect, a re-attach after a chat
   * switch, or a shed), so anything written while it was dark is unseen by this tab.
   *
   * Read by the ONE invalidation seam (`data/invalidation.ts`, the `chatOpened` row): the attach synthesis
   * re-fires on EVERY attach including the first, and on the first there is nothing for it to heal.
   */
  readonly liveEpoch: (ref: StreamRoomRef) => number;
}

interface RoomEntry {
  readonly ref: StreamRoomRef;
  readonly subscribers: Set<RoomSubscriber>;
  /** The replay request this room has ALREADY announced to the wire, or `undefined` when it never has. The
   *  dedupe key: an announce that would repeat an identical attach is a no-op (see the header). */
  announced: number | null | undefined;
  /** The pending detach of a room nobody wants right now — cancelled if it is re-joined inside the grace. */
  retire: ReturnType<typeof setTimeout> | undefined;
}

/** The announce retry schedule — 3 attempts over ~1s, which covers the realistic failure (a flap that
 *  outlives the reconnect by a beat, a server restart between the two requests) without holding a room's
 *  first frames for a human-noticeable time. Hygiene numbers, not load-bearing. */
const ANNOUNCE_RETRY_FIRST_MS = 250;
const ANNOUNCE_RETRY_SECOND_MS = 750;
const ANNOUNCE_RETRY_BACKOFF_MS = [ANNOUNCE_RETRY_FIRST_MS, ANNOUNCE_RETRY_SECOND_MS] as const;

/** What a room whose announce never landed says. The room is genuinely not receiving — the honest thing is
 *  to say so rather than let a live socket look like a quiet chat.
 *
 *  NO ROOM NOUN (side-eye home re-score, 2026-08-18). It read "…for this room. Reload to try again." and
 *  fired on HOME, where no room is open and "this room" names nothing the reader can see — the rooms that
 *  fail there are the always-on `user` and `notifications` ones, which are shell plumbing, not a place. The
 *  remedy survives because this arm now only fires on a LIVE socket (see `reportAnnounceFailure`): there a
 *  reload genuinely re-subscribes, where under the per-origin socket cap it could not. */
const ANNOUNCE_FAILED_MESSAGE = "Live updates could not be started. Reload to try again.";

/** How long a room nobody wants is kept attached before the detach fires. Long enough to swallow a remount
 *  that spans commits (the StrictMode double-effect, a Suspense retry); short enough that a real "leave the
 *  chat" gives the room back while the user is still reaching for the next thing. */
const ROOM_RETIRE_GRACE_MS = 250;

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
  /** Has THIS live episode already told the user its rooms could not be announced? (`reportAnnounceFailure`
   *  — one alert per cause.) Re-armed on every live edge, which is where a new episode starts. */
  let announceFailureReported = false;
  /** How many times each room has entered live delivery in this page — the BOOT-4X gate (see the header)
   *  plus the freshness question `liveEpoch` answers. Never pruned on detach: "this room's cache may
   *  predate now" stays true for the rest of the page load, and a re-join must count as a SECOND edge. */
  const liveEdgesByRoom = new Map<string, number>();

  /**
   * THE ANNOUNCE IS RETRIED, because the server now WAITS for it. A durable room's re-announce is what lifts
   * the server's reconnect barrier (`stream/socket.ts`), so a swallowed failure no longer costs just the
   * rewind — it costs ALL delivery for that room, for the life of the connection: nothing retries, the pump
   * never runs (so it cannot even shed and self-heal), and the 15s ping keeps the socket alive so no
   * inactivity reconnect ever comes. Silence with no signal, until the user leaves and re-enters the chat.
   *
   * `stream.attach` is idempotent by design, so retrying is free. Exhausting the retries surfaces to the
   * room's own `onError` rather than staying quiet — the leak-free NOT_FOUND for a room the viewer may not
   * have costs three cheap round trips before saying so. Fire-and-forget from the caller's view either way:
   * never an unhandled rejection. WHICH exhaustions speak is `reportAnnounceFailure`'s decision, not this
   * one: a SOCKET-level refusal (the per-user cap is the live case) is the socket's story to tell once, not
   * every room's to repeat.
   */
  function announce(entry: RoomEntry, force = false): void {
    // The dedupe: this room is already attached with exactly this replay request, so re-sending it would only
    // spend a round-trip to tell the server what it already holds. A RECONNECT passes `force` — there the
    // server's cell may be gone, and an idempotent attach is the thing that brings it back.
    if (!force && entry.announced !== undefined && entry.announced === lowestSinceSeq(entry)) {
      return;
    }
    attemptAnnounce(entry, 0);
  }

  /** One attach attempt, re-scheduling itself on failure. A chained timer rather than an await-loop: the
   *  caller is a synchronous lifecycle edge (join / bind / socketLive), so nothing here may block it. */
  function attemptAnnounce(entry: RoomEntry, attempt: number): void {
    const wire = transport;
    // The socket has not mounted yet (bindTransport flushes every joined room), or this room was left /
    // replaced mid-retry — either way there is nothing left to announce. "Left" is SUBSCRIBER-counted, not
    // map-counted: a room inside its retire grace is still in the map, and a torn-down surface must not keep
    // announcing a room it is about to give back.
    if (wire === null || entry.subscribers.size === 0 || rooms.get(roomKey(entry.ref)) !== entry) {
      return;
    }
    // The replay request is re-read per attempt: the client's high-water mark may have advanced while a
    // previous attempt was in flight. What goes on the wire is what the dedupe records.
    const wanted = lowestSinceSeq(entry);
    entry.announced = wanted;
    // @orb-waive caught-failure-ownership(wire.attach): the rejection drives the retry ladder, which eventually reports via reportAnnounceFailure to every subscriber's onError. Ends if retryAnnounce stops chaining to reportAnnounceFailure.
    void wire.attach(entry.ref, wanted).catch(() => retryAnnounce(entry, attempt));
  }

  function retryAnnounce(entry: RoomEntry, attempt: number): void {
    const backoff = ANNOUNCE_RETRY_BACKOFF_MS[attempt];
    if (backoff === undefined) {
      reportAnnounceFailure(entry);
      return;
    }
    setTimeout(() => attemptAnnounce(entry, attempt + 1), backoff);
  }

  /**
   * ONE ALERT PER CAUSE (#215, side-eye home re-score 2026-08-18). A capped tab used to raise THREE: the
   * socket's own "Too many tabs are open" — the only one naming a remedy that works — plus one identical
   * "Live updates could not be started for this room. Reload to try again." per always-on room (`user` and
   * `notifications`), telling the user to do the one thing that cannot help. The duplication is structural,
   * not a copy bug: every room announces independently, so ONE cause fans out N times, and the count grows
   * with every always-on room the app adds.
   *
   * Two gates, and neither is a toast-side de-dup (that would mask genuinely distinct causes):
   *   • A DEAD SOCKET IS NOT THIS ROOM'S STORY. `stream.attach` mints the socket cell, so it refuses with the
   *     SAME `DomainRateLimitError` the connect did (`transport/trpc/stream/socket-registry.ts::ensureCell`)
   *     — i.e. when the socket has not reached the live state, every room's announce failure IS the socket's
   *     failure, and `useOrbSocket` has already told the user in the user's own vocabulary (tabs, not
   *     streams) with the retry that works. A room that stays quiet here is not swallowed: the socket going
   *     live FORCES a re-announce of every room, which is the recovery this silence waits for.
   *   • ONE PER EPISODE. With the socket live, N rooms failing for one server hiccup is still one thing that
   *     happened; the first room says it and the rest are silent until the next live edge re-arms the flag.
   */
  function reportAnnounceFailure(entry: RoomEntry): void {
    if (!socketIsLive || announceFailureReported) {
      return;
    }
    announceFailureReported = true;
    for (const subscriber of entry.subscribers) {
      subscriber.onError?.(ANNOUNCE_FAILED_MESSAGE);
    }
  }

  function retire(entry: RoomEntry): void {
    if (transport === null) {
      return;
    }
    // @orb-waive caught-failure-ownership(transport.detach): best-effort teardown of an already-retiring room — the server-side cell ages out on its own if this never lands. Ends if detach failure must block the retire.
    void transport.detach(entry.ref).catch(() => undefined);
  }

  /** Count one live edge for a room and answer whether it is a RE-entry (the BOOT-4X gate). */
  function countLiveEdge(key: string): boolean {
    const edges = (liveEdgesByRoom.get(key) ?? 0) + 1;
    liveEdgesByRoom.set(key, edges);
    return edges > 1;
  }

  /** One room reached the live state. Heals ONLY if it had already been live in this page — the BOOT-4X
   *  gate, at room granularity (see the header). Records the visit either way. */
  function roomWentLive(key: string, entry: RoomEntry): void {
    if (!countLiveEdge(key)) {
      return; // first live edge for this room in this page — its reads ARE the fresh state
    }
    for (const subscriber of entry.subscribers) {
      subscriber.onSocketLive?.();
    }
  }

  function join(ref: StreamRoomRef, subscriber: RoomSubscriber): () => void {
    const key = roomKey(ref);
    const entry = rooms.get(key) ?? { ref, subscribers: new Set<RoomSubscriber>(), announced: undefined, retire: undefined };
    entry.subscribers.add(subscriber);
    rooms.set(key, entry);
    // A room inside its retire grace was never given back — this join RECLAIMS it. Nothing to announce (it is
    // still attached with this request) and nothing to heal (it never went dark): the remount is invisible.
    const reclaimed = entry.retire !== undefined;
    if (reclaimed) {
      clearTimeout(entry.retire);
      entry.retire = undefined;
    }
    const firstSubscriber = entry.subscribers.size === 1 && !reclaimed;
    // EVERY JOIN ANNOUNCES; THE DEDUPE DECIDES WHETHER IT REACHES THE WIRE. Gating this on "first
    // subscriber" was the durable-replay hole (#1484): a second hook joining an ALREADY-ATTACHED room with
    // a LOWER `sinceSeq` — a chat surface resuming from its stored high-water mark beside a live-only
    // sibling that got there first — was added to the Set and nothing re-announced it, so the room stayed
    // attached at the HIGHER cursor and every event between the two cursors was never replayed to it. The
    // room is silent about rows it can prove it is missing, with no error anywhere.
    // Correct BECAUSE of the dedupe rather than in spite of it: `announce` compares `entry.announced`
    // against `lowestSinceSeq(entry)`, so a joiner that does not lower the room's replay request costs
    // nothing (N subscribers still = ONE attach, the ref-count property this file exists for), and a
    // RECLAIM inside the retire grace stays the invisible remount it was — unless the reclaiming
    // subscriber wants an earlier cursor, which is exactly when it must not be invisible.
    announce(entry);
    if (firstSubscriber && socketIsLive) {
      // Joining an ALREADY-live socket: this room is live now, so its own live edge is here, not at the
      // next `socketLive()` (which may never come). A RE-join after a detach heals; a first join does not.
      roomWentLive(key, entry);
    }
    return (): void => {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size > 0 || entry.retire !== undefined) {
        return;
      }
      entry.retire = setTimeout(() => {
        entry.retire = undefined;
        // A subscriber arriving in the grace window cancels this timer; only a room still wanted by nobody,
        // and still the one this key holds, is given back.
        if (entry.subscribers.size > 0 || rooms.get(key) !== entry) {
          return;
        }
        rooms.delete(key);
        retire(entry);
      }, ROOM_RETIRE_GRACE_MS);
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
      // A new live episode: whatever this tab said about a failed announce belongs to the last one.
      announceFailureReported = false;
      for (const [key, entry] of rooms) {
        if (reconnected) {
          // FORCED past the dedupe: the server may have reaped this room's cell while the socket was down.
          announce(entry, true);
        }
        roomWentLive(key, entry);
      }
    },
    socketDown: (): void => {
      socketIsLive = false;
    },
    lagged: (ref): void => {
      const key = roomKey(ref);
      const entry = rooms.get(key);
      if (entry === undefined) {
        return;
      }
      // A shed IS a delivery gap — frames this room was owed never arrived — so it counts as a live edge
      // for `liveEpoch` exactly like a reconnect does, even though the socket never dropped. Without the
      // count, a room that lagged on its first attach would still report epoch 1 ("nothing can be missed"),
      // which is precisely what a shed disproves.
      countLiveEdge(key);
      for (const subscriber of entry.subscribers) {
        subscriber.onSocketLive?.();
      }
    },
    reannounceAll: (): void => {
      for (const entry of rooms.values()) {
        announce(entry, true);
      }
    },
    failed: (message, ref): void => {
      const entry = rooms.get(roomKey(ref));
      for (const subscriber of entry?.subscribers ?? []) {
        subscriber.onError?.(message);
      }
    },
    joined: (): readonly string[] => [...rooms.keys()],
    liveEpoch: (ref): number => liveEdgesByRoom.get(roomKey(ref)) ?? 0,
  };
}

/** The per-document registry — one socket, one registry, mirroring the module-scope tRPC client at the door. */
export const roomRegistry: RoomRegistry = createRoomRegistry();
