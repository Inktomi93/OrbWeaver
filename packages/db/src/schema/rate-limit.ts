// schema/rate-limit — the DB-backed fixed-window rate-limiter substrate (producer: transport/rate-limit,
// D35 — this dedicated file replaces the dropped placeholder `schema/runtime.ts`).
//
// One row per (scope, identity, window). The shared table is what makes the cap MULTI-REPLICA-correct:
// the per-process RateLimiterMemory + the in-proc local-login Map gave N× the configured cap under N
// replicas; the shared bucket makes the cap real regardless of which replica answered (transport.md
// esoteric #2). The limiter does an atomic `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + 1
// … RETURNING count` (no SELECT-then-UPDATE race), and a lazy expiry sweep scoped `WHERE key LIKE
// 'scope:%'` (a prefix range scan, never a full-table scan) on both the allowed and the throttled path.
// The limiter INSTANCE is constructed at entry/ (db is required at construction) and threaded onto
// ctx.rateLimit; transport/rate-limit is the one sanctioned server-side @orb/db importer.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  // NATURAL-KEY PK — a plain composite id string `scope:id:windowStart` (NO TypeID brand: this is not an
  // entity, it's a fixed-window counter slot). The `scope:` prefix is load-bearing — the lazy sweep keys
  // its `LIKE 'scope:%'` prefix scan on it, and the windowStart segment rolls the bucket over naturally.
  key: text("key").primaryKey(),
  // Incremented by the atomic upsert; the limiter compares it against the configured cap.
  count: integer("count").notNull().default(0),
  // The window's expiry (ms epoch). Drives Retry-After / msBeforeNext AND the lazy sweep predicate
  // (a row whose expiresAt < now is dead weight, deleted on the next same-scope touch). Set at insert
  // from the injectable `now()` + the window size — no DB default (it is window-relative, not insert-time).
  expiresAt: integer("expires_at").notNull(),
});
