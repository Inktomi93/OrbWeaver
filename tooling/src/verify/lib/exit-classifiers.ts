// The exit-code CLASSIFIERS (UNIFIED-VERIFICATION-DESIGN.md §3.1) — tiny named adapters, written ONCE —
// plus the run-level AGGREGATION over them. The contract (§3.3): 0 clean · 1 violations · 2 tool error ·
// 3 misuse; a signal-kill (null) is ALWAYS a tool error (2), never a verdict. Split out of lib/registry.ts
// and ops/run.ts at the @orb/tooling P6 move (size cap §4.3); the adapters are unchanged.
import { EXIT } from "@orb/tooling/_shared/exit-contract";

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

/** Our OWN scheme-speaking node scripts (structure/scoped/verify/doc-catalog): 0/1/2/3 pass through;
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
