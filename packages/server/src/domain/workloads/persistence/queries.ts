// domain/workloads/persistence/queries — ALL `workloads`-table access (queries only; the verbs + engine
// hold the logic). The load-bearing properties live HERE as physics:
//   • CLAIM is idempotent — `markStarted` is `UPDATE … WHERE id=? AND status='queued'`; the loser of a
//     two-worker race updates 0 rows (returns false) and polls the next row.
//   • The STATE MACHINE is linear — `markTerminal`/`markCancelling`/`failQueuedRow` are STATUS-GUARDED and
//     report whether they actually moved the row (a returned boolean / a transition). A zombie runner whose
//     row was already reaped finds the predicate false, writes NOTHING; no terminal→terminal.
//   • POISON-ROW tolerance — `nextRunnableWorkload` windows the queue head (limit 10) and FAILS an
//     unrecognized-`kind` row in place via `failQueuedRow` instead of starving the queue; `toView` mirrors
//     this on the read path (a legacy/renamed kind → `null`, filtered, never 500s `list`).
// Determinism: every timestamp write takes the INJECTED `now` (no ambient `Date.now()` / db-clock default on
// the write path). The typed projection `toView` lives here (it touches the row); the TYPE is in `contract/`.

import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { CancelWorkloadResult, ListWorkloadsParams } from "../contract/params";
import { parseParamsForKind } from "../contract/workload-params";
import type { WorkloadRowAnyKind } from "../contract/workload-row";

// The terminal states `markTerminal` may stamp (an in-flight → terminal flip). `cancelled` is handled by the
// engine pin (cancelling → cancelled); the reaper stamps `worker_died`; the dispatcher stamps the rest.
// Declared as a derived tuple (not an inline union — §7.5 no-inline-union-redecl); `satisfies` pins every
// member as a real `WorkloadStatus`.
const TERMINAL_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "worker_died",
] as const satisfies readonly WorkloadStatus[];
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

// The in-flight states a heartbeat/terminal/reap UPDATE is guarded on (the lease holders). Derived from the
// active set MINUS `queued` — a queued row is not in-flight (it has no worker/heartbeat).
const IN_FLIGHT_STATUSES = ["running", "cancelling"] as const satisfies readonly WorkloadStatus[];

// The poison-tolerance window: how many queue-head rows `nextRunnableWorkload` scans past unrecognized kinds.
const QUEUE_HEAD_WINDOW = 10;
const LIST_HARD_CAP = 500;

/** A new queued row (file-local; the verb mints `id`, parses `params`, passes its injected clock). */
interface WorkloadInsert {
  readonly id: WorkloadId;
  readonly kind: WorkloadKind;
  readonly params: Record<string, unknown>;
  readonly ownerId: UserId | null;
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
}

/** The raw Drizzle select row (the JSON columns are still `unknown`/`Record` before `toView` narrows them). */
type WorkloadSelectRow = typeof workloads.$inferSelect;

const isKnownKind = (kind: string): kind is WorkloadKind =>
  (WORKLOAD_KINDS as readonly string[]).includes(kind);

/**
 * Narrow a raw row to the typed `WorkloadRowAnyKind`, or `null` for a POISON row (a `kind` this build doesn't
 * ship, or a `params` blob that fails its kind schema — deploy skew). The ONE place the JSON columns are
 * narrowed against the discriminator, so no consumer casts.
 */
export function toView(row: WorkloadSelectRow): WorkloadRowAnyKind | null {
  if (!isKnownKind(row.kind)) {
    return null;
  }
  let params: Record<string, unknown>;
  try {
    params = parseParamsForKind(row.kind, row.params) as Record<string, unknown>;
  } catch {
    return null;
  }
  // The discriminator is validated (kind known + params parsed); the assembled object IS a valid
  // `WorkloadRow<kind>` but TS can't correlate `row.kind` (a widened union) with the per-kind result — the
  // single sanctioned cast for the typed projection (same seam as chat's `LoadedChat`).
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    params,
    result: row.result ?? null,
    ownerId: row.ownerId,
    dependsOn: row.dependsOn ?? null,
    error: row.error,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as WorkloadRowAnyKind;
}

/** Insert a fresh `queued` row. The single-active partial unique index may reject it — the caller
 *  (`start`/`retry`) catches the violation via `isActiveKindUniqueViolation` → `DomainConflictError`. */
export async function insertWorkload(db: Db, row: WorkloadInsert): Promise<void> {
  await db.insert(workloads).values({
    id: row.id,
    kind: row.kind,
    params: row.params,
    ownerId: row.ownerId,
    dependsOn: row.dependsOn,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
}

/** The idempotent claim: `queued → running`. Returns `false` (0 rows) for the loser of a two-worker race. */
export async function markStarted(db: Db, id: WorkloadId, now: number): Promise<boolean> {
  const moved = await db
    .update(workloads)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** The lease tick: bump `updatedAt` for the in-flight statuses (the reaper's stale key). Also the progress
 *  liveness bump (the row carries no progress column — progress fans out on the bus, not the table). */
export async function heartbeat(db: Db, id: WorkloadId, now: number): Promise<void> {
  await db
    .update(workloads)
    .set({ updatedAt: now })
    .where(and(eq(workloads.id, id), inArray(workloads.status, [...IN_FLIGHT_STATUSES])));
}

/**
 * Stamp a terminal state — STATUS-GUARDED. Returns whether it actually moved the row: a zombie runner whose
 * row was already reaped finds the predicate false → returns `false`, writes NOTHING (the
 * reaper-vs-zombie guard). The guard is status-specific to keep the machine LINEAR: `succeeded` is allowed
 * ONLY from `running` (a `cancelling` row can never flip to `succeeded` — the engine pins it to `cancelled`
 * instead); the failure terminals (`failed`/`cancelled`/`worker_died`) move from EITHER
 * in-flight state. `succeeded` carries the result JSON; the failure terminals carry an `error` string.
 */
export async function markTerminal(
  db: Db,
  args: {
    id: WorkloadId;
    status: TerminalStatus;
    result?: unknown;
    error?: string;
    now: number;
  },
): Promise<boolean> {
  const guard: WorkloadStatus[] =
    args.status === "succeeded" ? ["running"] : [...IN_FLIGHT_STATUSES];
  const moved = await db
    .update(workloads)
    .set({
      status: args.status,
      result: args.result ?? null,
      error: args.error ?? null,
      updatedAt: args.now,
    })
    .where(and(eq(workloads.id, args.id), inArray(workloads.status, guard)))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** The raw status of one row (`undefined` when absent) — the cancel-poll's cheap read (no `toView`). */
export async function loadWorkloadStatus(
  db: Db,
  id: WorkloadId,
): Promise<WorkloadStatus | undefined> {
  const rows = await db
    .select({ status: workloads.status })
    .from(workloads)
    .where(eq(workloads.id, id))
    .limit(1);
  return rows[0]?.status;
}

/**
 * Race-safe, idempotent cancel. Tries the QUEUED arm first (`queued → cancelled`); on 0 rows (the row
 * flipped to running between calls) tries the RUNNING arm (`running → cancelling`). An already-`cancelling`
 * row returns `cancelling` (idempotent); a terminal/absent row returns `null` (a no-op). No SELECT-then-act
 * gap — each arm is a status-guarded UPDATE.
 */
export async function markCancelling(
  db: Db,
  id: WorkloadId,
  now: number,
): Promise<CancelWorkloadResult> {
  const cancelledQueued = await db
    .update(workloads)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  if (cancelledQueued.length > 0) {
    return { status: "cancelled" };
  }
  const cancellingRunning = await db
    .update(workloads)
    .set({ status: "cancelling", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "running")))
    .returning({ id: workloads.id });
  if (cancellingRunning.length > 0) {
    return { status: "cancelling" };
  }
  // Neither arm moved: either already cancelling (idempotent) or terminal/absent (no-op).
  const current = await db
    .select({ status: workloads.status })
    .from(workloads)
    .where(eq(workloads.id, id))
    .limit(1);
  return { status: current[0]?.status === "cancelling" ? "cancelling" : null };
}

/** Fail a QUEUED row in place (the poison-row path). `markTerminal` only transitions from in-flight states,
 *  so a never-claimed poison row needs this guarded `queued → failed`. Returns whether it moved. */
export async function failQueuedRow(
  db: Db,
  id: WorkloadId,
  error: string,
  now: number,
): Promise<boolean> {
  const moved = await db
    .update(workloads)
    .set({ status: "failed", error, updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** Load one typed row by id, or `null` (absent OR poison). */
export async function loadWorkload(db: Db, id: WorkloadId): Promise<WorkloadRowAnyKind | null> {
  const rows = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toView(row);
}

/** Filtered list (kind/status/owner/since), newest-first, hard-capped 500. Poison rows are filtered (never
 *  500s the read). `ownerId: null` filters to system/scheduler rows; `undefined` applies no owner filter. */
export async function listWorkloads(
  db: Db,
  params: ListWorkloadsParams,
): Promise<WorkloadRowAnyKind[]> {
  const filters: SQL[] = [];
  if (params.kind !== undefined) {
    filters.push(eq(workloads.kind, params.kind));
  }
  if (params.status !== undefined) {
    filters.push(eq(workloads.status, params.status));
  }
  if (params.ownerId === null) {
    filters.push(isNull(workloads.ownerId));
  } else if (params.ownerId !== undefined) {
    filters.push(eq(workloads.ownerId, params.ownerId));
  }
  if (params.since !== undefined) {
    filters.push(gte(workloads.createdAt, params.since));
  }
  const limit = Math.min(params.limit ?? LIST_HARD_CAP, LIST_HARD_CAP);
  const rows = await db
    .select()
    .from(workloads)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(workloads.createdAt))
    .limit(limit);
  return rows.flatMap((row) => {
    const view = toView(row);
    return view === null ? [] : [view];
  });
}

/**
 * The next runnable row, or `null`. Windows the queue head (`status='queued'`, oldest first) and returns the
 * first VALID row; an unrecognized-`kind` poison row inside the window is FAILED in place (not thrown — a
 * throw would back the worker off and re-poll the same oldest row forever, starving the queue). Dispatch is
 * purely `(scheduledAt, createdAt)` order — `dependsOn` is NOT enforced.
 */
export async function nextRunnableWorkload(
  db: Db,
  now: number,
): Promise<WorkloadRowAnyKind | null> {
  const head = await db
    .select()
    .from(workloads)
    .where(eq(workloads.status, "queued"))
    .orderBy(asc(workloads.scheduledAt), asc(workloads.createdAt))
    .limit(QUEUE_HEAD_WINDOW);
  for (const row of head) {
    const view = toView(row);
    if (view !== null) {
      return view;
    }
    // Poison row (unknown kind / bad params): fail it in place so the next valid row can proceed.
    // biome-ignore lint/performance/noAwaitInLoops: poison rows are rare; each must be failed (sequentially) before the next valid head row is returned — Promise.all would fail unrelated rows concurrently for no benefit.
    await failQueuedRow(db, row.id, `unrecognized or malformed workload kind: ${row.kind}`, now);
    getLog().warn({ workloadId: row.id, kind: row.kind }, "workloads: failed poison queue row");
  }
  return null;
}

/** In-flight rows whose lease went stale (`updatedAt < staleBefore`) — the reaper's sweep input. Poison
 *  in-flight rows (should not occur — a claimed row's kind was known at claim) are filtered by `toView`. */
export async function findStaleInFlight(
  db: Db,
  staleBefore: number,
): Promise<WorkloadRowAnyKind[]> {
  const rows = await db
    .select()
    .from(workloads)
    .where(
      and(inArray(workloads.status, [...IN_FLIGHT_STATUSES]), lt(workloads.updatedAt, staleBefore)),
    );
  return rows.flatMap((row) => {
    const view = toView(row);
    return view === null ? [] : [view];
  });
}
