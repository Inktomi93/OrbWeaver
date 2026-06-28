// Shared harness for the transport/jobs drivers (NOT a test file — `_support.ts`, so test-layout ignores it).
// "Fake at the edges, inject at the root" (testing §3): every injected engine op + the workloads service is a
// typed `vi.fn`, the clock is a fixed instant, and the timers are inert stubs — so a tick test asserts the
// claim/dispatch/decision with zero ambient time or I/O. The loop tests drive shutdown via a real
// AbortController.

import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import type { WorkloadRunnerEnv } from "../../../../packages/server/src/domain/workloads/contract/runner-env.ts";
import type {
  WorkloadRunnerDeps,
  WorkloadService,
} from "../../../../packages/server/src/domain/workloads/contract/service.ts";
import type { WorkloadRowAnyKind } from "../../../../packages/server/src/domain/workloads/contract/workload-row.ts";
import type { CatalogRefreshSchedulerDeps } from "../../../../packages/server/src/transport/jobs/catalog-refresh-scheduler.ts";
import type { WorkloadsWorkerDeps } from "../../../../packages/server/src/transport/jobs/workloads-worker.ts";

/** A fixed instant — every timestamp pins here (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** A minimal valid `reconcile-stats` row (no params) — the worker treats the row opaquely (it threads it into
 *  the faked `run`), so the kind is fixed and only the lifecycle fields the tests vary are overridable (a
 *  `Partial<WorkloadRowAnyKind>` spread would break the discriminated kind↔params correlation). */
export function makeRow(
  overrides: {
    id?: WorkloadId;
    status?: WorkloadStatus;
    ownerId?: UserId | null;
    updatedAt?: number;
  } = {},
): WorkloadRowAnyKind {
  return {
    id: overrides.id ?? castId<WorkloadId>("workload_1"),
    kind: "reconcile-stats",
    status: overrides.status ?? "queued",
    ownerId: overrides.ownerId ?? null,
    dependsOn: null,
    error: null,
    params: {},
    result: null,
    scheduledAt: T0,
    createdAt: T0,
    updatedAt: overrides.updatedAt ?? T0,
  };
}

/** The minimal `WorkloadRunnerDeps` the worker threads through to the faked `run` (it reads only `db`+`now`;
 *  the cross-feature env/binder are unused by the driver — casts at the test edge, per the workloads harness). */
export function makeRunnerDeps(overrides: Partial<WorkloadRunnerDeps> = {}): WorkloadRunnerDeps {
  return {
    db: {} as Db,
    env: {} as WorkloadRunnerEnv,
    bindRoleClients: () => ({}) as RoleClients,
    loadUserSettings: () => Promise.resolve({} as UserSettings),
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
    nextRunnable: vi.fn((_db: Db, _now: number) =>
      Promise.resolve<WorkloadRowAnyKind | null>(null),
    ),
    run: vi.fn((_deps: WorkloadRunnerDeps, _row: WorkloadRowAnyKind, _signal: AbortSignal) =>
      Promise.resolve(),
    ),
    reap: vi.fn((_args: { db: Db; now: number; staleThresholdMs?: number }) => Promise.resolve(0)),
    load: vi.fn((_db: Db, _id: WorkloadId) => Promise.resolve<WorkloadRowAnyKind | null>(null)),
    subscribeWake: vi.fn((_listener: () => void) => () => undefined),
    scheduleInterval: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    scheduleTimeout: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    ...overrides,
  };
}

/** Build scheduler deps with a faked `WorkloadService` (list/start) + the frozen clock + an inert interval.
 *  `list` defaults to empty (no prior row → due). */
export function makeSchedulerDeps(
  overrides: Partial<CatalogRefreshSchedulerDeps> = {},
): CatalogRefreshSchedulerDeps {
  const service: WorkloadService = {
    list: vi.fn(() => Promise.resolve<readonly WorkloadRowAnyKind[]>([])),
    start: vi.fn(() => Promise.resolve({ id: castId<WorkloadId>("workload_started") })),
    cancel: vi.fn(() => Promise.resolve({ status: null })),
    retry: vi.fn(() => Promise.resolve({ id: castId<WorkloadId>("workload_retry") })),
    get: vi.fn(() => Promise.resolve(makeRow())),
  };
  return {
    service,
    ownerId: castId<UserId>("user_owner"),
    now: () => T0,
    scheduleInterval: vi.fn((_fn: () => void, _ms: number) => () => undefined),
    ...overrides,
  };
}
