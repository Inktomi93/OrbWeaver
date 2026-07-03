// transport/trpc/presence-registry — the server-derived live-presence source (PD-70; chat.md Part III §4).
// Presence (who is live) is a REF-COUNT per `userId` over the open SSE connections (one per device), NEVER a
// client-asserted heartbeat — a spoofable presence is a prompt-composition attack (presence → cast → injected
// WI/persona, neo §9). It lives HERE in transport (the connection registry) and is injected into chat as the
// `presence.read` op for cast-gating; an offline participant drops from the present cast for the next round.
//
// The counting seam is the per-user notifications SSE lifecycle (the always-on stream every device holds):
// `connect(userId, signal)` bumps the count and releases it on `signal` abort (SSE disconnect) — the SAME
// abort the notifications/chat buses already tear down on. Read-once-per-round: `read()` is a pure snapshot;
// a flip takes effect on the NEXT round (chat pins the cast once per round — invariant #8).
//
// DEBOUNCE (grace window): a brief disconnect (reload, network blip) must NOT flicker a participant offline
// mid-conversation. The last device's disconnect stamps `lastSeenAt`; `read()` keeps `online:true` until the
// grace window elapses, so a fast reconnect is invisible to cast-gating.
//
// DETERMINISM: time comes from the INJECTED `now` (built at the composition root, `entry/`), never ambient
// `Date.now()` (the `no-raw-clock` seam) — so a test drives the grace window with a controllable clock.
//
// SCOPE (v1): process-local, like the two live buses (`chat-events-bus`/`notifications-bus`). Single-replica
// is the v1 stance; a multi-replica presence source is a named DB/pubsub-backed replacement seam (ledger §E).
// The `userId → cell` map is not pruned (bounded by the user count — an owned, unremarkable footprint).

import type { PresenceView } from "@orb/contracts/notifications";
import type { UserId } from "@orb/kit/ids";

/** How long a fully-disconnected user is still reported `online` — the reconnect debounce (chat.md §4
 *  "debounced/grace-windowed"). A reload/blip reconnects well inside this; a real departure outlasts it. */
const GRACE_MS = 15_000;

/** Per-user liveness cell: the live-connection ref-count + the epoch-ms of the last drop-to-zero (the grace
 *  anchor; `null` while ≥1 device is connected). */
interface PresenceCell {
  count: number;
  lastSeenAt: number | null;
}

/** The transport presence surface: the write side (`connect`, driven by the SSE lifecycle) + the read side
 *  (`read`, injected into chat as `presence.read`). Built at the composition root over the injected clock. */
export interface PresenceRegistry {
  /** Register one live device connection for `userId`; releases (decrements) on `signal` abort. Each
   *  `connect` is one device, so N concurrent streams ref-count to N. */
  readonly connect: (userId: UserId, signal: AbortSignal) => void;
  /** The current server-derived presence for `userId` (a snapshot; cast-gating reads it once per round). */
  readonly read: (userId: UserId) => PresenceView;
}

/**
 * Build the process-local presence registry over the injected `now`. The registry owns a `userId → cell`
 * map; `connect` increments on subscribe and decrements on abort; `read` derives `online` from the count
 * with the grace-window debounce. No module-global state — one instance per process, composed at `entry/`.
 */
export function createPresenceRegistry(now: () => number): PresenceRegistry {
  const cells = new Map<UserId, PresenceCell>();

  function decrement(cell: PresenceCell): void {
    cell.count = Math.max(0, cell.count - 1);
    if (cell.count === 0) {
      cell.lastSeenAt = now(); // grace anchor: the last device left at this instant.
    }
  }

  function connect(userId: UserId, signal: AbortSignal): void {
    const cell = cells.get(userId) ?? { count: 0, lastSeenAt: null };
    cell.count += 1;
    cell.lastSeenAt = null; // ≥1 device connected ⇒ online, no last-seen stamp.
    cells.set(userId, cell);
    if (signal.aborted) {
      decrement(cell); // already-dead connection (raced the abort) — release immediately.
      return;
    }
    signal.addEventListener("abort", () => decrement(cell), { once: true });
  }

  function read(userId: UserId): PresenceView {
    const cell = cells.get(userId);
    if (cell === undefined) {
      return { userId, online: false, lastSeenAt: null }; // never seen.
    }
    if (cell.count > 0) {
      return { userId, online: true, lastSeenAt: null }; // ≥1 live device.
    }
    // Fully disconnected: still online inside the grace window (reconnect debounce), then offline with the
    // disconnect stamp surfaced as `lastSeenAt` (contract: `null` while online).
    const withinGrace = cell.lastSeenAt !== null && now() - cell.lastSeenAt < GRACE_MS;
    return withinGrace
      ? { userId, online: true, lastSeenAt: null }
      : { userId, online: false, lastSeenAt: cell.lastSeenAt };
  }

  return { connect, read };
}
