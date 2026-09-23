// The exit-code CLASSIFIERS (UNIFIED-VERIFICATION-DESIGN.md §3.1) — tiny named adapters, written ONCE —
// plus the run-level AGGREGATION over them. The contract (§3.3): 0 clean · 1 violations · 2 tool error ·
// 3 misuse; a signal-kill (null) is ALWAYS a tool error (2), never a verdict. Split out of lib/registry.ts
// and ops/run.ts at the @orb/tooling P6 move (size cap §4.3); the adapters are unchanged.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { StageResult } from "../contract/stage.ts";

const EXIT_CLEAN = EXIT.clean;
const EXIT_VIOLATIONS = EXIT.violations;
const EXIT_TOOL_ERROR = EXIT.toolError;
const EXIT_MISUSE = EXIT.misuse;

/** External tools whose non-zero means "found problems" (tsc's 2 = type errors, biome/vitest/playwright/
 *  depcruise/jscpd/cpd). Any non-zero → violation (1); we never trust the foreign digit to mean the
 *  scheme's 2/3. A signal-kill (null) is a tool error. */
export const asViolations = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === null) {
    return EXIT_TOOL_ERROR;
  }
  return s === EXIT_CLEAN ? EXIT_CLEAN : EXIT_VIOLATIONS;
};

/** eslint's OWN scheme: 0 clean · 1 lint problems · 2 config/internal error (its 2 IS a tool error —
 *  the opposite of tsc's 2). */
export const eslintScheme = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === null || s >= EXIT_TOOL_ERROR) {
    return EXIT_TOOL_ERROR;
  }
  return s === EXIT_CLEAN ? EXIT_CLEAN : EXIT_VIOLATIONS;
};

/** Our OWN scheme-speaking node scripts (structure/scoped/verify/doc): 0/1/2/3 pass through;
 *  an unexpected code is itself a tool error (2). */
export const ownScheme = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === EXIT_CLEAN || s === EXIT_VIOLATIONS || s === EXIT_TOOL_ERROR || s === EXIT_MISUSE) {
    return s;
  }
  return EXIT_TOOL_ERROR;
};

const SEVERITY_RANK: Readonly<Record<number, number>> = {
  [EXIT_TOOL_ERROR]: 3,
  [EXIT_MISUSE]: 2,
  [EXIT_VIOLATIONS]: 1,
  [EXIT_CLEAN]: 0,
};

function severityRank(code: number): number {
  return SEVERITY_RANK[code] ?? 0;
}

/** The run's exit = the highest-severity stage exit (2 \> 3 \> 1 \> 0). */
export function aggregateExit(codes: readonly number[]): number {
  let worst: number = EXIT_CLEAN;
  for (const code of codes) {
    if (severityRank(code) > severityRank(worst)) {
      worst = code;
    }
  }
  return worst;
}

// ── #2225: A STAGE THAT RAN AND PRODUCED NO VERDICT ───────────────────────────────────────────────────
//
// THE GENERAL FORM OF #2220. `lint:hook-syntax` exited 2 on every static run from the day it landed — its
// `argv[0]` resolved to a `node_modules/.bin/bash` that cannot exist — and nobody noticed for a day,
// because a tier counts REDS and a stage that never executed is not red in any way a reader looks at. The
// aggregate exit was 2 the whole time; the CAUSE was found by opening a log.
//
// So "did every registered stage that ran actually measure something" becomes a QUESTION THE ARTIFACT
// ANSWERS, asked of two independent facts and not of one:
//
//   (a) the classified exit is 2   — the §3.3 tool-error class: the run is not a verdict, and
//   (b) the CHILD reported no exit — `childExit === null`: killed, timed out, or never spawned.
//
// (b) IS NOT REDUNDANT WITH (a), and that is the whole reason it is a disjunction. `StageDef.classify` is
// per-stage DATA. The four adapters above all map `null` to a tool error, but that is a property of four
// functions rather than of the contract: a row spelling `classify: (s) => (s === 0 ? 0 : 1)` would answer
// 1 for a KILLED child, and `(s) => 0` would answer green. Asking the raw digit as well means a laundering
// classifier cannot hide a stage that measured nothing — the failure this module is named after.
/** Did this stage RUN AND FAIL TO PRODUCE A VERDICT? A deferred/skipped stage did not run, so it is not a
 *  no-verdict — it is an honestly-declared non-run with a `runsAt` naming where it does run, and calling it
 *  "never measured" would drown the real ones in every scoped run's deferrals. */
export function producedNoVerdict(stage: StageResult): boolean {
  if (stage.mode === "deferred" || stage.mode === "skipped") {
    return false;
  }
  return stage.exitCode === EXIT_TOOL_ERROR || stage.childExit === null;
}

/** The `VerifyReport.noVerdict` list — every no-verdict stage BY NAME, in registry order. `[]` is the
 *  honest zero: every stage that ran came back with a verdict. */
export function noVerdictStages(stages: readonly StageResult[]): readonly string[] {
  return stages.filter(producedNoVerdict).map((stage) => stage.name);
}

// WHAT THIS DELIBERATELY DOES NOT DO, so the next reader does not "finish" it. The run's exit is still
// `aggregateExit` over the CLASSIFIED codes, and a no-verdict stage does NOT force the run to 2 on its own.
// That rule was proposed with this pair and REFUSED (orchestrator ruling, 2026-09-13): the 0/1/2/3 exit
// contract is repo-wide law and overriding a row's own `classify` changes the exit semantics of every tier
// including the commit bar, which is an owner-scale decision and not this row's. #2225 asks for VISIBILITY,
// and `noVerdictStages` + the summary's NO-VERDICT block are exactly that. The residual hazard is stated
// rather than patched: today `asViolations`, `eslintScheme` and `ownScheme` ALL map `null` to a tool error,
// so the aggregate is 2 by arithmetic and the two answers agree — a future row spelling its own laundering
// `classify` is what would separate them, and there is none on the tree. MEASURED 2026-09-13 over both
// registry modules: 46 rows carry a `classify`, and every one names an adapter from this file — 25
// `asViolations`, 20 `ownScheme`, 1 `eslintScheme`, and ZERO inline lambdas (the same scan matches a
// `classify: (` opener and found none). So the laundering hazard is LATENT, not live.
