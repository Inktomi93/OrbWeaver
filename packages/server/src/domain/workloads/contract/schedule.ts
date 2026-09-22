// domain/workloads/contract/schedule — schedule verb argument + result + row shapes. The time dimension
// over the queue: a workload_schedule row auto-enqueues a workload on its cadence. Every verb carries
// caller: Principal | null (null = trusted system trigger, no gate); a non-null caller is IDOR-scoped to
// their own ownerId unless admin; a bulk schedule requires the box owner.

import type { Principal } from "@orb/contracts/identity";
import type { ScheduleCadence, StartWorkloadInput, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import type { Db, workloadSchedules } from "@orb/db";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import type { StartWorkloadParams } from "./params.ts";

/** The `workload_schedules` row, DERIVED — never re-spelled (CLAUDE.md "Type homes and unions": a DB row shape's one home is `db`,
 *  via `$inferSelect`). It was a hand-written interface listing the same eleven columns; a column added to the
 *  table would have left it silently stale. */
export type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;

/** The first run is one cadence-interval out (a fresh schedule doesn't fire the instant it's made). */
export interface CreateScheduleParams {
  readonly input: StartWorkloadInput;
  readonly caller: Principal | null;
  readonly cadence: ScheduleCadence;
  readonly mode: WorkloadMode;
  readonly enabled?: boolean;
  readonly ownerId: UserId | null;
}

export interface UpdateScheduleParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
  readonly input?: StartWorkloadInput;
  readonly cadence?: ScheduleCadence;
  readonly mode?: WorkloadMode;
}

export interface DeleteScheduleParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
}

export interface SetScheduleEnabledParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
  readonly enabled: boolean;
}

export interface ListSchedulesParams {
  readonly caller: Principal | null;
  readonly ownerId?: UserId | null;
  readonly kind?: WorkloadKind;
}

export interface WorkloadScheduleService {
  readonly createSchedule: (params: CreateScheduleParams) => Promise<{ id: WorkloadScheduleId }>;
  readonly updateSchedule: (params: UpdateScheduleParams) => Promise<WorkloadScheduleRow>;
  readonly deleteSchedule: (params: DeleteScheduleParams) => Promise<void>;
  readonly setScheduleEnabled: (params: SetScheduleEnabledParams) => Promise<WorkloadScheduleRow>;
  readonly listSchedules: (params: ListSchedulesParams) => Promise<readonly WorkloadScheduleRow[]>;
}

/** start is the workloads front door, so a scheduled run flows through dispatch + the single-active lock exactly like a manual start. */
export interface ScheduleTickDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
}
