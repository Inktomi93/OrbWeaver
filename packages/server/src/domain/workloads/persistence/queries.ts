// domain/workloads/persistence/queries — all `workloads`-table access. Claim is idempotent (status-guarded
// UPDATE; a race loser updates 0 rows). The state machine is linear (terminal transitions are status-guarded
// and report whether they moved the row — no terminal→terminal). `nextRunnableWorkload` is LANE-SCOPED (one
// poll loop per execution lane, so a long sweep never head-blocks an interactive row), enforces the
// `scheduledAt` DEFERRAL gate (a future-dated "Run at" row is not even in the head window until its instant),
// tolerates poison rows (unrecognized kind OR unparseable params → failed in place, never starves the queue)
// and enforces DAG dependsOn ordering (a dep still active → skip; any non-success terminal or absent dep →
// fail with `dependency_failed`). Its scan is cursor-paged through the complete due queue — the page size
// bounds each read, never admission — and reports each successful fail-in-place through an injected sink
// after the UPDATE settles. The engine owns the canonical bus emission; persistence remains bus-free.
//
// The READ path is poison-VISIBLE where the dispatch path is poison-refusing: `toView` surfaces an
// unparseable-params row as `{params: null, poison: true}` (a visibly-broken, cancel/retry-able row) instead
// of silently dropping it, while `nextRunnableWorkload` returns only `WorkloadRunnableRow`s.

import type { WorkloadError, WorkloadKind, WorkloadLane, WorkloadMode, WorkloadProgress, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES, WORKLOAD_KINDS, WORKLOAD_LIST_MAX_LIMIT } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { WorkloadContributions } from "../contract/contribution.ts";
import type { CancelWorkloadResult } from "../contract/params.ts";
import type { WorkloadInFlightRow, WorkloadQueueFailureSink, WorkloadRowAnyKind, WorkloadRunnableRow } from "../contract/workload-row.ts";

// The terminal states `markTerminal` may stamp (an in-flight → terminal flip).
const TERMINAL_STATUSES = ["succeeded", "failed", "cancelled", "worker_died"] as const satisfies readonly WorkloadStatus[];
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

const isTerminalStatus = (status: WorkloadStatus): status is TerminalStatus => (TERMINAL_STATUSES as readonly WorkloadStatus[]).includes(status);

// The only terminal a dependency may reach for the dependent to run; any other terminal is a dependency failure.
const TERMINAL_SUCCESS_STATUS = "succeeded" as const satisfies WorkloadStatus;

const DEPENDENCY_FAILED_MESSAGE = "a dependency did not succeed (a non-success terminal, or an absent dependency) — the dependent cannot run";

/** The verdict for a dependent's `dependsOn` set: `ready` (all deps succeeded), `waiting` (at least one dep
 *  still active), `failed` (fail-fast — a single failed/absent dep short-circuits even if others are active). */
const DEPENDENCY_GATES = ["ready", "waiting", "failed"] as const;
type DependencyGate = (typeof DEPENDENCY_GATES)[number];

// @orb-waive owner-scoped-reads(workloads): the ENGINE plane, not a door — the ids are a row's own persisted `dependsOn` set and the read returns statuses the scheduler needs to decide runnability. Owner-scoping it would deadlock a dependent whose dependency is (legitimately) another principal's row. Ends if `dependsOn` ever becomes caller-authored across owners without a validation rung.
async function resolveDependencyGate(db: Db, dependsOn: readonly WorkloadId[]): Promise<DependencyGate> {
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

const QUEUE_SCAN_PAGE_SIZE = 10;
// The internal-caller backstop; the shared ceiling `WORKLOAD_LIST_MAX_LIMIT` (`@orb/contracts/workloads`) is
// also the transport `.max()` trust boundary, so the wire refusal and this hard cap never drift.

interface WorkloadInsert {
  readonly id: WorkloadId;
  readonly kind: WorkloadKind;
  readonly mode: WorkloadMode;
  /** The lock sub-partition, resolved at the enqueue door from the kind's contribution (never client input). */
  readonly admissionKey: string;
  /** The execution lane, resolved at the enqueue door from the kind's contribution (never client input). */
  readonly lane: WorkloadLane;
  readonly params: Record<string, unknown>;
  readonly ownerId: UserId | null;
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
}

type WorkloadSelectRow = typeof workloads.$inferSelect;

interface QueueScanInput {
  readonly db: Db;
  readonly contributions: WorkloadContributions;
  readonly now: number;
  readonly lane: WorkloadLane;
  readonly onFailure: WorkloadQueueFailureSink;
}

type QueueCursor = Pick<WorkloadSelectRow, "scheduledAt" | "createdAt" | "id">;

/** `ownerId: null` filters to system/scheduler rows; `undefined` = no owner filter. */
interface WorkloadListFilter {
  readonly kind?: WorkloadKind;
  readonly status?: WorkloadStatus;
  readonly ownerId?: UserId | null;

  readonly since?: number;
  readonly limit?: number;
}

const isKnownKind = (kind: string): kind is WorkloadKind => (WORKLOAD_KINDS as readonly string[]).includes(kind);

/** The lifecycle/queue fields shared by both arms of the view — kind-independent, so they are projected once. */
function toRowBase(row: WorkloadSelectRow): Omit<WorkloadRowAnyKind, "kind" | "params" | "result" | "poison"> {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    lane: row.lane,
    ownerId: row.ownerId,
    dependsOn: row.dependsOn ?? null,
    error: row.error,
    progress: row.progress ?? null,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Narrow a raw row to the typed `WorkloadRowAnyKind`, or `null` when the KIND itself isn't in this build (a
 *  deploy-skew row that cannot be spelled at all). A known kind whose params blob fails its schema is NOT
 *  dropped — it surfaces as a POISON row (`params: null, poison: true`) so a broken row is visible and
 *  actionable instead of vanishing from `list`/`get`. The one place the JSON columns are narrowed; the
 *  per-kind validator is the OWNING domain's contribution schema — the queue spells no domain's vocabulary.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function toView(contributions: WorkloadContributions, row: WorkloadSelectRow): WorkloadRowAnyKind | null {
  if (!isKnownKind(row.kind)) {
    return null;
  }
  const base = toRowBase(row);
  let params: Record<string, unknown>;
  // @orb-waive caught-failure-ownership(catch): documented above — a params-schema failure
  // surfaces as a visible POISON row (`params: null, poison: true`) rather than vanishing from list/get,
  // never silently dropped.
  try {
    params = contributions[row.kind].params.parse(row.params) as Record<string, unknown>;
  } catch {
    return { ...base, kind: row.kind, params: null, result: row.result ?? null, poison: true };
  }
  // TS can't correlate the widened `row.kind` union with the per-kind params/result — sanctioned cast.
  return {
    ...base,
    kind: row.kind,
    params,
    result: row.result ?? null,
    poison: false,
  } as WorkloadRunnableRow;
}

/** Insert a fresh `queued` row. The single-active partial unique index may reject it — the caller
 *  (`start`/`retry`) catches the violation via `isActiveKindUniqueViolation` → `DomainConflictError`. */
export async function insertWorkload(db: Db, row: WorkloadInsert): Promise<void> {
  await db.insert(workloads).values({
    id: row.id,
    kind: row.kind,
    mode: row.mode,
    admissionKey: row.admissionKey,
    lane: row.lane,
    params: row.params,
    ownerId: row.ownerId,
    admissionSystem: row.ownerId === null,
    dependsOn: row.dependsOn,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
}

/** The id of the ACTIVE row that holds a given admission slot, or `undefined` when the slot is free.
 *
 *  It exists because `DomainConflictError` says the work is in flight without saying WHICH row is doing it,
 *  and a caller building a DAG needs the id: it has to chain a dependent on the run that is already going,
 *  not on one it failed to create. The `adoptActive` arm of `start` is its one caller.
 *
 *  THE PREDICATE MIRRORS THE PARTIAL UNIQUE INDEXES EXACTLY (`workloads_mode_active_singular_owned` /
 *  `_system` / `_bulk`), because "which row holds the slot" is by definition "the row the index would have
 *  collided with" — a looser predicate here (per-kind, say) would hand back a DIFFERENT unit's run and the
 *  dependent would wait on the wrong thing. `admission_system` is the discriminator the owned/system pair
 *  splits on, and it is derived the same way the insert derives it (`ownerId === null`).
 */
export async function findActiveAdmittedWorkloadId(
  db: Db,
  slot: { readonly kind: WorkloadKind; readonly mode: WorkloadMode; readonly ownerId: UserId | null; readonly admissionKey: string },
): Promise<WorkloadId | undefined> {
  const admissionSystem = slot.ownerId === null;
  const partition =
    slot.mode === "bulk"
      ? eq(workloads.mode, "bulk")
      : and(
          eq(workloads.mode, "singular"),
          eq(workloads.admissionSystem, admissionSystem),
          // The OWNED arm keys on owner_id; the SYSTEM arm omits it (SQLite unique indexes do not collide
          // NULLs, so the system index cannot carry it) — mirrored here rather than approximated.
          admissionSystem ? undefined : eq(workloads.ownerId, slot.ownerId),
        );
  const rows = await db
    .select({ id: workloads.id })
    .from(workloads)
    .where(
      and(eq(workloads.kind, slot.kind), eq(workloads.admissionKey, slot.admissionKey), inArray(workloads.status, [...ACTIVE_WORKLOAD_STATUSES]), partition),
    )
    .limit(1);
  return rows[0]?.id;
}

/** The idempotent claim: `queued → running`. Returns `false` (0 rows) for the loser of a two-worker race. */
// @orb-waive owner-scoped-writes(workloads): THE ENGINE PLANE (D20 un-principal) — the idempotent queued→running claim. The id is one the engine itself polled/enumerated (`scanRunnableWorkloads`), never caller input, and these writes must move ADMIN and system rows too, so an ownerId in the WHERE would make that unrepresentable. The user-facing rung is F3-AUTHZ at the verb (`isVisibleToCaller(isAdmin, caller, row.ownerId)`), the POST-FETCH arm the read half recognizes. Ends if a door writes a workload row without that check.
export async function markStarted(db: Db, id: WorkloadId, now: number): Promise<boolean> {
  const moved = await db
    .update(workloads)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** The lease tick: bump `updatedAt` for the in-flight statuses (the reaper's stale key), and — when the run
 *  has reported one — persist the latest progress snapshot in the SAME UPDATE. One write path: the engine
 *  throttles both to the lease cadence, so a chatty `report()` never turns into a second write stream. */
// @orb-waive owner-scoped-writes(workloads): THE ENGINE PLANE (D20 un-principal) — the lease tick + progress snapshot. The id is one the engine itself polled/enumerated (the row the runner is executing), never caller input, and these writes must move ADMIN and system rows too, so an ownerId in the WHERE would make that unrepresentable. The user-facing rung is F3-AUTHZ at the verb (`isVisibleToCaller(isAdmin, caller, row.ownerId)`), the POST-FETCH arm the read half recognizes. Ends if a door writes a workload row without that check.
export async function heartbeat(db: Db, id: WorkloadId, now: number, progress?: WorkloadProgress): Promise<void> {
  await db
    .update(workloads)
    // A snapshot-carrying tick ALSO zeroes `respawns` (#529): the boot-respawn bound counts respawns that
    // produced NOTHING, so evidence of forward motion resets it. A bare lease tick must not — a run that
    // reports no progress at all can still crash-loop, which is exactly what the bound is for.
    .set(progress === undefined ? { updatedAt: now } : { updatedAt: now, progress, respawns: 0 })
    .where(and(eq(workloads.id, id), inArray(workloads.status, [...IN_FLIGHT_STATUSES])));
}

/** Stamp a terminal state — status-guarded, returns whether it actually moved the row (a zombie runner whose
 *  row was already reaped writes nothing). `succeeded` is allowed only from `running`; failure terminals move
 *  from either in-flight state. */
// @orb-waive owner-scoped-writes(workloads): THE ENGINE PLANE (D20 un-principal) — the status-guarded terminal stamp. The id is one the engine itself polled/enumerated (the runner's own row, or `findStaleInFlight` in the reaper), never caller input, and these writes must move ADMIN and system rows too, so an ownerId in the WHERE would make that unrepresentable. The user-facing rung is F3-AUTHZ at the verb (`isVisibleToCaller(isAdmin, caller, row.ownerId)`), the POST-FETCH arm the read half recognizes. Ends if a door writes a workload row without that check.
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
  const guard: WorkloadStatus[] = args.status === "succeeded" ? ["running"] : [...IN_FLIGHT_STATUSES];
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
// @orb-waive owner-scoped-reads(workloads): the engine's own status probe (cancel/worker plane). The user-facing authorization is F3-AUTHZ at the verb — `isVisibleToCaller(isAdmin, caller, row.ownerId)` in `verbs/get.ts` — which is the POST-FETCH arm this gate recognizes; the engine reads have no caller at all. Ends if a door calls this.
export async function loadWorkloadStatus(db: Db, id: WorkloadId): Promise<WorkloadStatus | undefined> {
  const rows = await db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, id)).limit(1);
  return rows[0]?.status;
}

/** Race-safe, idempotent cancel: tries `queued → cancelled`, then `running → cancelling` on 0 rows. No
 *  SELECT-then-act gap — each arm is a status-guarded UPDATE. */
export async function markCancelling(db: Db, id: WorkloadId, now: number): Promise<CancelWorkloadResult> {
  // @orb-waive owner-scoped-writes(workloads): the two status-guarded UPDATEs are the write half of the read marker below — `verbs/cancel.ts` loads the row and runs the F3-AUTHZ `isVisibleToCaller` check before calling this, so the owner predicate lives one frame up (and must, for the admin arm). Ends if cancel stops loading-and-checking.
  const cancelledQueued = await db
    .update(workloads)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  if (cancelledQueued.length > 0) {
    return { status: "cancelled" };
  }
  // @orb-waive owner-scoped-writes(workloads): the two status-guarded UPDATEs are the write half of the read marker below — `verbs/cancel.ts` loads the row and runs the F3-AUTHZ `isVisibleToCaller` check before calling this, so the owner predicate lives one frame up (and must, for the admin arm). Ends if cancel stops loading-and-checking.
  const cancellingRunning = await db
    .update(workloads)
    .set({ status: "cancelling", updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "running")))
    .returning({ id: workloads.id });
  if (cancellingRunning.length > 0) {
    return { status: "cancelling" };
  }
  // @orb-waive owner-scoped-reads(workloads): the tail SELECT reports which terminal the two status-guarded UPDATEs landed on; the caller (`verbs/cancel.ts`) has already run the F3-AUTHZ visibility check on the loaded row, so the owner predicate lives one frame up. Ends if cancel stops loading-and-checking before it calls this.
  const current = await db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, id)).limit(1);
  return { status: current[0]?.status === "cancelling" ? "cancelling" : null };
}

/** Fail a queued row in place (poison-row + dependency-failed paths) — `markTerminal` only transitions
 *  from in-flight states. Returns whether it moved. */
// @orb-waive owner-scoped-writes(workloads): THE ENGINE PLANE (D20 un-principal) — the poison-row / dependency-failed fail-in-place. The id is one the engine itself polled/enumerated (`nextRunnableWorkload`), never caller input, and these writes must move ADMIN and system rows too, so an ownerId in the WHERE would make that unrepresentable. The user-facing rung is F3-AUTHZ at the verb (`isVisibleToCaller(isAdmin, caller, row.ownerId)`), the POST-FETCH arm the read half recognizes. Ends if a door writes a workload row without that check.
/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export async function failQueuedRow(db: Db, id: WorkloadId, error: string, now: number): Promise<boolean> {
  const moved = await db
    .update(workloads)
    .set({ status: "failed", error, updatedAt: now })
    .where(and(eq(workloads.id, id), eq(workloads.status, "queued")))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** Load one typed row by id, or `null` (absent, or a kind this build doesn't ship). A row with unparseable
 *  params comes back POISON — visible, not vanished. */
// @orb-waive owner-scoped-reads(workloads): THE F3-AUTHZ POST-FETCH ARM. The owner predicate deliberately lives at the verb (`verbs/get.ts`/`cancel.ts`/`retry.ts`: `isVisibleToCaller(isAdmin, caller, row.ownerId)` collapsing a foreign row to the SAME leak-free NOT_FOUND as an absent one) because the ADMIN and system-caller arms must see any row — an ownerId in this WHERE would make them unrepresentable. Ends if the admin arm goes.
export async function loadWorkload(db: Db, contributions: WorkloadContributions, id: WorkloadId): Promise<WorkloadRowAnyKind | null> {
  const rows = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toView(contributions, row);
}

/** The RAW (unparsed) params blob of one row — what `retry` clones for a POISON row, whose typed view carries
 *  `params: null`. Cloning the blob verbatim is what makes a poison row honestly retryable: the operator's
 *  original input survives, and a build that fixed the schema re-runs it unchanged. */
// @orb-waive owner-scoped-reads(workloads): `verbs/retry.ts` calls this only AFTER `loadWorkload` + the F3-AUTHZ visibility check on the same id — the blob clone rides an already-authorized row. Ends if a caller reaches it without that.
export async function loadRawWorkloadParams(db: Db, id: WorkloadId): Promise<Record<string, unknown> | null> {
  const rows = await db.select({ params: workloads.params }).from(workloads).where(eq(workloads.id, id)).limit(1);
  return rows[0]?.params ?? null;
}

/** Filtered list (kind/status/owner/since), newest-first, hard-capped 500. Rows of an unknown kind are
 *  filtered out (deploy skew); a params-poison row is INCLUDED as a visibly-broken row.
 *
 *  `createdAt DESC, id DESC` is a TOTAL order. `created_at` is not unique — one fan-out enqueues a whole
 *  batch inside a millisecond — and this read is LIMITed, so an unstable sort does not merely shuffle the
 *  page: it decides which rows the operator sees at all, differently on each poll. The id tiebreak is the
 *  same one the queue scan below already carries (TypeIDs are uuidv7-backed, so it stays newest-first). */
export async function listWorkloads(db: Db, contributions: WorkloadContributions, params: WorkloadListFilter): Promise<WorkloadRowAnyKind[]> {
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
  const limit = Math.min(params.limit ?? WORKLOAD_LIST_MAX_LIMIT, WORKLOAD_LIST_MAX_LIMIT);
  const rows = await db
    .select()
    .from(workloads)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(workloads.createdAt), desc(workloads.id))
    .limit(limit);
  return rows.flatMap((row) => {
    const view = toView(contributions, row);
    return view === null ? [] : [view];
  });
}

/** The next runnable row IN ONE LANE, or `null`. Cursor-pages through that lane's complete DUE queue and returns the first
 *  dispatchable row: a poison row (unknown kind, or params that no longer parse — it has nothing runnable to
 *  run) is failed in place (never thrown, to avoid starving the queue on the same head row); a row whose
 *  `dependsOn` gate is `waiting` is skipped, `failed` is failed in place. The lane predicate is what keeps a
 *  20-minute sweep from head-blocking an interactive row — each lane's loop sees only its own queue.
 *
 *  `scheduledAt <= now` is the DEFERRAL gate — the "Run at" affordance the client ships, enforced at the one
 *  dispatch door. It is a WHERE, not a skip, so a deferred row never enters the due scan:
 *  a row scheduled for tomorrow cannot starve a row queued (and due) a minute from now. The column is NOT
 *  NULL (it defaults to the enqueue instant), so "no deferral" is `scheduledAt === createdAt`, never null. */
async function evaluateQueuedRow(input: QueueScanInput, row: WorkloadSelectRow): Promise<WorkloadRunnableRow | null> {
  const view = toView(input.contributions, row);
  if (view === null || view.poison) {
    const error: WorkloadError = {
      kind: "runtime",
      message: `unrecognized or malformed workload kind: ${row.kind}`,
    };
    if (await failQueuedRow(input.db, row.id, error.message, input.now)) {
      input.onFailure({ workloadId: row.id, kind: row.kind, error });
    }
    getLog().warn({ workloadId: row.id, kind: row.kind }, "workloads: failed poison queue row");
    return null;
  }
  if (view.dependsOn === null || view.dependsOn.length === 0) {
    return view;
  }
  const gate = await resolveDependencyGate(input.db, view.dependsOn);
  if (gate === "waiting") {
    return null;
  }
  if (gate === "ready") {
    return view;
  }
  const error: WorkloadError = {
    kind: "dependency_failed",
    message: DEPENDENCY_FAILED_MESSAGE,
  };
  if (await failQueuedRow(input.db, view.id, error.message, input.now)) {
    input.onFailure({ workloadId: view.id, kind: view.kind, error });
  }
  getLog().warn({ workloadId: view.id, dependsOn: view.dependsOn }, "workloads: failed dependent — a dependency did not succeed (dependency_failed)");
  return null;
}

async function scanRunnablePage(input: QueueScanInput, cursor: QueueCursor | null): Promise<WorkloadRunnableRow | null> {
  const afterCursor =
    cursor === null
      ? undefined
      : or(
          gt(workloads.scheduledAt, cursor.scheduledAt),
          and(eq(workloads.scheduledAt, cursor.scheduledAt), gt(workloads.createdAt, cursor.createdAt)),
          and(eq(workloads.scheduledAt, cursor.scheduledAt), eq(workloads.createdAt, cursor.createdAt), gt(workloads.id, cursor.id)),
        );
  const page = await input.db
    .select()
    .from(workloads)
    .where(
      and(
        eq(workloads.status, "queued"),
        eq(workloads.lane, input.lane),
        lte(workloads.scheduledAt, input.now),
        ...(afterCursor === undefined ? [] : [afterCursor]),
      ),
    )
    .orderBy(asc(workloads.scheduledAt), asc(workloads.createdAt), asc(workloads.id))
    .limit(QUEUE_SCAN_PAGE_SIZE);
  for (const row of page) {
    const runnable = await evaluateQueuedRow(input, row);
    if (runnable !== null) {
      return runnable;
    }
  }
  const tail = page.at(-1);
  return tail === undefined || page.length < QUEUE_SCAN_PAGE_SIZE ? null : scanRunnablePage(input, tail);
}

export function scanRunnableWorkloads(input: QueueScanInput): Promise<WorkloadRunnableRow | null> {
  return scanRunnablePage(input, null);
}

/** EVERY in-flight row, projected for the BOOT reclaim (#529): id + kind + the respawn count + the lease
 *  column as it stands before the disposition (the reap sentence's observed lease age, #560 — `markTerminal`
 *  overwrites it).
 *
 *  NO LEASE PREDICATE, deliberately — this is the one query where the heartbeat is not evidence. At boot,
 *  single replica means no worker survived, so an in-flight row is orphaned regardless of how fresh its
 *  lease looks; a `updatedAt < now` filter (which is what the reaper's threshold-0 call degenerated to) let
 *  a row whose last heartbeat landed in the same millisecond as boot survive as a zombie holding its kind's
 *  active slot forever. Unlike `findStaleInFlight` it does NOT build views either: the boot reclaim must
 *  also dispose of poison rows and rows of a kind this build no longer ships, and it needs no params to
 *  decide their disposition. */
export async function findInFlightForBootReclaim(db: Db): Promise<WorkloadInFlightRow[]> {
  return await db
    .select({ id: workloads.id, kind: workloads.kind, respawns: workloads.respawns, updatedAt: workloads.updatedAt })
    .from(workloads)
    .where(inArray(workloads.status, [...IN_FLIGHT_STATUSES]));
}

/** Put an orphaned in-flight row BACK IN THE QUEUE (#529) — the resumable disposition of the boot reclaim.
 *  Status-guarded exactly like `markTerminal`, so a returning zombie is never re-queued out from under its
 *  own runner. `respawns` increments (the loop bound's counter); `error` is CLEARED because the row is no
 *  longer in a failure state, and `progress` is KEPT (a re-run's UI should not lose the last known position).
 *  No unique-index risk: `queued` and `running` are both in `ACTIVE_WORKLOAD_STATUSES`, so the row never
 *  leaves and never re-enters its single-active slot. */
// @orb-waive owner-scoped-writes(workloads): THE ENGINE PLANE (D20 un-principal) — the boot reclaim's status-guarded re-queue. The id is one the engine itself enumerated (`findInFlightForBootReclaim`), never caller input, and this write must move ADMIN and system rows too, so an ownerId in the WHERE would make that unrepresentable. The user-facing rung is F3-AUTHZ at the verb (`isVisibleToCaller(isAdmin, caller, row.ownerId)`), the POST-FETCH arm the read half recognizes. Ends if a door writes a workload row without that check.
export async function requeueInFlight(db: Db, args: { id: WorkloadId; now: number }): Promise<boolean> {
  const moved = await db
    .update(workloads)
    .set({ status: "queued", error: null, respawns: sql`${workloads.respawns} + 1`, updatedAt: args.now })
    .where(and(eq(workloads.id, args.id), inArray(workloads.status, [...IN_FLIGHT_STATUSES])))
    .returning({ id: workloads.id });
  return moved.length > 0;
}

/** In-flight rows whose lease went stale (`updatedAt < staleBefore`) — the reaper's sweep input.
 *
 *  RAW COLUMNS, NO VIEW (#1413) — the same reason `findInFlightForBootReclaim` reads raw, now applied to the
 *  steady-state half. This projected through `toView`, which returns `null` for a kind this build does not
 *  ship, and the sweep dropped those nulls: an unknown-kind in-flight row could never reach `markTerminal`
 *  and stayed `running`/`cancelling` forever, holding its kind's single-active slot. Only a restart cleared
 *  it (the boot reclaim already read raw), so the LIVE system never healed. A disposition needs no params —
 *  it needs the id, the kind and the pre-overwrite lease — so narrowing was never buying anything here. */
export async function findStaleInFlight(db: Db, staleBefore: number): Promise<WorkloadInFlightRow[]> {
  return await db
    .select({ id: workloads.id, kind: workloads.kind, respawns: workloads.respawns, updatedAt: workloads.updatedAt })
    .from(workloads)
    .where(and(inArray(workloads.status, [...IN_FLIGHT_STATUSES]), lt(workloads.updatedAt, staleBefore)));
}
