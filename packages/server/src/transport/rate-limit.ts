// The DB-backed fixed-window rate-limiter primitive. It rides the shared rate_limit_buckets table, so the
// cap is multi-replica-correct: a per-process in-memory limiter gives N× the configured cap under N
// replicas; one shared bucket makes the cap real regardless of which replica answered. Instances are
// constructed at the entry/ composition root and threaded onto ctx.rateLimit.
//
// The per-member COUNT budget that also rode this table was DELETED with D17's "local compute shared with
// authenticated principals, count-budgeted" clause (@orb/inference §14 F11, owner word 2026-09-19).
//
// This is the one sanctioned server-side @orb/db importer in transport/ (dep-cruiser exempts exactly this
// file path — do not make it a directory).
//
// The injectable now() is the limiter's only impurity: N rapid attempts straddling a fixed-window
// boundary must split deterministically, not race the wall clock. Atomic INSERT … ON CONFLICT DO UPDATE
// … RETURNING count avoids a SELECT-then-UPDATE race. The lazy sweep runs on both the allowed and
// throttled path (a flood of throttled requests is exactly when stale rows accumulate fastest) and is
// best-effort — a sweep failure never fails the request.

import type { Db } from "@orb/db";
import { rateLimitBuckets } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { DomainRateLimitError } from "@orb/kit/errors";
import { and, like, lt, sql } from "drizzle-orm";
import { getLog } from "#foundation/observability";

export interface RateLimitConfig {
  /** Short tag distinguishing this limiter's rows in the shared table — e.g. "login-ip", "public-ip". */
  readonly scope: string;
  /** The cap. A thunk is read PER consume so an admin-flippable AppSettings cap (the tRPC gate's buckets)
   *  takes effect on the next request; a plain number is a fixed floor (the login throttle). */
  readonly points: number | (() => number);
  /** Window size in ms. Fixed-window: a request at second 0 and one at second 59 share a bucket. */
  readonly windowMs: number;
  readonly now: () => number;
}

export interface RateLimiter {
  /** Consume one point for `id`. Throws {@link DomainRateLimitError} when over budget; the error carries
   *  `msBeforeNext` and `remainingPoints` for Retry-After / X-RateLimit-Remaining. */
  readonly consume: (id: string) => Promise<void>;
}

/** The atomic fixed-window consume every limiter shares. Increments the
 *  `(scope, id, windowStart)` bucket and throws when the post-increment count exceeds `points`. */
async function consumeWindow(
  db: Db,
  args: {
    readonly scope: string;
    readonly id: string;
    readonly points: number;
    readonly windowMs: number;
    readonly now: number;
  },
): Promise<void> {
  const prefix = `${args.scope}:`;
  const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
  const key = `${prefix}${args.id}:${windowStart}`;
  const expiresAt = windowStart + args.windowMs;

  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  const count = rows[0]?.count ?? 1;

  // The just-inserted current row's expires_at is windowStart + windowMs > now, so it always survives.
  // Best-effort and detached: a failed sweep cannot change the verdict above and the next request re-runs it, so
  // the failure goes to the operator log and is dropped. It gets no detached root of its own: that would push one
  // extra trace bucket per request through the 500-entry ring and evict the real traces.
  void db
    .delete(rateLimitBuckets)
    .where(and(like(rateLimitBuckets.key, `${prefix}%`), lt(rateLimitBuckets.expiresAt, args.now)))
    .catch((error: unknown) => {
      getLog().warn({ err: error, scope: args.scope }, "rate-limit: expiry sweep failed");
    });

  if (count > args.points) {
    throw new DomainRateLimitError(`rate limit exceeded (${args.scope})`, {
      msBeforeNext: Math.max(1, expiresAt - args.now),
      remainingPoints: 0,
    });
  }
}

/** Construct a named DB-backed limiter. The instance is built at the entry/ composition root and
 *  threaded onto `ctx.rateLimit`. */
export function createRateLimiter(handle: DatabaseHandle, cfg: RateLimitConfig): RateLimiter {
  const db = databaseForOwner(handle);
  return {
    consume: (id: string): Promise<void> =>
      consumeWindow(db, {
        scope: cfg.scope,
        id,
        points: typeof cfg.points === "function" ? cfg.points() : cfg.points,
        windowMs: cfg.windowMs,
        now: cfg.now(),
      }),
  };
}
