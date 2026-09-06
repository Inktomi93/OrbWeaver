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
// THE MARK IS ONE-WAY AND CHEAP. `markStageBootDead` on a run with no stage binding (the dev stack, `--base`,
// `--file`) is a no-op by construction, so the drive path may call it unconditionally on a non-settled arm
// without knowing whether it is on a stage. Consumption is `takeBootDeadStage()`, which clears the latch —
// a session daemon (which owns its stage's lifecycle for the life of the session, and never calls the
// consumer) therefore sets a latch that is simply never read, rather than getting its stage killed under it.
import type { StageRow } from "../contract/stage.ts";

/** The stage row this run is bound to, plus the two facts a teardown decision needs about it. */
export interface StageRunBinding {
  readonly row: StageRow;
  /** The band table's home, captured with the row so the consumer never re-derives it. */
  readonly home: string;
  /** TRUE only when THIS run built the stage from nothing — never a warm reuse, never a sibling's. */
  readonly booted: boolean;
}

let binding: StageRunBinding | null = null;
let bootDeadReason: string | null = null;

/** Publish the stage this run bound. Called once, by `ensureStage`'s single exit. */
export function registerStageRunBinding(bound: StageRunBinding): void {
  binding = bound;
  bootDeadReason = null;
}

/** Latch "this run's stage never served a ready app". No-op unless this run BOOTED a stage. */
export function markStageBootDead(reason: string): void {
  if (binding === null || !binding.booted) {
    return;
  }
  bootDeadReason ??= reason;
}

/** The boot-dead stage to tear down, or null — clears the latch, so a second caller gets nothing. */
export function takeBootDeadStage(): { readonly binding: StageRunBinding; readonly reason: string } | null {
  const reason = bootDeadReason;
  const bound = binding;
  bootDeadReason = null;
  if (reason === null || bound === null) {
    return null;
  }
  binding = null;
  return { binding: bound, reason };
}

/** Test seam: forget this process's binding (a suite must not inherit another test's).
 *
 * @public Test-anchored module surface; focused tests pin this process-local behavior.
 */
export function __resetStageRunBinding(): void {
  binding = null;
  bootDeadReason = null;
}
