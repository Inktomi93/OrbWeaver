// transport/rate-limit — the DB-backed fixed-window rate-limiter PRIMITIVE + the PD-14 per-member COUNT
// budget. Both ride the shared `rate_limit_buckets` table (D35), so the cap is MULTI-REPLICA-correct: the
// per-process `RateLimiterMemory` + the in-proc local-login `Map` gave N× the configured cap under N
// replicas; one shared bucket makes the cap real regardless of which replica answered (transport.md
// esoteric #2). The INSTANCES are constructed at the entry/ composition root (db is required at
// construction) and threaded onto `ctx.rateLimit`; the `enforce{Request,Authed,Public}RateLimit` middleware
// helpers (transport/trpc/rate-limit.ts) CALL these — this file is the mechanism, not the gate.
//
// This is the ONE sanctioned server-side `@orb/db` importer in transport/ (the dep-cruiser
// `drivers-through-domain` rule exempts exactly `transport/rate-limit.ts` — the file path is load-bearing,
// do NOT make it a directory).
//
// LOAD-BEARING (transport.md esoteric #1/#2):
//   • The injectable `now()` is the limiter's ONLY impurity — keep it injectable. The 2026-06-11 auth-routes
//     flake: N rapid attempts straddling a fixed-window boundary split across two buckets and the N+1th
//     never tripped. Tests pin time through this seam instead of racing the wall clock.
//   • Atomic `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + 1 … RETURNING count` — no
//     SELECT-then-UPDATE race; one round-trip yields the post-increment count.
//   • Lazy sweep scoped `WHERE key LIKE 'scope:%' AND expires_at < now` — a prefix range scan on the PK,
//     never a full-table scan — run on BOTH the allowed AND the throttled path (a flood of throttled
//     requests is exactly when stale rows accumulate fastest). Best-effort: a sweep failure is swallowed so
//     it never fails the request.

import type { Db } from "@orb/db";
import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { and, like, lt, sql } from "drizzle-orm";

/** The per-member budget scope tag — its rows share the `rate_limit_buckets` table with the generic
 *  limiters; the `scope:` prefix isolates them lexicographically for the sweep's prefix scan. */
const MEMBER_BUDGET_SCOPE = "member-budget";

/** Config for one named limiter (the bucket-key prefix + the fixed-window cap). */
export interface RateLimitConfig {
  /** Short tag distinguishing this limiter's rows in the shared table — e.g. "login-ip", "public-ip",
   *  "general", "ai-turn". Forms the `scope:` bucket-key prefix the lazy sweep keys its prefix scan on. */
  readonly scope: string;
  /** Max events allowed in one window. */
  readonly points: number;
  /** Window size in ms. Fixed-window: a request at second 0 and one at second 59 share a bucket; the row
   *  resets when the wall clock crosses the next boundary. */
  readonly windowMs: number;
  /** The injected clock seam — the limiter's ONLY impurity. REQUIRED (no ambient `Date.now` — `no-raw-clock`;
   *  entry injects the wall clock, tests pin it). See the file header (esoteric #1) for why. */
  readonly now: () => number;
}

/** A named limiter — consume one point per call. */
export interface RateLimiter {
  /** Consume one point for `id` (an IP, a user handle). Throws {@link DomainRateLimitError} when `id` is
   *  over budget; the error carries `msBeforeNext` (ms until the window resets) and `remainingPoints` (0 on
   *  throw) for Retry-After / X-RateLimit-Remaining. */
  readonly consume: (id: string) => Promise<void>;
}

/** Config for the PD-14 per-member COUNT budget (a fixed-window cap; the cap itself is supplied per-debit
 *  from the AppSettings `nonOwnerLocalComputeBudget` knob — it is admin-flippable at runtime). */
export interface MemberBudgetConfig {
  /** The budget window in ms (e.g. a day). Fixed-window — the count resets at the next boundary. */
  readonly windowMs: number;
  /** The injected clock seam — REQUIRED (no ambient `Date.now`; entry injects the wall clock, tests pin it). */
  readonly now: () => number;
}

/** The PD-14 per-member turn/request COUNT budget — meters ALL backends (hosted $ AND the owner's shared
 *  local compute) against the caller, attributed to `triggeredBy`. The owner-box consent TOGGLE
 *  (`allowNonOwnerLocalCompute`/`allowNonOwnerMaxProSub`, D17) lives in settings + the credential gate; this
 *  budget is the COUNT cap that rides on top once a backend is allowed. */
export interface MemberBudget {
  /**
   * Debit ONE turn/request against `triggeredBy`'s budget. `budget === null` → unbounded (no-op —
   * supervisor-limited, the domain floor). A positive `budget` caps the window. Over budget →
   * {@link DomainRateLimitError}. The caller (the per-chat lock) supplies the resolved cap so a runtime
   * admin flip takes effect on the next turn without reconstructing the limiter.
   */
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
  // Fixed-window: floor(now / windowMs) * windowMs is THIS window's start; the next window mints a new row.
  const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
  const key = `${prefix}${args.id}:${windowStart}`;
  const expiresAt = windowStart + args.windowMs;

  // Atomic INCR (insert-or-update): first hit of a window inserts count=1; subsequent hits increment.
  // RETURNING gives the post-increment count in one round-trip (no SELECT-then-UPDATE race window).
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  const count = rows[0]?.count ?? 1;

  // Lazy sweep: this scope's expired rows only (LIKE 'scope:%' AND expires_at < now) — an indexed prefix
  // range scan. Run BEFORE the over-budget throw so housekeeping happens on the throttled path too. The
  // just-inserted current row's expires_at is `windowStart + windowMs > now`, so it always survives.
  // Best-effort: a sweep failure (DB blip) is swallowed so it never fails the request.
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

/** Construct a named DB-backed limiter. The db is required at construction → the INSTANCE is built at the
 *  entry/ composition root and threaded onto `ctx.rateLimit`. */
export function createRateLimiter(db: Db, cfg: RateLimitConfig): RateLimiter {
  return {
    consume: (id: string): Promise<void> =>
      consumeWindow(db, {
        scope: cfg.scope,
        id,
        points: cfg.points,
        windowMs: cfg.windowMs,
        now: cfg.now(),
      }),
  };
}

/** Construct the PD-14 per-member COUNT budget over the shared bucket table. */
export function createMemberBudget(db: Db, cfg: MemberBudgetConfig): MemberBudget {
  return {
    debit: (triggeredBy: UserId, budget: number | null): Promise<void> => {
      // `null` = unbounded (the domain floor — supervisor-limited). Skip the bucket touch entirely so an
      // unbounded deployment writes no rows.
      if (budget === null) {
        return Promise.resolve();
      }
      return consumeWindow(db, {
        scope: MEMBER_BUDGET_SCOPE,
        id: triggeredBy,
        points: budget,
        windowMs: cfg.windowMs,
        now: cfg.now(),
      });
    },
  };
}
