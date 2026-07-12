// domain/workloads/contract/schedule — the SCHEDULE verb argument + result + row shapes (one-home, §7.4).
// The TIME dimension over the queue: a `workload_schedule` row auto-enqueues a `workload` on its cadence.
//
// F3 (owner-scoped, mirroring the workload verbs): every verb carries `caller: Principal | null` — the
// AUTHORIZATION subject, NOT merely a tag. `null` = a TRUSTED system trigger (no gate). A non-null caller is a
// real request: a BULK schedule requires the BOX OWNER (`requireOwner`), a SINGULAR schedule is any authed
// caller; read/mutate-by-id verbs are IDOR-scoped to the caller's own `ownerId` unless admin (owner∪admin
// sees all). The row's `ownerId` derives from the caller (`caller.userId`) for a request, or the explicit
// `ownerId` for a system trigger (a schedule row's owner is NOT NULL — a null resolution is a BAD_REQUEST).

import type { Principal } from "@orb/contracts/identity";
import type { ScheduleCadence, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import type { StartWorkloadParams } from "./params";
import type { StartWorkloadInput } from "./workload-params";

/** A schedule projected for read (owner-scoped). `params` is the raw stored `ParamsByKind` blob the tick
 *  feeds straight into `start` (re-validated there); the client renders `kind` + `cadence` + `enabled`. */
export interface WorkloadScheduleRow {
  readonly id: WorkloadScheduleId;
  readonly ownerId: UserId;
  readonly kind: WorkloadKind;
  readonly mode: WorkloadMode;
  readonly params: Record<string, unknown>;
  readonly cadence: ScheduleCadence;
  readonly nextRunAt: number;
  readonly lastRunAt: number | null;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** `createSchedule` — create a recurring schedule. `input` (kind+params, re-parsed like `start`) + `cadence`
 *  + `mode`. AUTHORITY mirrors `start`: a `singular` schedule is any authed caller (stamps ownerId = caller);
 *  a `bulk` schedule requires the BOX OWNER. `caller: null` = a trusted system trigger stamping `ownerId`.
 *  The first run is one cadence-interval out (a fresh nightly schedule does not fire the instant it is made). */
export interface CreateScheduleParams {
  readonly input: StartWorkloadInput;
  readonly caller: Principal | null;
  readonly cadence: ScheduleCadence;
  readonly mode: WorkloadMode;
  /** Whether the schedule starts enabled (default true). */
  readonly enabled?: boolean;
  /** The explicit owner for a `caller: null` (system) trigger. Ignored when `caller` is set (caller wins —
   *  server-authoritative). A null resolution (no caller, no owner) is a BAD_REQUEST (the row owner is NOT NULL). */
  readonly ownerId: UserId | null;
}

/** `updateSchedule` — retune an existing schedule by id (owner-scoped; a foreign/absent id → leak-free
 *  NOT_FOUND). `input` replaces kind+params (re-parsed + re-gated against the effective mode); `cadence`
 *  re-bases `nextRunAt` (= now + the new interval); `mode` re-gates the kind's mode policy. All optional —
 *  an omitted field is left unchanged. `enabled` is NOT here (it is `setScheduleEnabled`'s job). */
export interface UpdateScheduleParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
  readonly input?: StartWorkloadInput;
  readonly cadence?: ScheduleCadence;
  readonly mode?: WorkloadMode;
}

/** `deleteSchedule` — remove a schedule by id (owner-scoped; a foreign/absent id → leak-free NOT_FOUND, no
 *  state change). Returns nothing — the schedule is gone (schedules are live config, not a retained audit row). */
export interface DeleteScheduleParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
}

/** `setScheduleEnabled` — pause/resume a schedule by id (owner-scoped; a foreign/absent id → leak-free
 *  NOT_FOUND). A disabled schedule stays but the tick never enqueues from it. */
export interface SetScheduleEnabledParams {
  readonly id: WorkloadScheduleId;
  readonly caller: Principal | null;
  readonly enabled: boolean;
}

/** `listSchedules` — the caller's schedules, newest-first. A non-admin caller is FORCED to its own `ownerId`
 *  (server-authoritative); an admin (or a `null` system caller) may pass an `ownerId` filter or leave it
 *  unfiltered (the deployment-wide view). */
export interface ListSchedulesParams {
  readonly caller: Principal | null;
  readonly ownerId?: UserId | null;
  readonly kind?: WorkloadKind;
}

/**
 * The schedule verb surface (the TIME dimension over the workloads queue). Owner-scoped + IDOR-safe exactly
 * like the workload verbs: mutate/read-by-id collapse a foreign id to `DomainNotFoundError`; a bulk schedule
 * requires the box owner; `list` is scoped to the caller's own owner unless admin.
 */
export interface WorkloadScheduleService {
  readonly createSchedule: (params: CreateScheduleParams) => Promise<{ id: WorkloadScheduleId }>;
  readonly updateSchedule: (params: UpdateScheduleParams) => Promise<WorkloadScheduleRow>;
  readonly deleteSchedule: (params: DeleteScheduleParams) => Promise<void>;
  readonly setScheduleEnabled: (params: SetScheduleEnabledParams) => Promise<WorkloadScheduleRow>;
  readonly listSchedules: (params: ListSchedulesParams) => Promise<readonly WorkloadScheduleRow[]>;
}

/** The scheduler TICK's injected deps (the periodic pass that enqueues due schedules). `db` reads the due set
 *  + advances; `now` is the injected clock; `start` is the workloads front door (the enqueue path — so a
 *  scheduled run flows through dispatch + the single-active lock + the DAG exactly like a manual start). */
export interface ScheduleTickDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
}
