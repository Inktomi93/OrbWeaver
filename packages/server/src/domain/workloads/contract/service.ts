// domain/workloads/contract/service — the typed API surface. Holds the `WorkloadService` verb interface,
// the two explicit DI bundles, and the injected-op type aliases; `context.ts` is the builder for these types.
// workloads sideways-imports NO sibling runtime — every cross-feature capability is an injected op wired at entry/.

import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import type { IsAdmin, RequireOwner } from "#domain/admin";
import type { AuditEntry } from "#foundation/observability";
import type { WorkloadContributions } from "./contribution.ts";
import type { CancelWorkloadParams, CancelWorkloadResult, GetWorkloadParams, ListWorkloadsParams, RetryWorkloadParams, StartWorkloadParams } from "./params.ts";
import type { WorkloadScheduleService } from "./schedule.ts";
import type { WorkloadRowAnyKind } from "./workload-row.ts";

/** Mint a fresh `WorkloadId` — the injected determinism seam. */
type NewWorkloadId = () => WorkloadId;

/** Mint a fresh `WorkloadScheduleId` — the injected determinism seam for the schedule verbs. */
type NewWorkloadScheduleId = () => WorkloadScheduleId;

/** The bundle the `WorkloadService` verbs close over (built by `context.ts`, wired at `service.ts`). */
export interface WorkloadServiceContext {
  readonly db: Db;
  /** The per-kind contribution registry, LATE-BOUND (a thunk, like portability's `getPortabilityRegistry`).
   *  The verbs use it as the params VALIDATOR (enqueue + the row read path) — the run bodies belong to the
   *  owning domains. It must be a thunk because compose order is circular by nature: the registry is
   *  assembled from every owning domain (chat is built LAST), and one of those owners — import — needs
   *  `workloads.start` to enqueue its post-import backfill. Deref happens per verb call, long after boot. */
  readonly getContributions: () => WorkloadContributions;
  readonly now: () => number;
  readonly newWorkloadId: NewWorkloadId;
  readonly newScheduleId: NewWorkloadScheduleId;
  /** MODE authz seam: `requireOwner` gates a BULK run (owner-only); `isAdmin` chooses the read scope. */
  readonly requireOwner: RequireOwner;
  readonly isAdmin: IsAdmin;
  /** The domain-owned lifecycle publisher; service.ts wires the engine bus so verbs never bypass it. */
  readonly emitEvent: (event: WorkloadEvent) => void;
}

/** What entry supplies; the domain service adds its own event publisher at its composition root. */
export type WorkloadServiceDeps = Omit<WorkloadServiceContext, "emitEvent">;

/**
 * The base runner deps the entry root wires + the worker holds. Lease/heartbeat cadences are tunable and
 * `<= 0` disables the timers (deterministic test seam — a test drives cancel via `AbortSignal` instead).
 */
export interface WorkloadRunnerDeps {
  readonly db: Db;
  /** The per-kind contribution registry the engine dispatches through (built at compose from the owning
   *  domains' factories). Replaces the retired cross-feature `env` hub — the engine knows no domain. */
  readonly contributions: WorkloadContributions;
  /** Suppress-and-drop audit writer; the engine emits `WORKLOAD_FAILED` on a terminal runtime failure. */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly now: () => number;
  readonly heartbeatMs?: number;
  readonly cancelPollMs?: number;
  /** The lease TIMER seam (heartbeat + cancel-poll): schedule `fn` every `ms`, returning its cancel. The
   *  house `ScheduleOp` shape (`transport/jobs/workloads-worker.ts`), so no handle type leaks. Injected for
   *  the same reason `now` is: a test ticks the lease through this seam instead of replacing the global
   *  clock, which `vi.useFakeTimers` does and Spine-Testing.md §3 bans. Omitted ⇒ the real `setInterval`. */
  readonly scheduleInterval?: (fn: () => void, ms: number) => () => void;
}

/**
 * WHY a `worker_died` reap fired — the axis that makes a reaped row post-hoc ATTRIBUTABLE (#560).
 *
 * Both reap paths run the SAME sweep and stamp the SAME status, and `markTerminal` overwrites `updatedAt`
 * (the lease column) with the reap instant — so without this discriminator the row keeps no trace of which
 * death it was, and a forensic read has to reconstruct the cause from lane ordering and inter-death gaps.
 *  - `heartbeat_stale` — the steady-state periodic sweep: the process is ALIVE and this row's lease aged past
 *    the grace window (a genuinely wedged run, or one whose worker died between boots).
 *  - `worker_restart` — the boot reclaim: single replica, so every in-flight row is orphaned BY DEFINITION
 *    and the threshold is 0. The lease is typically seconds old; calling that "stale" is the false sentence.
 *  - `respawn_loop` — the boot reclaim's BOUND (#529/#543): a row of a resumable kind that boot has already
 *    re-queued `MAX_BOOT_RESPAWNS` times without the run reporting any progress in between. It is the one
 *    death the operator can act on (the job itself is looping), so it must not read as one unlucky respawn.
 */
const WORKLOAD_REAP_REASONS = ["heartbeat_stale", "worker_restart", "respawn_loop"] as const;
export type WorkloadReapReason = (typeof WORKLOAD_REAP_REASONS)[number];

/** The orphan sweep's args. `reason` is REQUIRED: a new reap call site must declare which death it records,
 *  which is what keeps the two sentences from collapsing back into one. */
export interface ReapWorkloadsArgs {
  readonly db: Db;
  // No `contributions` (#1413): the sweep disposes of RAW in-flight rows and resolves no kind against the
  // registry, so handing it the domain map would be a dep it does not use — and the version that DID narrow
  // through the registry is precisely what dropped unknown-kind rows on the floor.
  readonly now: number;
  /** Grace window before a lease counts as stale; the boot reclaim passes 0 (every in-flight row is orphaned). */
  readonly staleThresholdMs?: number;
  readonly reason: WorkloadReapReason;
}

/** What the single-replica BOOT reclaim did with the orphans it found (#529). Two counters, not one: a
 *  re-queued row is work that SURVIVED the respawn, and a reaped one is work that was lost — collapsing them
 *  into a single "reclaimed" number is exactly the log line that made three worker-kills in one day look
 *  like routine boot noise. */
export interface BootReclaimReport {
  readonly requeued: number;
  readonly reaped: number;
}

/** The `WorkloadService` surface; every verb threads `caller` as the F3 authorization subject (`null` = trusted system trigger). */
export interface WorkloadService extends WorkloadScheduleService {
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly cancel: (params: CancelWorkloadParams) => Promise<CancelWorkloadResult>;
  readonly retry: (params: RetryWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly get: (params: GetWorkloadParams) => Promise<WorkloadRowAnyKind>;
  readonly list: (params: ListWorkloadsParams) => Promise<readonly WorkloadRowAnyKind[]>;
}
