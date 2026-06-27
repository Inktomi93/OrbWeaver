// schema/workloads — the durable bulk-work queue (producer: domain/workloads). One row per long-running
// job; the unit of audit + retry + observability. Rows are NEVER deleted — they accumulate as the
// historical record.
//
// The `kind` + `status` enum columns DERIVE the canonical tuples from `@orb/contracts/workloads` (D34 —
// the axes were promoted out of `domain/workloads/contract` so `@orb/db` can import them; db deps are
// kit + contracts + drizzle only). Each column carries both the drizzle `{ enum }` (type-side) AND a
// CHECK built from the same tuple (SQL-side) — never a re-spelled union. A `.int` test-mirror pins the
// column enum === the contracts tuple (workloads.int.test.ts).
//
// The load-bearing concurrency guard is the `workloads_kind_active` PARTIAL UNIQUE INDEX on (kind) WHERE
// status IN (active) — at most one {queued,running,cancelling} row per kind. It is the cross-replica
// single-active lock (a second start() of an active kind collides at INSERT, no leader election). The
// `WHERE` list is DERIVED from `ACTIVE_WORKLOAD_STATUSES` (sql.raw over the tuple — same no-respell
// discipline as users.ts's role CHECK); the named tuple is the mirror of this predicate and the two
// cannot drift (esoteric #1 — removing `cancelling` wedges the kind forever after a mid-cancel crash).

import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KINDS,
  WORKLOAD_STATUSES,
} from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// The default lifecycle state of a freshly-enqueued row (start() inserts a `queued` row).
const DEFAULT_STATUS = "queued";

// CHECK lists derived from the canonical tuples (NOT re-spelled). A CHECK is static DDL and cannot carry
// bound parameters, so it is built as a raw fragment from the tuple members (users.ts pattern).
const KIND_CHECK_LIST = WORKLOAD_KINDS.map((kind) => `'${kind}'`).join(", ");
const STATUS_CHECK_LIST = WORKLOAD_STATUSES.map((status) => `'${status}'`).join(", ");
// The active-status set the partial unique index keys on — derived from ACTIVE_WORKLOAD_STATUSES so the
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
    // no FK (esoteric #8). Null when the caller supplied no deps.
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
    // The single-active-per-kind lock: at most one {queued,running,cancelling} row per kind. The WHERE
    // list is derived from ACTIVE_WORKLOAD_STATUSES (no hand re-spell). Terminal rows (succeeded/failed/
    // cancelled/worker_died) are NOT covered, so the historical record accumulates freely.
    uniqueIndex("workloads_kind_active")
      .on(table.kind)
      .where(sql.raw(`status in (${ACTIVE_STATUS_LIST})`)),
    // SQL-side enum enforcement derived from the tuples (mirrors the drizzle `{ enum }` type-side).
    check("workloads_kind_check", sql.raw(`kind in (${KIND_CHECK_LIST})`)),
    check("workloads_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
  ],
);
