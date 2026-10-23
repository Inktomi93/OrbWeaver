// Native workload driver dependencies and completion ownership.
import type { WorkloadLane } from "@orb/contracts/workloads";
import type { DatabaseHandle } from "@orb/db/wiring";
import type { WorkloadId } from "@orb/kit/ids";
import type { ScheduleOp } from "@orb/kit/time";
import type { ReapWorkloadsArgs, WorkloadContributions, WorkloadRowAnyKind, WorkloadRunnableRow, WorkloadRunnerDeps } from "#domain/workloads";
import type { superviseDetached as Supervise } from "#foundation/observability";
import type { BackgroundWork } from "#infra/tasks";

// The lane-scoped queue poll bound by `createNextRunnableWorkload` at composition.
type NextRunnableOp = (db: DatabaseHandle, contributions: WorkloadContributions, now: number, lane: WorkloadLane) => Promise<WorkloadRunnableRow | null>;
// `runWorkload` — drive ONE claimed row end-to-end (the domain's per-row state machine; front door).
type RunWorkloadOp = (deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, signal: AbortSignal) => Promise<void>;
// `reapOrphanedWorkloads` — sweep stale in-flight rows from dead workers (front door). The args shape is the
// domain's (`ReapWorkloadsArgs`) rather than re-spelled here, so its REQUIRED `reason` reaches this driver.
type ReapOp = (args: ReapWorkloadsArgs) => Promise<number>;
// `loadWorkload` — the by-id re-read the post-dispatch hot-loop guard uses (front door).
type LoadWorkloadOp = (db: DatabaseHandle, contributions: WorkloadContributions, id: WorkloadId) => Promise<WorkloadRowAnyKind | null>;
// Subscribe to the graph's workload lifecycle events; returns the unsubscribe. Injected so the
// driver never imports the bus directly.
type SubscribeWakeOp = (listener: () => void) => () => void;

/** The DI bundle the worker driver closes over — every cross-feature/engine/timer dep injected at entry/. */
export interface WorkloadsWorkerDeps {
  readonly supervise: typeof Supervise;
  /** The root's opaque nonce; it keeps each supervised reap tick name unique. */
  readonly newOpaqueId: () => string;
  readonly track?: BackgroundWork["track"];
  /** The per-dispatch runner deps (db + the cross-feature `env` hub + the per-owner binder + the injected
   *  clock + the lease cadences). Built at entry/compose; the worker threads it straight into `run`. */
  readonly runnerDeps: WorkloadRunnerDeps;
  /** Aborts the loop on shutdown AND is threaded into `run` so an in-flight workload aborts to `cancelled`. */
  readonly signal: AbortSignal;
  readonly nextRunnable: NextRunnableOp;
  readonly run: RunWorkloadOp;
  readonly reap: ReapOp;
  readonly load: LoadWorkloadOp;
  readonly subscribeWake: SubscribeWakeOp;
  readonly scheduleInterval: ScheduleOp;
  readonly scheduleTimeout: ScheduleOp;
  readonly pollIntervalMs?: number;
  readonly busyPollIntervalMs?: number;
  readonly reapIntervalMs?: number;
  /** Workers per execution lane (default 1 each). The seam is the lane TUPLE + the row's column; widening a
   *  lane to N is this dep, never a migration. A lane omitted here runs the default, not zero workers. */
  readonly laneConcurrency?: Partial<Record<WorkloadLane, number>>;
}
