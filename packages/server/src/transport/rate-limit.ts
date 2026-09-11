// The DB-backed fixed-window rate-limiter primitive + the per-member count budget. Both ride the shared
// rate_limit_buckets table, so the cap is multi-replica-correct: a per-process in-memory limiter gives N×
// the configured cap under N replicas; one shared bucket makes the cap real regardless of which replica
// answered. Instances are constructed at the entry/ composition root and threaded onto ctx.rateLimit.
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
import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { and, like, lt, sql } from "drizzle-orm";

// Its rows share rate_limit_buckets with the generic limiters; the scope: prefix isolates them
// lexicographically for the sweep's prefix scan.
const MEMBER_BUDGET_SCOPE = "member-budget";

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

/** Config for the per-member count budget (a fixed-window cap; the cap itself is supplied per-debit from
 *  an admin-flippable AppSettings knob). `windowMs` is a live getter so an admin retune of the window
 *  (nonOwnerLocalComputeBudgetWindowMs) applies without a restart — matching the per-debit-live cap. */
export interface MemberBudgetConfig {
  readonly windowMs: () => number;
  readonly now: () => number;
}

/** The per-member turn/request count budget — meters all backends against the caller, attributed to
 *  `triggeredBy`. */
export interface MemberBudget {
  /** Debit one turn/request against `triggeredBy`'s budget. `budget === null` → unbounded (no-op). Over
   *  budget → {@link DomainRateLimitError}. */
  readonly debit: (triggeredBy: UserId, budget: number | null) => Promise<void>;
}

/** The atomic fixed-window consume shared by every limiter + the member budget. Increments the
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
  // @swallowed-ok(where): a best-effort expiry GC that runs on EVERY rate-limited request — giving it its own
  // detached root would push one extra trace bucket per request through a 500-entry ring and evict the real
  // traces. A failed sweep is self-healing (the next request re-runs it) and cannot affect the verdict above.
  // Ends if the sweep ever moves off the per-request path (a scheduled job would get its own root).
  // @orb-waive caught-failure-ownership(where): a best-effort expiry GC that runs on EVERY rate-limited request — giving it its own detached root would push one extra trace bucket per request through a 500-entry ring and evict the real traces. A failed sweep is self-healing (the next request re-runs it) and cannot affect the verdict above. Ends if the sweep ever moves off the per-request path (a scheduled job would get its own root).
  void db
    .delete(rateLimitBuckets)
    .where(and(like(rateLimitBuckets.key, `${prefix}%`), lt(rateLimitBuckets.expiresAt, args.now)))
    .catch(() => undefined);

  if (count > args.points) {
    throw new DomainRateLimitError(`rate limit exceeded (${args.scope})`, {
      msBeforeNext: Math.max(1, expiresAt - args.now),
      remainingPoints: 0,
    });
  }
}

/** Construct a named DB-backed limiter. The instance is built at the entry/ composition root and
 *  threaded onto `ctx.rateLimit`. */
export function createRateLimiter(db: Db, cfg: RateLimitConfig): RateLimiter {
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

/** Construct the per-member count budget over the shared bucket table. */
export function createMemberBudget(db: Db, cfg: MemberBudgetConfig): MemberBudget {
  return {
    debit: (triggeredBy: UserId, budget: number | null): Promise<void> => {
      if (budget === null) {
        return Promise.resolve();
      }
      return consumeWindow(db, {
        scope: MEMBER_BUDGET_SCOPE,
        id: triggeredBy,
        points: budget,
        windowMs: cfg.windowMs(),
        now: cfg.now(),
      });
    },
  };
}
