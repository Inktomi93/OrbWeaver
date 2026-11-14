// Workload service and runner contracts. Cross-feature capabilities arrive through injected operations.

import type { IsAdmin, IsOwner, RequireOwner } from "@orb/contracts/admin";
import type { Principal, ResolveUserEnabled } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type {
  CancelWorkloadResult,
  ModelCallEstimate,
  StartWorkloadOp,
  WorkloadLane,
  WorkloadRef,
  WorkloadRowAnyKind,
  WorkloadRunnableRow,
} from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import type { Clock, TimerScheduler } from "@orb/kit/time";
import type { AuditEntry, Logger, TraceRing } from "#foundation/observability";
import type { WorkloadContributions } from "./contribution.ts";
import type {
  CancelWorkloadParams,
  EstimateModelCallsParams,
  EstimateRetryModelCallsParams,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
} from "./params.ts";
import type { WorkloadProgressBus } from "./progress-bus.ts";
import type { WorkloadScheduleService } from "./schedule.ts";
import type { WorkloadReads } from "./workload-row.ts";

/** Mint a fresh `WorkloadId` — the injected determinism seam. */
type NewWorkloadId = () => WorkloadId;

/** Mint a fresh `WorkloadScheduleId` — the injected determinism seam for the schedule verbs. */
type NewWorkloadScheduleId = () => WorkloadScheduleId;

/** The bundle the service root supplies to the workload verbs. */
export interface WorkloadServiceContext {
  readonly logger: Logger;
  readonly db: Db;
  /** The per-kind contribution registry, LATE-BOUND (a thunk, like portability's `getPortabilityRegistry`).
   *  The verbs use it as the params VALIDATOR (enqueue + the row read path) — the run bodies belong to the
   *  owning domains. It must be a thunk because compose order is circular by nature: the registry is
   *  assembled from every owning domain (chat is built LAST), and one of those owners — import — needs
   *  `workloads.start` to enqueue its post-import backfill. Deref happens per verb call, long after boot. */
  readonly getContributions: () => WorkloadContributions;
  readonly now: Clock;
  readonly newWorkloadId: NewWorkloadId;
  readonly newScheduleId: NewWorkloadScheduleId;
  /** MODE authz seam: `requireOwner` gates a BULK run (owner-only); `isAdmin` chooses the read scope. */
  readonly requireOwner: RequireOwner;
  readonly isAdmin: IsAdmin;
  /** The non-throwing owner test, for a read that must answer a non-owner exactly as it answers a missing row. */
  readonly isOwner: IsOwner;
  /** Whether an account is the box owner, read off its row: a stored run has no Principal to ask, only an id. */
  readonly isBoxOwner: (userId: UserId) => Promise<boolean>;
  /** Whether an account is enabled, read off its row per call: a run answers to an enabled account or none. */
  readonly isAccountEnabled: ResolveUserEnabled;
  /** The graph-owned lifecycle publisher, shared by verbs and the workload engine. */
  readonly emitEvent: WorkloadProgressBus["emitWorkloadEvent"];
  /** Abort a run in flight in this process the moment its cancel is stored. */
  readonly abortRun: WorkloadProgressBus["abortWorkloadRun"];
  /** The per-user freshness plane: a system-started owned row announces `workloadsChanged` to its owner. */
  readonly emitUserEvent: EmitUserEvent;
  /** The rows whose unreadable stored result the log already names, minted once by the service root. */
  readonly reportedUnreadable: WorkloadReads["reportedUnreadable"];
}

/**
 * The base runner deps the entry root wires + the worker holds. Lease/heartbeat cadences are tunable and
 * `<= 0` disables the timers (deterministic test seam — a test drives cancel via `AbortSignal` instead).
 */
export interface WorkloadRunnerDeps {
  readonly logger: Logger;
  /** The root's trace ring each run's `workload.run` root seals into. */
  readonly traces: TraceRing;
  readonly emitEvent: WorkloadServiceContext["emitEvent"];
  /** Registers each run's abort where {@link WorkloadServiceContext.abortRun} finds it. */
  readonly trackRun: WorkloadProgressBus["trackWorkloadRun"];
  readonly db: Db;
  /** The per-kind contribution registry the engine dispatches through (built at compose from the owning
   *  domains' factories). Replaces the retired cross-feature `env` hub — the engine knows no domain. */
  readonly contributions: WorkloadContributions;
  /** The runner judges an owner-only run before its body, so a row stored by any build answers to this. */
  readonly isBoxOwner: WorkloadServiceContext["isBoxOwner"];
  readonly isAccountEnabled: WorkloadServiceContext["isAccountEnabled"];
  /** Suppress-and-drop audit writer; the engine emits `WORKLOAD_FAILED` on a terminal runtime failure. */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly now: Clock;
  readonly heartbeatMs?: number;
  readonly cancelPollMs?: number;
  /** The lease TIMER seam (heartbeat + cancel-poll): schedule `fn` every `ms`, returning its cancel. The
   *  house `ScheduleOp` shape (`transport/jobs/workloads-worker.ts`), so no handle type leaks. Injected for
   *  the same reason `now` is: a test ticks the lease through this seam instead of replacing the global
   *  clock, which `vi.useFakeTimers` does and Spine-Testing.md §3 bans. Production passes the root's `timers.interval`. */
  readonly scheduleInterval: TimerScheduler["interval"];
}

/** Who a run needs the box owner's authority from. `account` is required, so a `null` caller is judged, never skipped. */
export interface RunAsker {
  /** The person asking, or `null` for a schedule tick or a dispatched row. */
  readonly caller: Principal | null;
  /** The account the run answers to; `null` means no account does, which refuses. */
  readonly account: UserId | null;
}

/**
 * WHY a `worker_died` reap fired — the axis that makes a reaped row post-hoc ATTRIBUTABLE.
 *
 * Both reap paths run the SAME sweep and stamp the SAME status, and `markTerminal` overwrites `updatedAt`
 * (the lease column) with the reap instant — so without this discriminator the row keeps no trace of which
 * death it was, and a forensic read has to reconstruct the cause from lane ordering and inter-death gaps.
 *  - `heartbeat_stale` — the steady-state periodic sweep: the process is ALIVE and this row's lease aged past
 *    the grace window (a genuinely wedged run, or one whose worker died between boots).
 *  - `worker_restart` — the boot reclaim: single replica, so every in-flight row is orphaned BY DEFINITION
 *    and the threshold is 0. The lease is typically seconds old; calling that "stale" is the false sentence.
 *  - `respawn_loop` — the boot reclaim's BOUND: a row of a resumable kind that boot has already
 *    re-queued `MAX_BOOT_RESPAWNS` times without the run reporting any progress in between. It is the one
 *    death the operator can act on (the job itself is looping), so it must not read as one unlucky respawn.
 */
const WORKLOAD_REAP_REASONS = ["heartbeat_stale", "worker_restart", "respawn_loop"] as const;
export type WorkloadReapReason = (typeof WORKLOAD_REAP_REASONS)[number];

/** The orphan sweep's args. `reason` is REQUIRED: a new reap call site must declare which death it records,
 *  which is what keeps the two sentences from collapsing back into one. */
export interface ReapWorkloadsArgs {
  readonly emitEvent: WorkloadServiceContext["emitEvent"];
  readonly db: Db;
  // No `contributions`: the sweep disposes of RAW in-flight rows and resolves no kind against the
  // registry, so handing it the domain map would be a dep it does not use — and the version that DID narrow
  // through the registry is precisely what dropped unknown-kind rows on the floor.
  readonly now: number;
  /** Grace window before a lease counts as stale; the boot reclaim passes 0 (every in-flight row is orphaned). */
  readonly staleThresholdMs?: number;
  readonly reason: WorkloadReapReason;
}

/** What the single-replica BOOT reclaim did with the orphans it found. Two counters, not one: a
 *  re-queued row is work that SURVIVED the respawn, and a reaped one is work that was lost — collapsing them
 *  into a single "reclaimed" number is exactly the log line that made three worker-kills in one day look
 *  like routine boot noise. */
export interface BootReclaimReport {
  readonly requeued: number;
  readonly reaped: number;
  /** Rows whose owner had raised a cancel the dead process never finished: boot finished it. */
  readonly cancelled: number;
}

/** The boot reclaim's args; `contributions` supplies each kind's declared `resume` policy. */
export interface BootReclaimArgs {
  readonly logger: Logger;
  readonly db: Db;
  readonly contributions: WorkloadContributions;
  readonly now: number;
  readonly emitEvent: WorkloadServiceContext["emitEvent"];
}

/** The `WorkloadService` surface; every verb threads `caller` as the F3 authorization subject (`null` = trusted system trigger). */
export interface WorkloadService extends WorkloadScheduleService {
  readonly start: StartWorkloadOp;
  readonly estimateModelCalls: (params: EstimateModelCallsParams) => Promise<ModelCallEstimate>;
  readonly estimateRetryModelCalls: (params: EstimateRetryModelCallsParams) => Promise<ModelCallEstimate>;
  readonly cancel: (params: CancelWorkloadParams) => Promise<CancelWorkloadResult>;
  readonly retry: (params: RetryWorkloadParams) => Promise<WorkloadRef>;
  readonly get: (params: GetWorkloadParams) => Promise<WorkloadRowAnyKind>;
  readonly list: (params: ListWorkloadsParams) => Promise<readonly WorkloadRowAnyKind[]>;
}

export type NextRunnableWorkloadDeps = Pick<WorkloadRunnerDeps, "db" | "contributions" | "logger"> & Pick<WorkloadServiceContext, "emitEvent">;
export type NextRunnableWorkload = (now: number, lane: WorkloadLane) => Promise<WorkloadRunnableRow | null>;

export type WorkloadRunnerAssemblyDeps = DbAssemblyInput<WorkloadRunnerDeps>;
export type ReapWorkloadsAssemblyArgs = DbAssemblyInput<ReapWorkloadsArgs>;
