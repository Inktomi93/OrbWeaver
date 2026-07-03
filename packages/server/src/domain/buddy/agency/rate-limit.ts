// domain/buddy/agency/rate-limit — a per-user hourly cap on the buddy's CONFIRMED mutations (the
// "hands"). Pairs with the `agencyEnabled` kill switch as the capability ceiling:
// even a confirmed action is refused once the hourly budget is spent.
//
// ASSUMES(single-replica): the `hits` map is module-scope in-memory state (a sliding window per userId) —
// correct for our ONE replica (a locked NOTE, not a bug). IF reversed, the hourly
// budget would multiply by replica count behind a load balancer; the DB-backed replacement seam is then a
// `buddy_rate_limits` table (or a JSON column on `buddies`), checked atomically at confirm. Lives in
// `agency/` (NOT `persistence/`) because it is per-process state, not a query.

import type { UserId } from "@orb/kit/ids";

const MAX_MUTATIONS_PER_HOUR = 12;
const WINDOW_MS = 3_600_000; // 1 hour

const hits = new Map<UserId, number[]>();

/** Returns false when the hourly budget is exhausted (does not consume a slot in that case). */
export function allowMutation(userId: UserId, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_MUTATIONS_PER_HOUR) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}
