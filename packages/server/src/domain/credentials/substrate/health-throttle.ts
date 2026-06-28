// domain/credentials/substrate/health-throttle — the SUBSTRATE MEDIATOR for the `health/` subsystem
// (domain-substrate-mediates-subsystems: a verb may not import a named subsystem directly — it reaches it
// through `substrate/`). This is the single seam `test-health` imports. It wraps the raw `health/cache`
// Maps in the THROTTLE + CIRCUIT-BREAKER decisions (real logic, not a re-export barrel) so the verb reads
// a clean intent-level API and the window/strike-limit constants stay inside this seam, never in the verb.
//
// `now` is the INJECTED clock value (testing §3) — passed in, never read from a wall-clock here.

import {
  clearHealthStrikes,
  getLastHealthCheck,
  HEALTH_STRIKE_LIMIT,
  HEALTH_THROTTLE_MS,
  recordHealthStrike,
  rememberHealthCheck,
} from "../health/cache";

/**
 * Begin a probe: if a probe for `credentialId` already went out within the 60s window, return that
 * `lastCheckedAt` (the caller returns `throttled` — no second probe goes out). Otherwise record `now` as
 * the probe time and return `null` (the caller proceeds to actually probe).
 */
export function beginProbe(credentialId: string, now: number): number | null {
  const lastChecked = getLastHealthCheck(credentialId);
  if (lastChecked !== undefined && now - lastChecked < HEALTH_THROTTLE_MS) {
    return lastChecked;
  }
  rememberHealthCheck(credentialId, now);
  return null;
}

/**
 * Record one consecutive-failure strike. Returns the post-bump count and whether the 3-strike circuit
 * breaker tripped (in which case the counter is reset so the next streak starts clean). The caller marks
 * the credential revoked when `limitHit` — catching auth failures the message-heuristic probe missed.
 */
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
