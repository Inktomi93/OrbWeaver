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
import type { ResultPair } from "./artifacts.ts";
import { print, printResult } from "./artifacts.ts";
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

export const DENOMINATOR_REFUSALS = ["below", "unstable", "zero"] as const;
export type DenominatorRefusal = (typeof DENOMINATOR_REFUSALS)[number];

/** One population a clean verdict depends on. `honestEmpty` is deliberately narrow: it can explain a
 *  measured zero, but it can never launder an absent, non-finite, or sentinel (`-1`) population. */
export interface VerdictDenominator {
  readonly value: number | null | undefined;
  readonly refuseWhen: DenominatorRefusal;
  readonly floor?: number;
  readonly honestEmpty?: string;
}

export interface VerdictOptions {
  readonly verdict: number;
  readonly denominators: Readonly<Record<string, VerdictDenominator>>;
  readonly pairs: readonly ResultPair[];
}

export interface VerdictReceipt {
  readonly exit: number;
  /** The exact normalized payload handed to `printResult`. Persist this receipt, never the raw input. */
  readonly pairs: readonly ResultPair[];
}

/** The loud human half — one block per gap, led by the absent noun. */
export function printEvidenceGaps(gaps: readonly EvidenceGap[]): void {
  for (const gap of gaps) {
    print(`INSTRUMENT ERROR  ${gap.evidence} is ABSENT — this run is not a verdict`);
    print(`                  ${gap.detail}`);
  }
}

/** Print the gaps and hand back the exit code, for the fail-fast call sites that have nothing else to
 *  report. `EXIT.toolError` is the contract's "the run is NOT a verdict" code (AGENTS.md "Verification tiers"). */
export function instrumentError(...gaps: readonly EvidenceGap[]): number {
  printEvidenceGaps(gaps);
  return EXIT.toolError;
}

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined;
}

function denominatorRefusal(name: string, denominator: VerdictDenominator): string | null {
  const { value, refuseWhen } = denominator;
  if (isMissing(value)) {
    return `${name} is absent`;
  }
  if (!Number.isFinite(value)) {
    return `${name} is unstable (${String(value)})`;
  }
  if (value === -1) {
    return `${name} is the -1 absent/unstable sentinel`;
  }
  if (refuseWhen === "zero" && value === 0) {
    return denominator.honestEmpty === undefined ? `${name} is empty (0)` : null;
  }
  if (refuseWhen === "unstable" && value < 0) {
    return `${name} is unstable (${value.toString()})`;
  }
  if (refuseWhen === "below") {
    if (denominator.floor === undefined || !Number.isFinite(denominator.floor)) {
      return `${name} declares "below" without a finite floor`;
    }
    if (value < denominator.floor) {
      return `${name}=${value.toString()} is below floor ${denominator.floor.toString()}`;
    }
  }
  return null;
}

function verdictPairs(options: VerdictOptions, refused: boolean): ResultPair[] {
  const pairs = options.pairs.filter(([key]) => key !== "verdict" && !(key in options.denominators));
  const existingVerdict = options.pairs.find(([key]) => key === "verdict")?.[1];
  if (refused) {
    pairs.unshift(["verdict", INSTRUMENT_ERROR_VERDICT]);
  } else if (existingVerdict !== undefined) {
    pairs.unshift(["verdict", existingVerdict]);
  }
  for (const [name, denominator] of Object.entries(options.denominators)) {
    pairs.push([name, denominator.value ?? -1]);
    if (denominator.value === 0 && denominator.honestEmpty !== undefined) {
      pairs.push([`honest-empty-${name}`, denominator.honestEmpty]);
    }
  }
  return pairs;
}

/** The fleet verdict door. A non-clean run may report partial populations because it is already loud; a
 *  clean run is refused unless every declared denominator proves the population it judged. */
export function printVerdictReceipt(tool: string, options: VerdictOptions): VerdictReceipt {
  const refusals = Object.entries(options.denominators)
    .map(([name, denominator]) => denominatorRefusal(name, denominator))
    .filter((refusal): refusal is string => refusal !== null);
  if (options.verdict === EXIT.clean && Object.keys(options.denominators).length === 0) {
    refusals.unshift("no denominators were declared");
  }
  const refused = options.verdict === EXIT.clean && refusals.length > 0;
  if (refused) {
    printEvidenceGaps([
      {
        evidence: "the verdict denominator",
        detail: `${refusals.join("; ")} — a clean result over that population is not a verdict`,
      },
    ]);
  }
  const pairs = verdictPairs(options, refused);
  printResult(tool, pairs);
  return { exit: refused ? EXIT.toolError : options.verdict, pairs };
}

/** Compatibility door for fleet callers that only need the numeric exit. Normalization still happens
 *  exactly once in `printVerdictReceipt`; callers that persist RESULT truth consume its full receipt. */
export function printVerdict(tool: string, options: VerdictOptions): number {
  return printVerdictReceipt(tool, options).exit;
}
