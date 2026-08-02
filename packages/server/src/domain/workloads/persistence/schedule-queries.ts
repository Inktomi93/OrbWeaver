// domain/workloads/persistence/schedule-queries — ALL `workload_schedules` access (the TIME dimension over
// the queue). Queries only; the verbs + the tick hold the logic. The load-bearing properties as physics:
//   • DUE SELECTION — `findDueSchedules` returns `enabled` rows with `next_run_at <= now`; the tick enqueues
//     each + advances it. A disabled row is INVISIBLE to the tick (stays, never fires).
//   • ADVANCE is a plain field write — `advanceSchedule` stamps the next `next_run_at` (= run instant +
//     interval) + `last_run_at`; the tick calls it AFTER the enqueue attempt (even on a benign collision skip),
//     so an overdue schedule jumps forward one interval from NOW (no catch-up storm).
// Determinism: every timestamp write takes the INJECTED `now` (no ambient `Date.now()`).

import type { ScheduleCadence, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloadSchedules } from "@orb/db";
import type { UserId, WorkloadScheduleId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, lte } from "drizzle-orm";
import type { WorkloadScheduleRow } from "../contract/schedule";

/** A new schedule row (file-local; the verb mints `id`, resolves the owner, passes its injected clock). */
interface ScheduleInsert {
  readonly id: WorkloadScheduleId;
  readonly ownerId: UserId;
  readonly kind: WorkloadKind;
  readonly mode: WorkloadMode;
  readonly params: Record<string, unknown>;
  readonly cadence: ScheduleCadence;
  readonly nextRunAt: number;
  readonly enabled: boolean;
  readonly createdAt: number;
}

/** The mutable subset `updateSchedule` may patch (file-local; the verb builds it from the parsed input, and
 *  re-bases `nextRunAt` when the cadence changes). Every field optional — an omitted key is left unchanged. */
interface SchedulePatch {
  readonly kind?: WorkloadKind;
  readonly mode?: WorkloadMode;
  readonly params?: Record<string, unknown>;
  readonly cadence?: ScheduleCadence;
  readonly nextRunAt?: number;
}

type ScheduleSelectRow = typeof workloadSchedules.$inferSelect;

/** The persistence-facing list filter — column predicates only (the verb resolves the server-authoritative
 *  `ownerId` scope BEFORE calling in). `ownerId: undefined` = no owner filter (the deployment-wide view). */
interface ScheduleListFilter {
  readonly ownerId?: UserId;
  readonly kind?: WorkloadKind;
}

/** Map a raw select row to the read projection. The `kind`/`mode`/`cadence` columns are drizzle `{ enum }`
 *  typed (the db CHECK guarantees a stored value is a real member), so no narrowing/poison seam is needed. */
function toScheduleView(row: ScheduleSelectRow): WorkloadScheduleRow {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    mode: row.mode,
    params: row.params,
    cadence: row.cadence,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Insert a fresh schedule row. */
export async function insertSchedule(db: Db, row: ScheduleInsert): Promise<void> {
  await db.insert(workloadSchedules).values({
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    mode: row.mode,
    params: row.params,
    cadence: row.cadence,
    nextRunAt: row.nextRunAt,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
}

/** Load one schedule by id, or `null` (absent). */
// @owner-scope-ok: the `loadWorkload` F3-AUTHZ twin — every caller (`update-schedule`/`set-schedule-enabled`/
// `delete-schedule`) runs `isVisibleToCaller(isAdmin, caller, existing.ownerId)` on the loaded row and
// collapses a foreign id to the same leak-free NOT_FOUND. An ownerId in this WHERE would make the admin arm
// unrepresentable. Ends if the admin arm goes.
export async function loadSchedule(db: Db, id: WorkloadScheduleId): Promise<WorkloadScheduleRow | null> {
  const rows = await db.select().from(workloadSchedules).where(eq(workloadSchedules.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toScheduleView(row);
}

/** Filtered list (owner/kind), newest-first. */
export async function listSchedulesQuery(db: Db, filter: ScheduleListFilter): Promise<WorkloadScheduleRow[]> {
  const predicates: SQL[] = [];
  if (filter.ownerId !== undefined) {
    predicates.push(eq(workloadSchedules.ownerId, filter.ownerId));
  }
  if (filter.kind !== undefined) {
    predicates.push(eq(workloadSchedules.kind, filter.kind));
  }
  const rows = await db
    .select()
    .from(workloadSchedules)
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(desc(workloadSchedules.createdAt));
  return rows.map(toScheduleView);
}

/** Apply a patch to a schedule, returning the updated row (or `null` if the id vanished between the verb's
 *  load and this write — a benign race). Always bumps `updatedAt`. */
// @owner-scope-write-ok: `verbs/update-schedule` — the `loadSchedule` F3-AUTHZ twin above: it loads the row and runs `isVisibleToCaller(ctx.isAdmin, caller, existing.ownerId)`, collapsing a foreign id to the leak-free NOT_FOUND, before this write. An ownerId in this WHERE
// would make the admin arm unrepresentable. Ends if a caller writes a schedule without that check.
export async function updateScheduleFields(db: Db, id: WorkloadScheduleId, patch: SchedulePatch, now: number): Promise<WorkloadScheduleRow | null> {
  const updated = await db
    .update(workloadSchedules)
    .set({
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
      ...(patch.params !== undefined ? { params: patch.params } : {}),
      ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
      ...(patch.nextRunAt !== undefined ? { nextRunAt: patch.nextRunAt } : {}),
      updatedAt: now,
    })
    .where(eq(workloadSchedules.id, id))
    .returning();
  const row = updated[0];
  return row === undefined ? null : toScheduleView(row);
}

/** Flip a schedule's `enabled` flag, returning the updated row (or `null` if it vanished). */
// @owner-scope-write-ok: `verbs/set-schedule-enabled` — the `loadSchedule` F3-AUTHZ twin above: it loads-and-visibility-checks the row first, so a foreign id never reaches this flip. An ownerId in this WHERE
// would make the admin arm unrepresentable. Ends if a caller writes a schedule without that check.
export async function setScheduleEnabledQuery(db: Db, id: WorkloadScheduleId, enabled: boolean, now: number): Promise<WorkloadScheduleRow | null> {
  const updated = await db.update(workloadSchedules).set({ enabled, updatedAt: now }).where(eq(workloadSchedules.id, id)).returning();
  const row = updated[0];
  return row === undefined ? null : toScheduleView(row);
}

/** Delete a schedule by id. Returns whether a row was removed (false = already gone). */
// @owner-scope-write-ok: `verbs/delete-schedule` — the `loadSchedule` F3-AUTHZ twin above: it loads-and-visibility-checks the row first, with NO state change on a foreign or absent id. An ownerId in this WHERE
// would make the admin arm unrepresentable. Ends if a caller writes a schedule without that check.
export async function deleteScheduleRow(db: Db, id: WorkloadScheduleId): Promise<boolean> {
  const removed = await db.delete(workloadSchedules).where(eq(workloadSchedules.id, id)).returning({ id: workloadSchedules.id });
  return removed.length > 0;
}

/** The tick input: every `enabled` schedule that is DUE (`next_run_at <= now`). */
export async function findDueSchedules(db: Db, now: number): Promise<WorkloadScheduleRow[]> {
  const rows = await db
    .select()
    .from(workloadSchedules)
    .where(and(eq(workloadSchedules.enabled, true), lte(workloadSchedules.nextRunAt, now)));
  return rows.map(toScheduleView);
}

/** Advance a schedule after an enqueue attempt: set the next due instant + the last-run stamp. */
// @owner-scope-write-ok: the SCHEDULE-TICK engine plane (D20 un-principal) — the id comes from the tick's own
// `findDueSchedules` enumeration and the write is the engine's own cursor (`next_run_at`/`last_run_at`), not
// user-authored config. There is no principal in scope. Ends if a door advances a schedule.
export async function advanceSchedule(db: Db, id: WorkloadScheduleId, nextRunAt: number, lastRunAt: number): Promise<void> {
  await db.update(workloadSchedules).set({ nextRunAt, lastRunAt, updatedAt: lastRunAt }).where(eq(workloadSchedules.id, id));
}
