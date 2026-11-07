// domain/workloads/contract/contribution — THE SEAM: a domain contributes its background work; the worker
// skims the contributions. This replaces the retired `runner-env.ts` god-hub (the self-described "one true
// cross-feature composition seam" that let any agent bolt another domain's capability onto workloads instead
// of building a proper injected-op seam at the owning domain's door). The inversion, in one line:
// **domains raise seams, the worker skims them.**
//
// HOW AN OWNING DOMAIN USES THIS: it imports this type TYPE-ONLY through the workloads front door
// (`import type { WorkloadContribution } from "#domain/workloads"`) — the sanctioned cross-feature shape
// import (constitution §2: "a verb declares the TYPE of an injected cross-feature op"), and exports ONE
// standalone compose-built factory returning its contributions. It never imports workloads' runtime.
//
// WHY NOT `@orb/contracts/workloads` (where the rest of the seam — lanes, resume, progress, run context,
// params/result maps — does live): `run` takes an `AbortSignal` (cancel is a core queue feature), and the
// contracts package is deliberately isomorphic with NO dom/node lib, so the name does not exist there. Same
// constraint that keeps `PortableEntity.exportAll` signal-free in `@orb/contracts/portability`.

import type {
  ReportProgress,
  WorkloadEstimateScope,
  WorkloadKind,
  WorkloadLane,
  WorkloadParamsByKind,
  WorkloadResultByKind,
  WorkloadResumePolicy,
  WorkloadRunContext,
} from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { z } from "zod";

/**
 * ONE domain-contributed job. The params/result TYPES are authored in the OWNING domain's contracts module
 * (`@orb/contracts/<owner>`) and correlated to the kind by `WorkloadParamsByKind`/`WorkloadResultByKind`;
 * this interface only carries the execution policy the substrate needs plus the run body.
 */
export interface WorkloadContribution<K extends WorkloadKind = WorkloadKind> {
  readonly kind: K;
  /** The kind's params schema — the ONE validator (`start` parses it; the row read path re-parses it). */
  readonly params: z.ZodType<WorkloadParamsByKind[K]>;
  readonly lane: WorkloadLane;
  /**
   * The lane for a row whose params change what its work is, e.g. a dry-run preview a person watches versus the
   * import itself. The enqueue doors (`start`, `retry`) stamp its answer in place of {@link WorkloadContribution.lane},
   * which still names the lane of a row whose params cannot be read (a poison retry). OMIT IT when every row of
   * the kind belongs on one lane.
   */
  readonly laneFor?: (params: WorkloadParamsByKind[K]) => WorkloadLane;
  /**
   * The ADMISSION sub-partition: what this kind's CONCURRENCY UNIT is, derived from the row's own params and
   * stamped into `workloads.admission_key` at the enqueue door. Two active rows of one kind collide only when
   * their keys match, so `index` returns its embed source (text + image reindex at once) and `databank-ingest`
   * returns its documentId (a whole bank ingests at once; ONE document twice is still refused).
   *
   * OMIT IT when the kind IS its own unit — the row then carries the shared `DEFAULT_ADMISSION_KEY` bucket
   * and the lock stays per-(kind, owner) for a singular run / per-(kind) for a bulk one. This lives on the
   * CONTRIBUTION and not in the queue because only the owning domain knows what "the same work" means
   * (the queue spells no domain's vocabulary — D117). LANES are execution, keys are admission; the two never
   * interact: a lane decides WHEN a row runs, a key decides WHETHER it may be enqueued at all.
   */
  readonly admissionKey?: (params: WorkloadParamsByKind[K]) => string;
  /**
   * The ADMISSION PRECONDITION: may this row be enqueued AT ALL right now (#156)? Returns `null` to admit, or
   * the REASON — a sentence the person who hit it can act on — to refuse. Evaluated at every enqueue door
   * (`start`, `retry`) after the owner is resolved, so the refusal happens before a row exists instead of a
   * run producing a vacuous success.
   *
   * WHY THE PRECONDITION LIVES ON THE CONTRIBUTION, exactly like `admissionKey`: only the owning domain knows
   * when its work is meaningless (the queue spells no domain's vocabulary — D117). The measured case: memory
   * backfill enqueued while the host has memory DISABLED, which the sweep then skips per-host (#54) and lands
   * as "0 segments · 0 digests" success. ADMISSION, never execution — a job that structurally cannot produce
   * anything must not enter the queue.
   *
   * `ownerId` is the ROW's enumeration scope (`null` = the bulk all-owners pass), so a per-user precondition
   * admits a bulk sweep and judges only a singular one. OMIT IT when the kind is always meaningful.
   */
  readonly admit?: (args: { readonly ownerId: UserId | null; readonly params: WorkloadParamsByKind[K] }) => Promise<string | null>;
  /**
   * Whether this run reaches something only the box owner may reach, whatever the row's owner. Every door a person
   * calls refuses anyone else before anything is stored or counted, schedules included, so this is authority and never
   * an {@link WorkloadContribution.admit} precondition. A system trigger is judged too: the tick against the schedule's
   * owner, and the runner against the row before its body, so a stored run refuses whatever build stored it. OMIT IT
   * when any authed caller may run the kind on their own data.
   */
  readonly ownerOnly?: (params: WorkloadParamsByKind[K]) => boolean;
  /**
   * How many Utility-model calls a run over this scope would make, counted by the owning domain WITHOUT running
   * or writing anything, so a person confirms a library-wide paid run knowing its size. `ownerId` is the row's
   * enumeration scope (`null` = the bulk pass) and `funderUserId` is whose Utility model the run would spend.
   * OMIT IT when the kind makes no generative model call.
   */
  readonly modelCalls?: (args: WorkloadEstimateScope & { readonly funderUserId: UserId | null; readonly params: WorkloadParamsByKind[K] }) => Promise<number>;
  readonly resume: WorkloadResumePolicy;
  /**
   * The kinds this one must never run BESIDE, for any owner, on any lane or replica (D334). The exclusion binds
   * both ways, so the kind that cares declares it once. OMIT IT when the kind can run beside any other.
   */
  readonly excludes?: readonly WorkloadKind[];
  /** The run body — a compose-built closure over the OWNING domain's own verbs. No shared env hub. */
  readonly run: (ctx: WorkloadRunContext, params: WorkloadParamsByKind[K], report: ReportProgress, signal: AbortSignal) => Promise<WorkloadResultByKind[K]>;
  /**
   * Free what an admitted row holds outside the database when a cancel ends it before it ever ran, since `run`'s own
   * cleanup then never starts. The row is already terminal when this runs, so it must not reject: what it cannot
   * free stays for {@link WorkloadContribution.sweepOnBoot}. OMIT IT when a queued row holds nothing.
   */
  readonly releaseUnrun?: (row: { readonly ownerId: UserId | null; readonly params: WorkloadParamsByKind[K] }) => Promise<void>;
  /**
   * Free what dead processes and rows that never ran left outside the database. It runs once per kind that declares
   * it, after the boot reclaim and before the worker starts, so no run is live and every row that may still run is
   * in `active`. A rejection is logged and leaves the boot running. OMIT IT when the kind leaves nothing behind.
   */
  readonly sweepOnBoot?: (active: readonly ActiveWorkloadRow[]) => Promise<void>;
}

/** A row that may still run, of any kind, with its params as stored: a row this build cannot parse still names what it holds. */
export interface ActiveWorkloadRow {
  readonly kind: WorkloadKind;
  readonly params: unknown;
}

/**
 * ONE contribution of ANY kind, correlated. The DISTRIBUTED union (never `WorkloadContribution<WorkloadKind>`,
 * whose `run` would take the union of every kind's params and accept none of them) — the type a heterogeneous
 * list of contributions, e.g. a domain factory's return or the compose assembler's input, is spelled with.
 */
export type AnyWorkloadContribution = { [K in WorkloadKind]: WorkloadContribution<K> }[WorkloadKind];

/**
 * The registry the engine dispatches through, assembled ONCE at `entry/compose` from the per-domain
 * factories. The mapped-type key is the COMPLETENESS PIN: a kind with no contribution is a tsc error at the
 * composition root (the §5.5 dispatch law with ownership inverted — the map is built from what the owners
 * hand up, instead of workloads importing every owner's runner).
 */
export type WorkloadContributions = { readonly [K in WorkloadKind]: WorkloadContribution<K> };
