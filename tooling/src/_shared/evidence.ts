// ZERO HYGIENE (#409) — the fleet's one home for "absent evidence is never a verdict".
//
// The rule the ast scan ledger already speaks for a zero-scan run ("a zero-scan run is a TOOL ERROR,
// never a clean no-results", tooling/src/ast/lib/ledger.ts) said for every measuring instrument here:
// a probe whose APPARATUS was absent (no `__orb` bridge, no in-page meter, no observability middleware)
// or whose EVIDENCE POPULATION was empty (no composited frame, no censused node, no span) has measured
// NOTHING — and `0%` / `no findings — clean` / `PASS` over nothing is a claim about the app that
// nothing observed. Such a run exits EXIT.toolError (2 — "the run is NOT a verdict"), never 0.
//
// THE NUANCE EACH TOOL DECIDES FOR ITSELF, with the receipt in its own comment: where an empty
// population is a LEGITIMATE outcome of a healthy apparatus (a quiet-but-healthy SSE room, an empty
// trace ring), the run stays clean and the tool must instead SAY the population was empty — silence
// that reads as success is the same defect wearing different clothes.
import { print } from "./artifacts.ts";
import { EXIT } from "./exit-contract.ts";

/** One absent input a verdict would otherwise have read as clean. */
export interface EvidenceGap {
  /** WHAT was absent, in the operator's vocabulary — the noun the message leads with. */
  readonly evidence: string;
  /** Why the run is not a verdict, and what the operator does about it. */
  readonly detail: string;
}

/** The RESULT-line verdict value for a run that measured nothing. Never PASS, and never FAIL either —
 *  a FAIL is a claim about the app, and this run made no observation to base one on. */
export const INSTRUMENT_ERROR_VERDICT = "INSTRUMENT-ERROR";

/** The loud human half — one block per gap, led by the absent noun. */
export function printEvidenceGaps(gaps: readonly EvidenceGap[]): void {
  for (const gap of gaps) {
    print(`INSTRUMENT ERROR  ${gap.evidence} is ABSENT — this run is not a verdict`);
    print(`                  ${gap.detail}`);
  }
}

/** Print the gaps and hand back the exit code, for the fail-fast call sites that have nothing else to
 *  report. `EXIT.toolError` is the contract's "the run is NOT a verdict" code (AGENTS.md §4). */
export function instrumentError(...gaps: readonly EvidenceGap[]): number {
  printEvidenceGaps(gaps);
  return EXIT.toolError;
}
