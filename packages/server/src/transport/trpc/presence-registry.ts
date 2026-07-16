// The server-derived live-presence source. Presence is a ref-count per userId over the open SSE
// connections (one per device), never a client-asserted heartbeat — a spoofable presence is a
// prompt-composition attack. Injected into chat as the presence.read op for cast-gating; an offline
// participant drops from the present cast for the next round.
//
// Debounce (grace window): a brief disconnect must not flicker a participant offline mid-conversation.
// The last device's disconnect stamps lastSeenAt; read() keeps online:true until the grace window elapses.
//
// Scope (v1): process-local, like the two live buses. Single-replica is the v1 stance.

import type { PresenceView } from "@orb/contracts/notifications";
import type { UserId } from "@orb/kit/ids";

const GRACE_MS = 15_000;

interface PresenceCell {
  count: number;
  lastSeenAt: number | null;
}

export interface PresenceRegistry {
  /** Register one live device connection for `userId`; releases (decrements) on `signal` abort. */
  readonly connect: (userId: UserId, signal: AbortSignal) => void;
  readonly read: (userId: UserId) => PresenceView;
}

/** Build the process-local presence registry over the injected `now`. No module-global state — one
 *  instance per process, composed at entry/. */
export function createPresenceRegistry(now: () => number): PresenceRegistry {
  const cells = new Map<UserId, PresenceCell>();

  function decrement(cell: PresenceCell): void {
    cell.count = Math.max(0, cell.count - 1);
    if (cell.count === 0) {
      cell.lastSeenAt = now();
    }
  }

  function connect(userId: UserId, signal: AbortSignal): void {
    const cell = cells.get(userId) ?? { count: 0, lastSeenAt: null };
    cell.count += 1;
    cell.lastSeenAt = null;
    cells.set(userId, cell);
    if (signal.aborted) {
      decrement(cell);
      return;
    }
    signal.addEventListener("abort", () => decrement(cell), { once: true });
  }

  function read(userId: UserId): PresenceView {
    const cell = cells.get(userId);
    if (cell === undefined) {
      return { userId, online: false, lastSeenAt: null };
    }
    if (cell.count > 0) {
      return { userId, online: true, lastSeenAt: null };
    }
    const withinGrace = cell.lastSeenAt !== null && now() - cell.lastSeenAt < GRACE_MS;
    return withinGrace ? { userId, online: true, lastSeenAt: null } : { userId, online: false, lastSeenAt: cell.lastSeenAt };
  }

  return { connect, read };
}
