// domain/credentials/substrate/health-throttle — substrate mediator for the `health/` subsystem; the
// single seam test-health imports. `now` is the injected clock value, never read from a wall-clock here.

import type { UserCredentialId } from "@orb/kit/ids";
import type { CredentialHealthThrottle } from "../contract/health.ts";
import { createCredentialHealthCache, HEALTH_STRIKE_LIMIT, HEALTH_THROTTLE_MS } from "../health/cache.ts";

/** Bind graph-local cooldown and strike policy to its owned state. */
export function createCredentialHealthThrottle(): CredentialHealthThrottle {
  // biome-ignore lint/nursery/useDisposables: the returned throttle owns and disposes this cache; local using would close it before any probe.
  const cache = createCredentialHealthCache();
  /** If a probe already went out within the throttle window, returns that lastCheckedAt (caller returns
   *  throttled); otherwise records now as the probe time and returns null. */
  function beginProbe(credentialId: UserCredentialId, now: number): number | null {
    const lastChecked = cache.getLastHealthCheck(credentialId);
    if (lastChecked !== undefined && now - lastChecked < HEALTH_THROTTLE_MS) {
      return lastChecked;
    }
    cache.rememberHealthCheck(credentialId, now);
    return null;
  }

  /** Returns the post-bump strike count and whether the circuit breaker tripped (counter resets on trip). */
  function recordStrike(credentialId: UserCredentialId): { strikes: number; limitHit: boolean } {
    const strikes = cache.recordHealthStrike(credentialId);
    const limitHit = strikes >= HEALTH_STRIKE_LIMIT;
    if (limitHit) {
      cache.clearHealthStrikes(credentialId);
    }
    return { strikes, limitHit };
  }

  /** Reset the strike counter — a decisive probe (ok or revoked) shouldn't leave a stale streak. */
  function resetStrikes(credentialId: UserCredentialId): void {
    cache.clearHealthStrikes(credentialId);
  }

  return { beginProbe, recordStrike, resetStrikes, [Symbol.dispose]: () => cache[Symbol.dispose]() };
}
