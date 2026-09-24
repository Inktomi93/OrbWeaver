// The `owner_fallback_relayed` security line, throttled to one line per TCP peer per window. A same-host tunnel
// delivers every visitor from one loopback peer, so an unthrottled line repeats per request and buries itself.
// The socket peer keys it, never a forwarded header: a sender picks its header value, so it could reset the key.

import { securityEvent } from "#foundation/observability";
import type { RelayedFallbackNotice } from "./contract.ts";

const RELAY_NOTICE_WINDOW_MS = 3_600_000;
// Bounds the peer map: an IPv6 sender can present an unbounded number of source addresses.
const RELAY_NOTICE_MAX_PEERS = 1024;
const UNKNOWN_PEER = "unknown";

/** The unthrottled line: what `resolve` emits when no throttled notice is injected. */
export function reportRelayedFallback(peerIp: string | undefined): void {
  securityEvent(
    "owner_fallback_relayed",
    { peerIp: peerIp ?? null },
    "security: a relayed request (forwarding header present) asked for the un-credentialed owner fallback — refusing. A proxy or tunnel in front of this box must not make its visitors the owner: use AUTH_MODE=local or oidc behind it.",
  );
}

// Drops expired entries once the map is full; true when a new peer still fits.
function roomForNewPeer(loggedAt: Map<string, number>, at: number): boolean {
  if (loggedAt.size < RELAY_NOTICE_MAX_PEERS) {
    return true;
  }
  for (const [peer, stamp] of loggedAt) {
    if (at - stamp >= RELAY_NOTICE_WINDOW_MS) {
      loggedAt.delete(peer);
    }
  }
  return loggedAt.size < RELAY_NOTICE_MAX_PEERS;
}

/** One line per peer per hour. `now` is the composition root's clock. When the map is full of live peers, a
 *  new peer is not logged: the operator already has the notice, and dropping beats an unbounded map. */
export function createRelayedFallbackNotice(now: () => number): RelayedFallbackNotice {
  const loggedAt = new Map<string, number>();
  return (peerIp) => {
    const key = peerIp ?? UNKNOWN_PEER;
    const at = now();
    const last = loggedAt.get(key);
    if (last === undefined ? !roomForNewPeer(loggedAt, at) : at - last < RELAY_NOTICE_WINDOW_MS) {
      return;
    }
    loggedAt.set(key, at);
    reportRelayedFallback(peerIp);
  };
}
