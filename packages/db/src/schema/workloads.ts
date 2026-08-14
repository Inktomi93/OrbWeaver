// schema/workloads — the durable bulk-work queue (producer: domain/workloads). One row per long-running
// job; the unit of audit + retry + observability. Rows are NEVER deleted — they accumulate as the
// historical record.
//
// The `kind` + `status` + `mode` + `lane` enum columns DERIVE the canonical tuples from `@orb/contracts/workloads`
// (D34 — the axes were promoted out of `domain/workloads/contract` so `@orb/db` can import them; db deps are
// kit + contracts + drizzle only). Each column carries both the drizzle `{ enum }` (type-side) AND a
// CHECK built from the same tuple (SQL-side) — never a re-spelled union. A `.int` test-mirror pins the
// column enum === the contracts tuple (workloads.int.test.ts).
//
// The load-bearing concurrency guard is a PAIR of PARTIAL UNIQUE INDEXes, split by the run's `mode` column
// (singular vs bulk), each keyed on (kind, admission_key, …):
//   • `workloads_mode_active_singular` — unique on (kind, owner_id, admission_key) WHERE status IN (active)
//     AND mode='singular': at most one active {queued,running,cancelling} SINGULAR row per
//     (kind, owner, admission_key), so two different users each run their OWN index concurrently, but one
//     user can't start a 2nd of the SAME (kind, admission_key).
//   • `workloads_mode_active_bulk` — unique on (kind, admission_key) WHERE status IN (active) AND mode='bulk':
//     the global single-active lock (at most one bulk pass per (kind, admission_key) deployment-wide) — a
//     shared owner-triggered rebuild can't run twice at once.
// `admission_key` is the lock's SUB-PARTITION: the owning domain's declaration of what its CONCURRENCY UNIT
// is, stamped at the enqueue door from `WorkloadContribution.admissionKey(params)`. `index` keys on its embed
// source, so `index{text}` and `index{image}` hold DIFFERENT slots (run CONCURRENTLY) while two same-source
// runs collide; `databank-ingest` keys on its DOCUMENT, so a user seeding a bank ingests every document at
// once while a double-enqueue of ONE document is still refused. A kind that declares nothing carries the
// `none` sentinel — a shared bucket that keeps its lock exactly per-(kind, owner) / per-(kind). It is free
// TEXT, not an enum: a concurrency unit is an entity id as often as it is an axis member, so there is no
// tuple to CHECK against (the type-side guarantee is the contribution's `admissionKey` signature). NOT NULL
// and never empty — SQLite treats NULLs as DISTINCT in a unique index, so a nullable key would silently
// dissolve the lock for every kind that declares none.
// The two WHERE `mode = …` predicates are DISJOINT (every row is exactly one mode), so any row is
// covered by EXACTLY ONE index. Both `WHERE status` lists DERIVE from `ACTIVE_WORKLOAD_STATUSES` (sql.raw over
// the tuple — the same no-respell discipline as users.ts's role CHECK); the named tuple is the mirror of the
// predicate and cannot drift (removing `cancelling` wedges the kind forever after a mid-cancel crash). NOTE: a
// singular row with a NULL owner (a rare system/scheduler trigger) does NOT self-lock — SQLite treats NULLs as
// distinct in a unique index; singular runs are user-triggered (non-null owner) in practice, and runners are
// idempotent.
//
// EXECUTION vs ADMISSION: the two indexes above are ADMISSION (who may hold a slot). The `lane` column is
// EXECUTION — which worker poll loop dispatches the row, so a 20-minute `import-st` sweep never head-blocks
// a user's `databank-ingest`. It is stamped at enqueue from the OWNING domain's `WorkloadContribution.lane`
// (a column, not a claim-time derive, so the assignment survives a restart) and never participates in a lock.

import type { WorkloadProgress } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  DEFAULT_ADMISSION_KEY,
  SCHEDULE_CADENCES,
  WORKLOAD_KINDS,
  WORKLOAD_LANES,
  WORKLOAD_MODES,
  WORKLOAD_STATUSES,
} from "@orb/contracts/workloads";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { users } from "./users.ts";

// The default lifecycle state of a freshly-enqueued row (start() inserts a `queued` row).
const DEFAULT_STATUS = "queued";
// The default run mode (a plain enqueue is a singular, one-owner run; bulk is opt-in + owner-gated).
const DEFAULT_MODE = "singular";
// The default lock sub-partition — the shared `none` bucket a kind that declares no `admissionKey` carries.
const DEFAULT_KEY = DEFAULT_ADMISSION_KEY;
// The default execution lane. `sweep` is the conservative floor: a row whose enqueue path forgot to stamp a
// lane runs on the bulk-maintenance loop and can never squat the latency-sensitive one.
const DEFAULT_LANE = "sweep" as const satisfies (typeof WORKLOAD_LANES)[number];

// CHECK lists derived from the canonical tuples (NOT re-spelled).
const KIND_CHECK_LIST = checkList(WORKLOAD_KINDS);
const STATUS_CHECK_LIST = checkList(WORKLOAD_STATUSES);
const MODE_CHECK_LIST = checkList(WORKLOAD_MODES);
const LANE_CHECK_LIST = checkList(WORKLOAD_LANES);
// The active-status set the partial unique indexes key on — derived from ACTIVE_WORKLOAD_STATUSES so the
// index predicate and the named tuple can never drift.
const ACTIVE_STATUS_LIST = checkList(ACTIVE_WORKLOAD_STATUSES);

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
    // Drives which single-active index a row locks on (singular = per (kind, owner, source); bulk = per
    // (kind, source)).
    mode: text("mode", { enum: WORKLOAD_MODES }).notNull().default(DEFAULT_MODE),
    // The single-active lock SUB-PARTITION — the OWNING domain's declared concurrency unit, stamped at the
    // enqueue door from `WorkloadContribution.admissionKey(params)`. `index` keys on its embed source
    // (text + image reindex concurrently); `databank-ingest` keys on its documentId (every document of a
    // bank ingests at once, one document twice does not); a kind declaring nothing carries the `none`
    // sentinel, a shared bucket → its lock stays per-(kind, owner) / per-(kind). Free TEXT, no CHECK: a
    // concurrency unit is as often an entity id as an axis member (see the header).
    admissionKey: text("admission_key").notNull().default(DEFAULT_KEY),
    // The EXECUTION lane (derives WORKLOAD_LANES; CHECK below mirrors the tuple) — which worker poll loop
    // dispatches the row. Stamped at enqueue from the owning domain's contribution; NOT a lock dimension.
    lane: text("lane", { enum: WORKLOAD_LANES }).notNull().default(DEFAULT_LANE),
    // Per-kind params (the ParamsByKind blob; the runner re-parses against its Zod schema at the read
    // seam). Always an object (a tunable-less kind uses `{}`), so notNull with an empty-object default.
    params: text("params", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    // The terminal result projection (workload-OWNED ResultByKind, not the wrapped verb's return).
    // Null until the row succeeds.
    result: text("result", { mode: "json" }).$type<unknown>(),
    // The DURABLE progress snapshot — the latest `WorkloadProgress` a run reported, written by the SAME
    // UPDATE as the heartbeat (one write path, throttled to the lease cadence). The in-process replay ring
    // is a 60s live-tail smoother; THIS column is the reconnect truth, so a list row renders progress with
    // no subscription open. Null until the run reports (and on every row that never reports).
    progress: text("progress", { mode: "json" }).$type<WorkloadProgress>(),
    // The acting/triggering user (D23 — KEEP: workloads are top-level single-owned). NULLABLE: a
    // scheduler/system-triggered row has no user (the runner maps null → a synthetic "system" id). SET
    // NULL on user delete so the never-deleted audit row outlives the user.
    ownerId: text("owner_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The DAG edges: PERSISTED and ENFORCED AT DISPATCH (`nextRunnableWorkload`'s dependency gate — a dep
    // still active skips the row, a non-success terminal or an absent dep fails it with `dependency_failed`),
    // but deliberately NOT FK-ENFORCED: a plain JSON array of workload ids, so an absent dep is a runtime
    // verdict rather than an insert-time refusal. Null when the caller supplied no deps.
    dependsOn: text("depends_on", { mode: "json" }).$type<readonly WorkloadId[]>(),
    // A human-readable failure reason stamped on the terminal (failed/worker_died) path. Null otherwise.
    error: text("error"),
    // Dispatch DUE-instant + order key: the queue is (status='queued', lane, scheduledAt <= now) ordered
    // earliest-first, so a future-dated value is the "Run at" deferral (the row is invisible to dispatch
    // until its instant), not merely a sort hint. Defaults to now = run as soon as the lane is free.
    scheduledAt: integer("scheduled_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Enqueue time — the stable creation timestamp `list` orders newest-first + filters `since` on
    // (scheduledAt may be future-dated, so it can't double as the audit clock).
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The heartbeat: bumped on every in-flight lease tick; the reaper's stale-threshold key (a dead
    // worker stops bumping → the row is reaped to worker_died, freeing the kind's active slot).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // SINGULAR lock: at most one active {queued,running,cancelling} SINGULAR row per
    // (kind, owner_id, admission_key) — two users each run their own instance concurrently; one user can't
    // start a 2nd of the same (kind, admission_key), but CAN run two units of the same kind at once
    // (index{text} + index{image}; two databank documents). Rows of a kind that declares no key all carry
    // `none`, so this stays per-(kind, owner) for them. Partitioned by the `mode` column (disjoint from the
    // bulk index). Terminal rows are NOT covered.
    uniqueIndex("workloads_mode_active_singular")
      .on(table.kind, table.ownerId, table.admissionKey)
      .where(sql.raw(`status in (${ACTIVE_STATUS_LIST}) and mode = 'singular'`)),
    // BULK lock: the global single-active lock (at most one bulk pass per (kind, admission_key)
    // deployment-wide). An owner-triggered shared rebuild/create can't run twice at once; an `index` bulk over
    // text + one over image still run concurrently (distinct key). Keyless kinds carry `none` → per-(kind).
    uniqueIndex("workloads_mode_active_bulk")
      .on(table.kind, table.admissionKey)
      .where(sql.raw(`status in (${ACTIVE_STATUS_LIST}) and mode = 'bulk'`)),
    // The owner FK's SET-NULL parent scan + the owner-scoped `list`. Both active-lock uniques LEAD with
    // `kind`, and SQLite only uses an index whose LEFTMOST column is the constrained one — plus both are
    // PARTIAL (terminal rows excluded), so neither can serve the delete that must touch every row of a
    // never-deleted audit log (`fk-columns-indexed` gate).
    index("workloads_owner_idx").on(table.ownerId),
    // SQL-side enum enforcement derived from the tuples (mirrors the drizzle `{ enum }` type-side).
    check("workloads_kind_check", sql.raw(`kind in (${KIND_CHECK_LIST})`)),
    check("workloads_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
    check("workloads_mode_check", sql.raw(`mode in (${MODE_CHECK_LIST})`)),
    check("workloads_lane_check", sql.raw(`lane in (${LANE_CHECK_LIST})`)),
  ],
);

// The recurring-execution schedule (the TIME dimension complementing the `dependsOn` DAG): one row per
// standing "run this workload every <cadence>" order. UNLIKE `workloads` (a never-deleted audit log), a
// schedule is LIVE CONFIG — it is mutated (enable/disable, retune) and DELETED, and CASCADE-drops with its
// owner (an orphaned schedule would keep enqueuing forever). The scheduler tick (single-replica; the
// `assumes-single-replica` stance) finds `enabled` rows with `next_run_at <= now`, ENQUEUES a `workloads`
// row through the normal start/enqueue path (so the run still flows through dispatch + the single-active
// lock + the DAG), then advances `next_run_at` (= `last_run_at + interval`) and stamps `last_run_at`. The
// per-run ADMISSION KEY is NOT a column here — it is derived from `params` by the kind's contribution,
// resolved at enqueue exactly like a manual start.
const CADENCE_CHECK_LIST = checkList(SCHEDULE_CADENCES);

export const workloadSchedules = sqliteTable(
  "workload_schedules",
  {
    // TypeID PK (`workload_schedule_…`); the brand is type-only, SQL is plain TEXT.
    id: text("id").$type<WorkloadScheduleId>().primaryKey(),
    // The owning user — the F3 permission + enqueue scope. NOT NULL + CASCADE: a schedule is live config
    // (not an audit row), so it dies with its owner rather than orphaning into an ownerless auto-enqueue.
    // A SINGULAR schedule enqueues for THIS owner; a BULK schedule is box-owner-owned (the tick still
    // enqueues the deployment-wide sweep — the owner here is the permission subject, not the sweep scope).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The workload kind this schedule enqueues — derives WORKLOAD_KINDS (D34); CHECK below mirrors the tuple.
    kind: text("kind", { enum: WORKLOAD_KINDS }).notNull(),
    // The run mode the enqueued workload uses (`singular` for a user's own maintenance; `bulk` for a
    // box-owner deployment cadence) — derives WORKLOAD_MODES; CHECK mirrors the tuple.
    mode: text("mode", { enum: WORKLOAD_MODES }).notNull().default(DEFAULT_MODE),
    // The workload params the run enqueues (the `ParamsByKind` blob, incl. the `index` kind's `source`). The
    // tick passes this straight into `start`; the runner re-parses against its Zod schema. Always an object.
    params: text("params", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    // The recurring cadence — derives SCHEDULE_CADENCES; the tick advances `next_run_at` by its interval.
    cadence: text("cadence", { enum: SCHEDULE_CADENCES }).notNull(),
    // The next due instant (epoch ms). The tick dispatches every `enabled` row with `next_run_at <= now`.
    nextRunAt: integer("next_run_at").notNull(),
    // The last instant the tick enqueued from this schedule (null until it first fires). The advance base.
    lastRunAt: integer("last_run_at"),
    // Whether the tick considers this schedule (a paused schedule stays but never enqueues). Defaults on.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // The owner CASCADE parent + the per-owner schedule list: SQLite auto-indexes no child FK, so a user
    // hard-delete would scan every schedule (`fk-columns-indexed` gate).
    index("workload_schedules_owner_idx").on(table.ownerId),
    check("workload_schedules_kind_check", sql.raw(`kind in (${KIND_CHECK_LIST})`)),
    check("workload_schedules_mode_check", sql.raw(`mode in (${MODE_CHECK_LIST})`)),
    check("workload_schedules_cadence_check", sql.raw(`cadence in (${CADENCE_CHECK_LIST})`)),
  ],
);
