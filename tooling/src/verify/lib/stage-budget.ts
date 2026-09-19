// HOW LONG A STAGE MAY TAKE BEFORE IT IS WEDGED — the runner's one budget question, answered from DATA.
//
// THE DEFECT (#1848). `ops/run.ts` carried `STAGE_TIMEOUT_BASE_MS = 2_700_000` — one hand-typed 45 minutes
// applied to EVERY stage — while #1835 moved the CT suite onto the shared profile's worker cap. The product
// test stage's honest runtime then exceeded its own ceiling, and `pnpm verify --full` on 2026-09-06
// reported `‼ tests:node (2700284ms) [tool-error]` on a QUIET box (load 6-8/24): a false tool error, which
// under the exit contract means "the run is not a verdict" — for a stage that was merely still working.
// A ceiling below the runtime it guards is not a hang detector; it is a scheduled lie.
//
// SO THE NUMBER IS DERIVED, NOT TYPED. `tooling/concurrency-profile.json` (THE ONE HOME for every cap,
// #1835) carries a `stageBudgets` row: a default, the CT suite's measured WORKER-minutes, the slack factor
// a hang detector needs over an honest run, and the host-slot wait a CT run may legitimately spend queueing
// INSIDE its own wall clock. Change `ctWorkers` and every ceiling that depends on it moves by itself —
// which is the property whose absence caused this.
//
// IT IS STILL NOT A PERFORMANCE BUDGET. Past the ceiling the stage's process group dies (and, since #1848,
// its escaped browsers with it), and the classifier scores that a tool error. The load stretch on top —
// `budget()`, `tooling-clock-budget` — is the runner's, applied where the clock is consumed.
import { readStageBudgets } from "@orb/tooling/_shared/concurrency-profile";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { StageDef } from "../contract/stage.ts";

refuseDirectInvocation(import.meta.url, "pnpm verify");

/** THE CEILING for one stage, in quiet-box ms: its own declared `hangCeilingBaseMs` (itself derived from
 *  the profile — see `ctSuiteHangCeilingMs`), else the profile's default. The runner passes the result
 *  through `budget()`; this function answers only "what base". */
export function stageHangCeilingBaseMs(stage: StageDef): number {
  return stage.hangCeilingBaseMs ?? readStageBudgets().defaultMs;
}

/** The ceiling for the WHOLE-CT-SUITE stage — the one stage whose runtime is a function of a worker cap.
 *  Read at registry construction so `verify --list` and the run agree, and so a profile switch
 *  (`ORB_DEDICATED_BOX=1`) moves the ceiling with the workers. */
export function ctSuiteHangCeilingMs(): number {
  return readStageBudgets().ctSuiteMs;
}

/** The ceiling for the MUTATION-GATE stage — a whole-corpus Stryker pass runs for hours, so its ceiling is
 *  its own profile row (owner-ruled 2026-09-19), read the same way the CT ceiling is. */
export function mutationGateHangCeilingMs(): number {
  return readStageBudgets().mutationGateMs;
}
