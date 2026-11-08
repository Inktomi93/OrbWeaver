// Snap's wall-clock ceilings: each is `budget` over its quiet-box base, stretched by box contention.
// A ceiling is a verdict input (an overrun is a finding), so a base is never widened to be safe.
// The `*_SETTLE_MS` and `*_REVEAL_MS` values are sleeps the run always pays, so they are never scaled.
import type { BoxLoadReader } from "../../floor/host/load-budget.ts";
import { budgets } from "../../floor/host/load-budget.ts";
import { processEnvValue } from "../../floor/process/process-env.ts";

const STAGE_READY_BASE_MS = 60_000;

/** The quiet-box base of every snap ceiling. A key here gets its ceiling in {@link SNAP_CEILINGS_MS}. */
export const SNAP_BASES_MS = {
  nav: 15_000,
  waitSelector: 10_000,
  /** A cold `--isolated`/`--dirty` stage transforms its module graph on demand, so its first navigation runs far past the shared stack's. */
  stageNav: 90_000,
  stageReady: STAGE_READY_BASE_MS,
  /** Explicit cold bootstrap waits on one document for its actual readiness signal. */
  coldStartReady: 2 * STAGE_READY_BASE_MS,
  /** A `--cpu-throttle`/`--network` arm slows the clock it is judged against; the un-throttled ceiling would refuse the arm itself. */
  throttledNav: 90_000,
  throttledReady: 60_000,
  step: 5000,
  networkIdle: 10_000,
} as const satisfies Readonly<Record<string, number>>;

type SnapCeilingName = keyof typeof SNAP_BASES_MS;
export type SnapCeilings = Readonly<Record<SnapCeilingName, number>>;

/** Every base through `budget`, read against one box reading. */
export function snapCeilings(read?: BoxLoadReader): SnapCeilings {
  return budgets(SNAP_BASES_MS, read);
}

/** The ceilings in force for this process, read once at module load (each snap run is a fresh process). */
export const SNAP_CEILINGS_MS: SnapCeilings = snapCeilings();
// Let transitions/queries settle between steps (drawer slides, panel drops).
export const STEP_SETTLE_MS = 400;
// After a --force-click hover: give group-hover reveals a beat before the forced click.
export const HOVER_REVEAL_MS = 150;
// Default post-nav settle so onMount queries have a chance to fire.
export const MOUNT_SETTLE_MS = 500;
// How many DISTINCT emitted design-audit finding selectors are proven unique in Node (#1326). Each proof
// is a Playwright round trip, so the sweep is bounded and the remainder is published as UNPROVEN rather
// than counted as unique — an unasked question must never render like a clean answer. Comfortably above
// the worst real surface measured 2026-09-04 (13 distinct selectors on /corpus).
const DESIGN_AUDIT_SELECTOR_PROOF_CAP = 64;
/** The env override on that cap — a HARNESS knob, not an operator one (#1566). The cap's failure mode is
 *  a truncation that reads clean, and the only end-to-end proof of the truncation is a run that EXCEEDS
 *  it. Reaching 64 distinct emitted selectors on a real surface needs ~13 firing rules over a planted
 *  page: expensive to build, expensive to run, and fragile against every future rule change. Lowering the
 *  cap to 1 for one CLI invocation proves the same mechanism against the same code path.
 *
 *  ONE spelling, read ONCE at module load — every consumer is a fresh process (the snap CLI is spawned per
 *  run), so a caller sets it in the CHILD's environment, never mid-process. A non-numeric or non-positive
 *  value falls back to the shipped cap rather than silently disabling the proof. */
const SELECTOR_PROOF_CAP_ENV = "ORB_SNAP_SELECTOR_PROOF_CAP";
const SELECTOR_PROOF_CAP_OVERRIDE = Number(processEnvValue(SELECTOR_PROOF_CAP_ENV));

/** The proof cap in force for THIS process. */
export function designAuditSelectorProofCap(): number {
  return Number.isInteger(SELECTOR_PROOF_CAP_OVERRIDE) && SELECTOR_PROOF_CAP_OVERRIDE > 0 ? SELECTOR_PROOF_CAP_OVERRIDE : DESIGN_AUDIT_SELECTOR_PROOF_CAP;
}
// The daemon's outer watchdog base for a non-navigating `--session … --design-audit` call. The walk is a
// full-page census plus a pixel settle plus a forced-state pass; the shared load scaler is applied once
// by the daemon on top of this (contract/arms.ts sessionCallBaseMs).
export const DESIGN_AUDIT_SESSION_CALL_BASE_MS = 120_000;
