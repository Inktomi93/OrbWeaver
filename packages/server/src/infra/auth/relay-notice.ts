// The `owner_fallback_relayed` security line, throttled to one line per TCP peer per hour. The socket peer keys
// it, never a forwarded header: a sender picks its header value, so it could reset the key.

import type { Logger } from "#foundation/observability";
import { securityEvent } from "#foundation/observability";
import type { RelayedFallbackNotice } from "./contract.ts";
import { createKeyedNoticeThrottle } from "./notice-throttle.ts";

const UNKNOWN_PEER = "unknown";

/** The unthrottled line: what `resolve` emits when no throttled notice is injected. */
export function reportRelayedFallback(peerIp: string | undefined, log: Logger): void {
  securityEvent(
    "owner_fallback_relayed",
    { peerIp: peerIp ?? null },
    "security: a relayed request (forwarding header present) asked for the un-credentialed owner fallback — refusing. A proxy or tunnel in front of this box must not make its visitors the owner: use AUTH_MODE=local or oidc behind it.",
    log,
  );
}

/** One line per peer per hour. `now` is the composition root's clock. */
export function createRelayedFallbackNotice(now: () => number, log: Logger): RelayedFallbackNotice {
  const throttle = createKeyedNoticeThrottle(now);
  return (peerIp) => {
    throttle(peerIp ?? UNKNOWN_PEER, () => {
      reportRelayedFallback(peerIp, log);
    });
  };
}
