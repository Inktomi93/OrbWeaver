// Shared harness for the transport/jobs drivers (NOT a test file — `_support.ts`, so test-layout ignores it).
// "Fake at the edges, inject at the root" (testing §3): every injected engine op + the workloads service is a
// typed `vi.fn`, the clock is a fixed instant, and the timers are inert stubs — so a tick test asserts the
// claim/dispatch/decision with zero ambient time or I/O. The loop tests drive shutdown via a real
// AbortController.

import type { WorkloadLane, WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import type { WorkloadContributions } from "../../../../packages/server/src/domain/workloads/contract/contribution.ts";
import type { WorkloadRunnerDeps, WorkloadService } from "../../../../packages/server/src/domain/workloads/contract/service.ts";
import type { WorkloadRowAnyKind, WorkloadRunnableRow } from "../../../../packages/server/src/domain/workloads/contract/workload-row.ts";
import type { CatalogRefreshSchedulerDeps } from "../../../../packages/server/src/transport/jobs/catalog-refresh-scheduler.ts";
import type { OidcGcSchedulerDeps } from "../../../../packages/server/src/transport/jobs/oidc-gc-scheduler.ts";
import type { WorkloadsWorkerDeps } from "../../../../packages/server/src/transport/jobs/workloads-worker.ts";

/** A fixed instant — every timestamp pins here (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** A minimal valid `reconcile-stats` row (no params) — the worker treats the row opaquely (it threads it into
 *  the faked `run`), so the kind is fixed and only the lifecycle fields the tests vary are overridable (a
 *  `Partial<WorkloadRunnableRow>` spread would break the discriminated kind↔params correlation). */
export function makeRow(
  overrides: { id?: WorkloadId; status?: WorkloadStatus; ownerId?: UserId | null; updatedAt?: number; lane?: WorkloadLane } = {},
): WorkloadRunnableRow {
  return {
    id: overrides.id ?? castId<WorkloadId>("workload_1"),
    kind: "reconcile-stats",
    status: overrides.status ?? "queued",
    mode: "bulk",
    lane: overrides.lane ?? "sweep",
    ownerId: overrides.ownerId ?? null,
    dependsOn: null,
    error: null,
    progress: null,
    params: {},
    result: null,
    poison: false,
    scheduledAt: T0,
    createdAt: T0,
    updatedAt: overrides.updatedAt ?? T0,
  };
}

/** The minimal `WorkloadRunnerDeps` the worker threads through to the faked `run` (it reads only `db`+`now`;
 *  the cross-feature env/binder are unused by the driver — casts at the test edge, per the workloads harness). */
function makeRunnerDeps(overrides: Partial<WorkloadRunnerDeps> = {}): WorkloadRunnerDeps {
  return {
    db: {} as Db,
    contributions: {} as WorkloadContributions,
    audit: () => Promise.resolve(),
    now: () => T0,
    ...overrides,
  };
}

/** Build worker deps with faked engine ops + inert timers. Override any op to script a scenario. The default
 *  `nextRunnable` returns null (empty queue); pass `row` to script ONE runnable row then empties. */
export function makeWorkerDeps(overrides: Partial<WorkloadsWorkerDeps> = {}): WorkloadsWorkerDeps {
  return {
    runnerDeps: makeRunnerDeps(),
    signal: new AbortController().signal,
    nextRunnable: vi.fn((_db: Db, _contributions: WorkloadContributions, _now: number, _lane: WorkloadLane) =>
      Promise.resolve<WorkloadRunnableRow | null>(null),
    ),
    run: vi.fn((_deps: WorkloadRunnerDeps, _row: WorkloadRunnableRow, _signal: AbortSignal) => Promise.resolve()),
    reap: vi.fn((_args: { db: Db; contributions: WorkloadContributions; now: number; staleThresholdMs?: number }) => Promise.resolve(0)),
    load: vi.fn((_db: Db, _contributions: WorkloadContributions, _id: WorkloadId) => Promise.resolve<WorkloadRowAnyKind | null>(null)),
    subscribeWake: vi.fn((_listener: () => void) => () => undefined),
    scheduleInterval: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    scheduleTimeout: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    ...overrides,
  };
}

/** Build scheduler deps with a faked `WorkloadService` (list/start) + the frozen clock + an inert interval.
 *  `list` defaults to empty (no prior row → due). */
export function makeSchedulerDeps(overrides: Partial<CatalogRefreshSchedulerDeps> = {}): CatalogRefreshSchedulerDeps {
  const service: WorkloadService = {
    list: vi.fn(() => Promise.resolve<readonly WorkloadRowAnyKind[]>([])),
    start: vi.fn(() => Promise.resolve({ id: castId<WorkloadId>("workload_started") })),
    cancel: vi.fn(() => Promise.resolve({ status: null })),
    retry: vi.fn(() => Promise.resolve({ id: castId<WorkloadId>("workload_retry") })),
    get: vi.fn(() => Promise.resolve(makeRow())),
    // The schedule verbs are unused by the catalog-refresh scheduler (it drives list/start), but the
    // service type requires them — inert fakes keep the shape complete.
    createSchedule: vi.fn(() => Promise.resolve({ id: castId<WorkloadScheduleId>("workload_schedule_x") })),
    updateSchedule: vi.fn(() => Promise.reject(new Error("unused"))),
    deleteSchedule: vi.fn(() => Promise.resolve()),
    setScheduleEnabled: vi.fn(() => Promise.reject(new Error("unused"))),
    listSchedules: vi.fn(() => Promise.resolve([])),
  };
  return {
    service,
    ownerId: castId<UserId>("user_owner"),
    now: () => T0,
    scheduleInterval: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    ...overrides,
  };
}

/** Build OIDC-GC-scheduler deps with a faked `sweep` op (defaults to 0 reaped) + the frozen clock + an inert
 *  interval. Override `sweep` to script a reap count or a throw. */
export function makeOidcGcDeps(overrides: Partial<OidcGcSchedulerDeps> = {}): OidcGcSchedulerDeps {
  return {
    sweep: vi.fn((_before: number) => Promise.resolve(0)),
    now: () => T0,
    scheduleInterval: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    ...overrides,
  };
}
