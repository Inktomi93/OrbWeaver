// WHICH STAGE THIS RUN BOUND, AND WHETHER THIS RUN BOOTED IT — the process-local handoff from the stage
// owner (`ops/stage.ts` `ensureStage`) to the boot-dead teardown (`ops/stage-teardown.ts`), shaped exactly
// like `lib/run-provenance.ts`'s handoff to the run-index writer: typed, set once, taken once, never
// reconstructed from argv or from a mutable band table after the fact.
//
// WHY IT CARRIES `booted` AND NOT JUST THE ROW (#1837). #324's ruling stands and this file exists to keep
// it standing: "the fix is NOT teardown at run completion — staying warm across runs (and across checkouts,
// #108's `shared-reuse`) is the whole feature". Tearing down a stage this run merely REUSED — ours warm, or
// a sibling checkout's at the same sha — is precisely the harm that ruling forbids, and it would be a harm
// to a THIRD party in the shared-reuse case. So the only row this latch will ever hand to a teardown is one
// THIS run booted from nothing, and the only condition that hands it over is the app never having settled
// (`ops/drive.ts`, after the warm-up re-navigation). #324's input changed, not its rule: a stage that never
// served a ready app is not a warm asset, it is a corpse holding a band, a port pair and a process group
// for the full 60 min TTL, and every later run that reuses it re-inherits the same dead app.
//
// ONE EXCEPTION TO "BOOTED ONLY": a stage whose server and vite still answered after the booting run's first
// navigation missed readiness is kept WARMING (a cold dependency optimize can outlast the client's ceiling),
// and the next run that reuses it is that stage's one warm retry. A miss on the retry is the boot-dead verdict;
// a settle clears the mark. The decision is `ops/stage-teardown.ts` `settleStageReadiness`.
//
// THE MARK IS ONE-WAY AND CHEAP. `markStageUnsettled` on a run with no stage binding (the dev stack, `--base`,
// `--file`) is a no-op by construction, so the drive path may call it unconditionally on a non-settled arm
// without knowing whether it is on a stage. Consumption is `takeStageOutcome()`, which clears the latch —
// a session daemon (which owns its stage's lifecycle for the life of the session, and never calls the
// consumer) therefore sets a latch that is simply never read, rather than getting its stage killed under it.
import type { StageBoundIdentity, StageRow } from "../contract/stage.ts";
import { urlStageBand } from "./stage-plan.ts";

/** The stage row this run is bound to, plus the two facts a teardown decision needs about it. */
export interface StageRunBinding {
  readonly row: StageRow;
  /** The band table's home, captured with the row so the consumer never re-derives it. */
  readonly home: string;
  /** TRUE only when THIS run built the stage from nothing — never a warm reuse, never a sibling's. */
  readonly booted: boolean;
}

let binding: StageRunBinding | null = null;
let unsettledReason: string | null = null;
let settled = false;

/** Publish the stage this run bound, replacing any earlier binding and its latch. Called once, by `ensureStage`'s
 *  single exit. */
export function registerStageRunBinding(bound: StageRunBinding): void {
  binding = bound;
  unsettledReason = null;
  settled = false;
}

/** The stage row this run bound, or null. The BAND-CLAIM guard's entitlement input (#2441): the allocator
 *  already decided this run may read this band — including arm 2's `shared-reuse` of a sibling's row at our
 *  sha — so the guard asks "did my own allocation hand me this band?" instead of re-deriving entitlement
 *  from the shared table, which is what made it call the allocator's own answer `foreign`. */
export function boundStageRow(): StageRow | null {
  return binding?.row ?? null;
}

function sameProvenance(a: StageBoundIdentity["dbProvenance"], b: StageBoundIdentity["dbProvenance"]): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.copiedFrom === b.copiedFrom && a.cloned === b.cloned && a.copiedAt === b.copiedAt;
}

function dbSource(row: StageBoundIdentity): string {
  return row.dbProvenance === null ? "no recorded db source" : row.dbProvenance.copiedFrom;
}

/** Why the table no longer carries the stage this run bound, or null while it still does. A band that was
 *  rebuilt or re-let under the run serves other data than the run staged, and the data is the review's
 *  subject: the db provenance changing (a clone replaced by the dev db, or by another clone) is the swap
 *  the run could not otherwise see. */
export function stageBindingDrift(bound: Pick<StageRow, "band"> & StageBoundIdentity, rows: readonly StageRow[]): string | null {
  const current = rows.find((candidate) => candidate.band === bound.band);
  if (current === undefined) {
    return `band ${bound.band} has no row any more`;
  }
  if (current.sha !== bound.sha || current.dir !== bound.dir || current.startedAt !== bound.startedAt) {
    return `band ${bound.band} was rebuilt (booted ${bound.startedAt}, now ${current.startedAt})`;
  }
  if (!sameProvenance(bound.dbProvenance, current.dbProvenance)) {
    return `band ${bound.band} now serves a different database (bound to ${dbSource(bound)}, now ${dbSource(current)})`;
  }
  return null;
}

/** The exit-2 text for a `--base` that addresses the band this run bound when the table no longer carries
 *  the bound stage, or null while it does or when the URL addresses another band. */
export function stageBindingRefusal(url: string, bound: StageRow, rows: readonly StageRow[]): string | null {
  const drift = urlStageBand(url) === bound.band ? stageBindingDrift(bound, rows) : null;
  return drift === null
    ? null
    : `STAGE ERROR  ${url} no longer serves the stage this run bound — ${drift} — nothing was measured. A stage rebuilt under a run is never measured; run again to stage afresh.`;
}

/** Latch "this run's first navigation never reached a ready app". A no-op unless this run BOOTED the stage or the
 *  stage is already warming, where this run is its one warm retry; a plain reuse stays untouched (#324). */
export function markStageUnsettled(reason: string): void {
  if (binding === null || !(binding.booted || binding.row.warming !== undefined)) {
    return;
  }
  unsettledReason ??= reason;
}

/** Latch "this run's navigation reached a resolved app". Only a warming stage has a mark for it to clear. */
export function markStageSettled(): void {
  if (binding?.row.warming !== undefined) {
    settled = true;
  }
}

/** What this run learned about the readiness of the stage it bound. */
export type StageOutcome =
  | { readonly kind: "unsettled"; readonly binding: StageRunBinding; readonly reason: string }
  | { readonly kind: "settled"; readonly binding: StageRunBinding };

/** The readiness outcome to act on, or null — clears the latch, so a second caller gets nothing. An unsettled
 *  navigation outranks a settled one: the first document's failure is not erased by a later healthy one. */
export function takeStageOutcome(): StageOutcome | null {
  const reason = unsettledReason;
  const wasSettled = settled;
  const bound = binding;
  unsettledReason = null;
  settled = false;
  if (bound === null) {
    return null;
  }
  if (reason !== null) {
    binding = null;
    return { kind: "unsettled", binding: bound, reason };
  }
  return wasSettled ? { kind: "settled", binding: bound } : null;
}
