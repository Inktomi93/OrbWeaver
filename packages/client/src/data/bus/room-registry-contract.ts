// The registry contract is shared by the mutable engine and room hooks without carrying engine state.
import type { StreamDataFrame, StreamRoomRef } from "@orb/contracts/stream";

/**
 * A durable room's replay request. A CONSTANT is a fixed request (`0` = from the beginning); a THUNK is
 * re-read at every announce, which is what makes a reconnect heal correct: the room re-attaches at the
 * client's CURRENT high-water mark instead of the one it happened to hold at join time. The server honors a
 * lower `sinceSeq` by restarting the room's pump there, so the durable replay refills exactly the gap.
 */
export type SinceSeqSource = number | null | (() => number | null);

/** What one subscriber of a room wants: data frames, recovery and degradation callbacks. */
export interface RoomSubscriber {
  readonly onEvent: (frame: StreamDataFrame) => void;
  /** The GAP-HEAL edge: this room went live again after having been live before — a socket reconnect, or a
   *  re-attach after the room was detached. NEVER on the room's first live edge of a page (BOOT-4X). */
  readonly onSocketLive?: (() => void) | undefined;
  /** The transport reconnected, not a room rejoin or lag-heal. */
  readonly onSocketReconnect?: (() => void) | undefined;
  /** A live transport exists, including first connection or joining one already live. */
  readonly onSocketConnected?: (() => void) | undefined;
  /** Current live process identity; null invalidates readiness synchronously when the connection goes down. */
  readonly onServerReady?: ((serverInstanceId: string | null) => void) | undefined;
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
  readonly serverReady: (serverInstanceId: string) => void;
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
