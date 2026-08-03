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
  WorkloadKind,
  WorkloadLane,
  WorkloadParamsByKind,
  WorkloadResultByKind,
  WorkloadResumePolicy,
  WorkloadRunContext,
} from "@orb/contracts/workloads";
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
  readonly resume: WorkloadResumePolicy;
  /** The run body — a compose-built closure over the OWNING domain's own verbs. No shared env hub. */
  readonly run: (ctx: WorkloadRunContext, params: WorkloadParamsByKind[K], report: ReportProgress, signal: AbortSignal) => Promise<WorkloadResultByKind[K]>;
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
