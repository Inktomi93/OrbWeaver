// schema/workloads — the durable bulk-work queue (producer: domain/workloads). One row per long-running
// job; the unit of audit + retry + observability. Rows are NEVER deleted — they accumulate as the
// historical record.
//
// The `kind` + `status` + `mode` enum columns DERIVE the canonical tuples from `@orb/contracts/workloads`
// (D34 — the axes were promoted out of `domain/workloads/contract` so `@orb/db` can import them; db deps are
// kit + contracts + drizzle only). Each column carries both the drizzle `{ enum }` (type-side) AND a
// CHECK built from the same tuple (SQL-side) — never a re-spelled union. A `.int` test-mirror pins the
// column enum === the contracts tuple (workloads.int.test.ts).
//
// The load-bearing concurrency guard is a PAIR of PARTIAL UNIQUE INDEXes, split by the run's `mode` column
// (singular vs bulk):
//   • `workloads_mode_active_singular` — unique on (kind, owner_id) WHERE status IN (active) AND
//     mode='singular': at most one active {queued,running,cancelling} SINGULAR row per (kind, owner), so two
//     different users each run their OWN embed-corpus concurrently, but one user can't start a 2nd.
//   • `workloads_mode_active_bulk` — unique on (kind) WHERE status IN (active) AND mode='bulk': the global
//     single-active lock (at most one bulk pass per kind deployment-wide) — a shared owner-triggered rebuild
//     can't run twice at once.
// The two WHERE `mode = …` predicates are DISJOINT (every row is exactly one mode), so any row is covered by
// EXACTLY ONE index. Both `WHERE status` lists DERIVE from `ACTIVE_WORKLOAD_STATUSES` (sql.raw over the tuple
// — the same no-respell discipline as users.ts's role CHECK); the named tuple is the mirror of the predicate
// and cannot drift (removing `cancelling` wedges the kind forever after a mid-cancel crash). NOTE: a singular
// row with a NULL owner (a rare system/scheduler trigger) does NOT self-lock — SQLite treats NULLs as distinct
// in a unique index; singular runs are user-triggered (non-null owner) in practice, and runners are idempotent.

import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_STATUSES,
} from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// The default lifecycle state of a freshly-enqueued row (start() inserts a `queued` row).
const DEFAULT_STATUS = "queued";
// The default run mode (a plain enqueue is a singular, one-owner run; bulk is opt-in + owner-gated).
const DEFAULT_MODE = "singular";

// CHECK lists derived from the canonical tuples (NOT re-spelled). A CHECK is static DDL and cannot carry
// bound parameters, so it is built as a raw fragment from the tuple members (users.ts pattern).
const KIND_CHECK_LIST = WORKLOAD_KINDS.map((kind) => `'${kind}'`).join(", ");
const STATUS_CHECK_LIST = WORKLOAD_STATUSES.map((status) => `'${status}'`).join(", ");
const MODE_CHECK_LIST = WORKLOAD_MODES.map((mode) => `'${mode}'`).join(", ");
// The active-status set the partial unique indexes key on — derived from ACTIVE_WORKLOAD_STATUSES so the
// index predicate and the named tuple can never drift.
const ACTIVE_STATUS_LIST = ACTIVE_WORKLOAD_STATUSES.map((status) => `'${status}'`).join(", ");

export const workloads = sqliteTable(
  "workloads",
  {
    // TypeID PK (`workload_…`); the brand is type-only, SQL is plain TEXT.
    id: text("id").$type<WorkloadId>().primaryKey(),
    // The bulk-work kind — derives WORKLOAD_KINDS (D34); CHECK below mirrors the tuple.
    kind: text("kind", { enum: WORKLOAD_KINDS }).notNull(),
    // The lifecycle state — derives WORKLOAD_STATUSES (D34); defaults to `queued` at enqueue.
    status: text("status", { enum: WORKLOAD_STATUSES }).notNull().default(DEFAULT_STATUS),
    // The run mode — derives WORKLOAD_MODES; `singular` (one owner) vs `bulk` (owner-triggered global/create).
    // Drives which single-active index a row locks on (singular = per (kind, owner); bulk = per (kind)).
    mode: text("mode", { enum: WORKLOAD_MODES }).notNull().default(DEFAULT_MODE),
    // Per-kind params (the ParamsByKind blob; the runner re-parses against its Zod schema at the read
    // seam). Always an object (a tunable-less kind uses `{}`), so notNull with an empty-object default.
    params: text("params", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    // The terminal result projection (workload-OWNED ResultByKind, not the wrapped verb's return).
    // Null until the row succeeds.
    result: text("result", { mode: "json" }).$type<unknown>(),
    // The acting/triggering user (D23 — KEEP: workloads are top-level single-owned). NULLABLE: a
    // scheduler/system-triggered row has no user (the runner maps null → a synthetic "system" id). SET
    // NULL on user delete so the never-deleted audit row outlives the user.
    ownerId: text("owner_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // Forward-compat DAG hint: PERSISTED but NOT FK-ENFORCED (dispatch is purely (status='queued',
    // scheduledAt) order; start/retry warn at the seam). A plain JSON array of workload ids — deliberately
    // no FK. Null when the caller supplied no deps.
    dependsOn: text("depends_on", { mode: "json" }).$type<readonly WorkloadId[]>(),
    // A human-readable failure reason stamped on the terminal (failed/worker_died) path. Null otherwise.
    error: text("error"),
    // Dispatch order key (the queue is (status='queued', scheduledAt) — earliest first). Defaults to now.
    scheduledAt: integer("scheduled_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Enqueue time — the stable creation timestamp `list` orders newest-first + filters `since` on
    // (scheduledAt may be future-dated, so it can't double as the audit clock).
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The heartbeat: bumped on every in-flight lease tick; the reaper's stale-threshold key (a dead
    // worker stops bumping → the row is reaped to worker_died, freeing the kind's active slot).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // SINGULAR lock: at most one active {queued,running,cancelling} SINGULAR row per (kind, owner_id) — two
    // users each run their own instance concurrently; one user can't start a 2nd of the same kind. Partitioned
    // by the `mode` column (disjoint from the bulk index). Terminal rows are NOT covered.
    uniqueIndex("workloads_mode_active_singular")
      .on(table.kind, table.ownerId)
      .where(sql.raw(`status in (${ACTIVE_STATUS_LIST}) and mode = 'singular'`)),
    // BULK lock: the global single-active lock (at most one bulk pass per kind deployment-wide) on (kind).
    // An owner-triggered shared rebuild/create can't run twice at once.
    uniqueIndex("workloads_mode_active_bulk")
      .on(table.kind)
      .where(sql.raw(`status in (${ACTIVE_STATUS_LIST}) and mode = 'bulk'`)),
    // SQL-side enum enforcement derived from the tuples (mirrors the drizzle `{ enum }` type-side).
    check("workloads_kind_check", sql.raw(`kind in (${KIND_CHECK_LIST})`)),
    check("workloads_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
    check("workloads_mode_check", sql.raw(`mode in (${MODE_CHECK_LIST})`)),
  ],
);
