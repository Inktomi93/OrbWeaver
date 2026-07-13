// The in-memory health-probe throttle + circuit-breaker state. A named subsystem, not `persistence/` — these
// are module-scope Maps. Reached only through `substrate/health-throttle.ts`, never a direct verb import.
//
// ASSUMES(single-replica): the throttle window + strike counters are per-process — an admin status-poll on
// a multi-replica deploy hits whichever replica answered, and a restart resets a credential mid-strike.
//
// `now` is the injected clock — these functions take the epoch-ms value, never call a wall-clock.

/** 60s cooldown — UI status dots may poll faster, but only the first probe per window actually goes out. */
export const HEALTH_THROTTLE_MS = 60_000;

/** Three consecutive UNREACHABLE results → mark revoked even if the probe didn't classify as auth-failed
 *  (catches "the 401-detection heuristic drifted and stopped catching real auth failures"). */
export const HEALTH_STRIKE_LIMIT = 3;

// Bound the Maps so a flaky provider can't grow them unbounded; oldest-inserted is evicted (the Map's
// insertion-order iteration makes `keys().next()` the LRU victim once we touch-on-write below).
const HEALTH_CACHE_MAX = 1000;

const lastHealthCheck = new Map<string, number>();
const healthStrikes = new Map<string, number>();

/** The last epoch-ms a probe actually went out for this credentialId, or `undefined` (never probed). */
export function getLastHealthCheck(credentialId: string): number | undefined {
  return lastHealthCheck.get(credentialId);
}

/** Record that a probe went out now. Touch (delete + re-set) so insertion order tracks recency for LRU. */
export function rememberHealthCheck(credentialId: string, now: number): void {
  if (lastHealthCheck.size >= HEALTH_CACHE_MAX) {
    const oldest = lastHealthCheck.keys().next().value;
    if (oldest !== undefined) {
      lastHealthCheck.delete(oldest);
    }
  }
  lastHealthCheck.delete(credentialId);
  lastHealthCheck.set(credentialId, now);
}

/** Bump the consecutive-failure counter for this credentialId; returns the post-bump count. */
export function recordHealthStrike(credentialId: string): number {
  if (healthStrikes.size >= HEALTH_CACHE_MAX) {
    const oldest = healthStrikes.keys().next().value;
    if (oldest !== undefined) {
      healthStrikes.delete(oldest);
    }
  }
  const next = (healthStrikes.get(credentialId) ?? 0) + 1;
  healthStrikes.set(credentialId, next);
  return next;
}

/** Reset the strike counter (a successful probe — a transient blip shouldn't accumulate to revocation). */
export function clearHealthStrikes(credentialId: string): void {
  healthStrikes.delete(credentialId);
}
