// domain/credentials/substrate/health-throttle — substrate mediator for the `health/` subsystem; the
// single seam test-health imports. `now` is the injected clock value, never read from a wall-clock here.

import {
  clearHealthStrikes,
  getLastHealthCheck,
  HEALTH_STRIKE_LIMIT,
  HEALTH_THROTTLE_MS,
  recordHealthStrike,
  rememberHealthCheck,
} from "../health/cache";

/** If a probe already went out within the throttle window, returns that lastCheckedAt (caller returns
 *  throttled); otherwise records now as the probe time and returns null. */
export function beginProbe(credentialId: string, now: number): number | null {
  const lastChecked = getLastHealthCheck(credentialId);
  if (lastChecked !== undefined && now - lastChecked < HEALTH_THROTTLE_MS) {
    return lastChecked;
  }
  rememberHealthCheck(credentialId, now);
  return null;
}

/** Returns the post-bump strike count and whether the circuit breaker tripped (counter resets on trip). */
export function recordStrike(credentialId: string): { strikes: number; limitHit: boolean } {
  const strikes = recordHealthStrike(credentialId);
  const limitHit = strikes >= HEALTH_STRIKE_LIMIT;
  if (limitHit) {
    clearHealthStrikes(credentialId);
  }
  return { strikes, limitHit };
}

/** Reset the strike counter — a decisive probe (ok or revoked) shouldn't leave a stale streak. */
export function resetStrikes(credentialId: string): void {
  clearHealthStrikes(credentialId);
}
