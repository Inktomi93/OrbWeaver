// `@orb/contracts/workloads` — the EXECUTION vocabulary a workload run is described by: the lane + resume
// axes (tuples `@orb/db` and the client derive from, D34), the progress snapshot the SSE tail carries, and
// the per-dispatch run context.
//
// These are the DOM/node-free half of the contribution seam (`domains raise seams, the worker skims them` —
// the replacement for the retired `runner-env.ts` god-hub). The `WorkloadContribution` interface itself
// cannot live here: its `run` body takes an `AbortSignal` (cancel is a core queue feature, not optional),
// and this package is deliberately isomorphic with NO dom/node lib — the same constraint that keeps
// `PortableEntity.exportAll` signal-free in `@orb/contracts/portability`. It homes one tier up, in
// `domain/workloads/contract/contribution.ts`, reached type-only through the workloads front door.

import type { UserId } from "@orb/kit/ids";

/** Execution lane — which worker loop runs the row. `interactive` = per-user latency-sensitive (a document
 *  ingest a user is waiting on). `sweep` = bulk maintenance (a 20-minute import, a whole-CAS GC). The lanes
 *  run independently, so a long sweep never head-blocks an interactive job. */
export const WORKLOAD_LANES = ["interactive", "sweep"] as const;
export type WorkloadLane = (typeof WORKLOAD_LANES)[number];

/**
 * The honest resumability contract — drives the retry affordance + the reaper's messaging.
 * `idempotent-restart` = a retry re-runs the whole job safely (every contribution today).
 * `none` = retry is destructive/unsafe. `checkpointed` = RESERVED, the dormant-by-design doorway for a
 * future job that persists a cursor (no producer today; named so the shape never needs a retrofit).
 */
export const WORKLOAD_RESUME_POLICIES = ["idempotent-restart", "checkpointed", "none"] as const;
export type WorkloadResumePolicy = (typeof WORKLOAD_RESUME_POLICIES)[number];

/**
 * The progress snapshot a contribution reports per tick (engine → durable row column → bus → SSE). All
 * fields optional so a run reports only what it knows: `message` (a human label), `current`/`total` (a
 * count pair), `pct` (0–100 when computable).
 */
export interface WorkloadProgress {
  readonly message?: string;
  readonly current?: number;
  readonly total?: number;
  readonly pct?: number;
}

/** The callback a contribution closes over to report a progress snapshot (engine-bound per dispatch). */
export type ReportProgress = (progress: WorkloadProgress) => void;

declare const everyOwnerRunBrand: unique symbol;
declare const everyOwnerEstimateBrand: unique symbol;

/** Authority carried only by an executing, claimed NULL-owner workload row. */
export interface EveryOwnerRun {
  readonly [everyOwnerRunBrand]: true;
}

/** Count-only authority admitted by the workload estimate door, never execution authority. */
export interface EveryOwnerEstimate {
  readonly [everyOwnerEstimateBrand]: true;
}

/** A singular owner or the runner's explicit every-owner authority; null alone grants nothing. */
export type WorkloadRunScope = { readonly ownerId: UserId; readonly everyOwnerRun?: null } | { readonly ownerId: null; readonly everyOwnerRun: EveryOwnerRun };

/** Estimates preserve the admitted enumeration scope without acquiring run authority. */
export type WorkloadEstimateScope =
  | { readonly ownerId: UserId; readonly everyOwnerEstimate?: null }
  | { readonly ownerId: null; readonly everyOwnerEstimate: EveryOwnerEstimate };

/**
 * What the engine hands a contribution per dispatch. Deliberately minimal: identity + clock. Anything else a
 * job needs (role clients, user settings, db handles) is a dep of the OWNING domain's contribution factory,
 * closed over at compose — never a shared per-dispatch bundle the next job can quietly grow.
 */
export type WorkloadRunContext = WorkloadRunScope & {
  /** The acting user — the row's owner, or a synthetic `system` id for an ownerless (scheduler) row. */
  readonly userId: UserId;
  readonly now: () => number;
};
