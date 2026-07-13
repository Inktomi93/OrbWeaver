// domain/workloads/persistence/queries — all `workloads`-table access. Claim is idempotent (status-guarded
// UPDATE; a race loser updates 0 rows). The state machine is linear (terminal transitions are status-guarded
// and report whether they moved the row — no terminal→terminal). `nextRunnableWorkload` tolerates poison
// rows (unrecognized kind → failed in place, never starves the queue) and enforces DAG dependsOn ordering
// (a dep still active → skip; any non-success terminal or absent dep → fail with `dependency_failed`).

import type {
  WorkloadKind,
  WorkloadMode,
  WorkloadSource,
  WorkloadStatus,
} from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { CancelWorkloadResult } from "../contract/params";
import type { WorkloadError } from "../contract/workload-error";
import { parseParamsForKind } from "../contract/workload-params";
import type { WorkloadRowAnyKind } from "../contract/workload-row";

// The terminal states `markTerminal` may stamp (an in-flight → terminal flip).
const TERMINAL_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "worker_died",
] as const satisfies readonly WorkloadStatus[];
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

const isTerminalStatus = (status: WorkloadStatus): status is TerminalStatus =>
  (TERMINAL_STATUSES as readonly WorkloadStatus[]).includes(status);

// The only terminal a dependency may reach for the dependent to run; any other terminal is a dependency failure.
const TERMINAL_SUCCESS_STATUS = "succeeded" as const satisfies WorkloadStatus;

const DEPENDENCY_FAILED_MESSAGE =
  "a dependency did not succeed (a non-success terminal, or an absent dependency) — the dependent cannot run";

/** The verdict for a dependent's `dependsOn` set: `ready` (all deps succeeded), `waiting` (at least one dep
 *  still active), `failed` (fail-fast — a single failed/absent dep short-circuits even if others are active). */
const DEPENDENCY_GATES = ["ready", "waiting", "failed"] as const;
type DependencyGate = (typeof DEPENDENCY_GATES)[number];

async function resolveDependencyGate(
  db: Db,
  dependsOn: readonly WorkloadId[],
): Promise<DependencyGate> {
  const rows = await db
    .select({ id: workloads.id, status: workloads.status })
    .from(workloads)
    .where(inArray(workloads.id, [...dependsOn]));
  let anyActive = false;
  for (const depId of dependsOn) {
    const status = rows.find((row) => row.id === depId)?.status;
    if (status === TERMINAL_SUCCESS_STATUS) {
      continue;
    }
    if (status === undefined || isTerminalStatus(status)) {
      return "failed";
    }
    anyActive = true;
  }
  return anyActive ? "waiting" : "ready";
}

// The in-flight states a heartbeat/terminal/reap UPDATE is guarded on (a queued row has no worker/heartbeat).
const IN_FLIGHT_STATUSES = ["running", "cancelling"] as const satisfies readonly WorkloadStatus[];

const QUEUE_HEAD_WINDOW = 10;
const LIST_HARD_CAP = 500;

interface WorkloadInsert {
  readonly id: WorkloadId;
  readonly kind: WorkloadKind;
  readonly mode: WorkloadMode;
  readonly source: WorkloadSource;
  readonly params: Record<string, unknown>;
  readonly ownerId: UserId | null;
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
}

type WorkloadSelectRow = typeof workloads.$inferSelect;

/** `ownerId: null` filters to system/scheduler rows; `undefined` = no owner filter. */
interface WorkloadListFilter {
  readonly kind?: WorkloadKind;
  readonly status?: WorkloadStatus;
  readonly ownerId?: UserId | null;
  readonly since?: number;
  readonly limit?: number;
}

const isKnownKind = (kind: string): kind is WorkloadKind =>
  (WORKLOAD_KINDS as readonly string[]).includes(kind);

/** Narrow a raw row to the typed `WorkloadRowAnyKind`, or `null` for a poison row (unrecognized kind, or a
 *  params blob that fails its kind schema). The one place the JSON columns are narrowed. */
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
  // TS can't correlate the widened `row.kind` union with the per-kind result — sanctioned cast.
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    mode: row.mode,
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
    mode: row.mode,
    source: row.source,
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

/** The lease tick: bump `updatedAt` for the in-flight statuses (the reaper's stale key). */
export async function heartbeat(db: Db, id: WorkloadId, now: number): Promise<void> {
  await db
    .update(workloads)
    .set({ updatedAt: now })
    .where(and(eq(workloads.id, id), inArray(workloads.status, [...IN_FLIGHT_STATUSES])));
}

/** Stamp a terminal state — status-guarded, returns whether it actually moved the row (a zombie runner whose
 *  row was already reaped writes nothing). `succeeded` is allowed only from `running`; failure terminals move
 *  from either in-flight state. */
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

/** The raw status of one row (`undefined` when absent). */
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

/** Race-safe, idempotent cancel: tries `queued → cancelled`, then `running → cancelling` on 0 rows. No
 *  SELECT-then-act gap — each arm is a status-guarded UPDATE. */
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
  const current = await db
    .select({ status: workloads.status })
    .from(workloads)
    .where(eq(workloads.id, id))
    .limit(1);
  return { status: current[0]?.status === "cancelling" ? "cancelling" : null };
}

/** Fail a queued row in place (poison-row + dependency-failed paths) — `markTerminal` only transitions
 *  from in-flight states. Returns whether it moved. */
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

/** Filtered list (kind/status/owner/since), newest-first, hard-capped 500. Poison rows are filtered out. */
export async function listWorkloads(
  db: Db,
  params: WorkloadListFilter,
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

/** The next runnable row, or `null`. Windows the queue head and returns the first dispatchable row: a
 *  poison row is failed in place (never thrown, to avoid starving the queue on the same head row); a row
 *  whose `dependsOn` gate is `waiting` is skipped, `failed` is failed in place. */
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
    if (view === null) {
      // biome-ignore lint/performance/noAwaitInLoops: poison rows are rare; each must be failed sequentially before the next valid head row is returned.
      await failQueuedRow(db, row.id, `unrecognized or malformed workload kind: ${row.kind}`, now);
      getLog().warn({ workloadId: row.id, kind: row.kind }, "workloads: failed poison queue row");
      continue;
    }
    if (view.dependsOn !== null && view.dependsOn.length > 0) {
      const gate = await resolveDependencyGate(db, view.dependsOn);
      if (gate === "waiting") {
        continue;
      }
      if (gate === "failed") {
        const error: WorkloadError = {
          kind: "dependency_failed",
          message: DEPENDENCY_FAILED_MESSAGE,
        };
        await failQueuedRow(db, view.id, error.message, now);
        getLog().warn(
          { workloadId: view.id, dependsOn: view.dependsOn },
          "workloads: failed dependent — a dependency did not succeed (dependency_failed)",
        );
        continue;
      }
    }
    return view;
  }
  return null;
}

/** In-flight rows whose lease went stale (`updatedAt < staleBefore`) — the reaper's sweep input. */
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
