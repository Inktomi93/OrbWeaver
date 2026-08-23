// domain/workloads/contract/service — the typed API surface. Holds the `WorkloadService` verb interface,
// the two explicit DI bundles, and the injected-op type aliases; `context.ts` is the builder for these types.
// workloads sideways-imports NO sibling runtime — every cross-feature capability is an injected op wired at entry/.

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
}

/** What `createWorkloadService` receives from the entry root (identical to the context — no transform). */
export type WorkloadServiceDeps = WorkloadServiceContext;

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
}

/** The `WorkloadService` surface; every verb threads `caller` as the F3 authorization subject (`null` = trusted system trigger). */
export interface WorkloadService extends WorkloadScheduleService {
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly cancel: (params: CancelWorkloadParams) => Promise<CancelWorkloadResult>;
  readonly retry: (params: RetryWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly get: (params: GetWorkloadParams) => Promise<WorkloadRowAnyKind>;
  readonly list: (params: ListWorkloadsParams) => Promise<readonly WorkloadRowAnyKind[]>;
}
