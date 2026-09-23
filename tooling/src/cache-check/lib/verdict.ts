// The cache floor and the pure verdict: how a case's measured calls are judged and which exit a run earns.
// A call is judged against the PREVIOUS call's whole prompt, never against what that call cached: a broken
// placement makes both calls agree on a shorter prefix, which reads 1.0 against "what was cached".
import type { VerdictOptions } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { CacheRoute, CallUsage, CaseEvidence, CaseJudgement, CaseOutcome, CaseVerdict, JudgedPair } from "../contract/types.ts";
import { CASE_VERDICTS } from "../contract/types.ts";

/**
 * The measured calibration the floor derives from.
 *
 * @remarks The costliest healthy placement is a depth-4 note that moves every turn: the rows below it change,
 * so the next call cannot read them. Pinning the deeper breakpoint above the note kept this share of the
 * prefix on a live direct turn.
 */
export const FLOOR_CALIBRATION = {
  keptTokens: 11_955,
  prefixTokens: 12_190,
  evidence: "req_011CfKhUP2fTSHPkSMQuMfv3",
} as const;

/** The share of the previous call's prompt the next call must read from the cache. */
export const CACHE_READ_FLOOR = FLOOR_CALIBRATION.keptTokens / FLOOR_CALIBRATION.prefixTokens;

function unmeasured(reason: string): CaseJudgement {
  return { verdict: "ERROR", reason };
}

/** A call with every count present. */
interface MeasuredCall {
  readonly call: CallUsage;
  readonly promptTokens: number;
  readonly readTokens: number;
}

/** Why a call cannot be judged, or its counts. */
function measurable(call: CallUsage, cacheMinTokens: number): MeasuredCall | string {
  const { id, promptTokens, readTokens, writeTokens } = call;
  if (promptTokens === null || readTokens === null || writeTokens === null) {
    return `no usage recorded on ${id}`;
  }
  // Below the minimum the provider caches nothing at all, so a zero read there says nothing about placement.
  if (promptTokens < cacheMinTokens) {
    return `${id} sent ${promptTokens} prompt tokens, below the model's cache minimum ${cacheMinTokens}`;
  }
  // The floor is a share of the calibration prefix; on a shorter prompt a healthy tail can fall below it.
  if (promptTokens < FLOOR_CALIBRATION.prefixTokens) {
    return `${id} sent ${promptTokens} prompt tokens, below the floor's calibration prefix ${FLOOR_CALIBRATION.prefixTokens}`;
  }
  return { call, promptTokens, readTokens };
}

/** Judge a case: every call carries usage and a prompt at least the cache minimum and the calibration prefix,
 *  and every call after the first reads at least `floor` of the previous call's prompt. The worst pair decides. */
export function judgeCase(evidence: CaseEvidence): CaseJudgement {
  const { calls, floor, cacheMinTokens } = evidence;
  const measured: MeasuredCall[] = [];
  for (const call of calls) {
    const checked = measurable(call, cacheMinTokens);
    if (typeof checked === "string") {
      return unmeasured(checked);
    }
    measured.push(checked);
  }
  const pairs: JudgedPair[] = measured.flatMap((next, i) => {
    const prev = measured[i - 1];
    return prev === undefined ? [] : [{ prev: prev.call, next: next.call, ratio: next.readTokens / prev.promptTokens }];
  });
  const worst = pairs.reduce<JudgedPair | null>((low, pair) => (low === null || pair.ratio < low.ratio ? pair : low), null);
  if (worst === null) {
    return unmeasured(`${calls.length} measured call(s); a verdict needs at least two`);
  }
  return { verdict: worst.ratio >= floor ? "PASS" : "FAIL", worst, pairs, floor };
}

/** Any ERROR or a probe row left behind is a tool error; otherwise any FAIL is a violation. A run that judged
 *  nothing is refused by the verdict door's `judged` denominator ({@link runVerdict}), not here. */
export function exitFor(outcomes: readonly CaseOutcome[], leftovers: number): number {
  if (leftovers > 0 || outcomes.some((o) => o.verdict === "ERROR")) {
    return EXIT.toolError;
  }
  return outcomes.some((o) => o.verdict === "FAIL") ? EXIT.violations : EXIT.clean;
}

const FLOOR_DIGITS = 4;

/** The RESULT line's verdict input: the exit, the `judged` population a clean run must prove, and the tally. */
export function runVerdict(outcomes: readonly CaseOutcome[], leftovers: number): VerdictOptions {
  const judged = outcomes.filter((o) => "worst" in o).length;
  return {
    verdict: exitFor(outcomes, leftovers),
    denominators: { judged: { value: judged, refuseWhen: "zero" } },
    pairs: [
      ...tally(outcomes).map(([verdict, n]) => [verdict.toLowerCase(), n] as const),
      ["floor", CACHE_READ_FLOOR.toFixed(FLOOR_DIGITS)],
      ["leftovers", leftovers],
    ],
  };
}

/** How many lines carry each verdict, in {@link CASE_VERDICTS} order. */
export function tally(outcomes: readonly CaseOutcome[]): readonly (readonly [CaseVerdict, number])[] {
  return CASE_VERDICTS.map((verdict) => [verdict, outcomes.filter((o) => o.verdict === verdict).length] as const);
}

const VERDICT_WIDTH = 7;
const ROUTE_WIDTH = 10;
const CASE_WIDTH = 9;
const RATIO_DIGITS = 3;

function pairFields(pair: JudgedPair): string {
  const { prev, next, ratio } = pair;
  return (
    `read=${next.readTokens ?? "?"} write=${next.writeTokens ?? "?"} prev-prompt=${prev.promptTokens ?? "?"} ` +
    `ratio=${ratio.toFixed(RATIO_DIGITS)} prev=${prev.id} id=${next.id}`
  );
}

const PAIR_INDENT = " ".repeat(VERDICT_WIDTH + 1);

/** The case's line, then for a FAIL one indented line per judged pair, so the failing boundary is visible. */
export function formatOutcome(outcome: CaseOutcome): readonly string[] {
  const head = `${outcome.verdict.padEnd(VERDICT_WIDTH)} ${outcome.route.padEnd(ROUTE_WIDTH)} ${outcome.case.padEnd(CASE_WIDTH)}`;
  if (!("worst" in outcome)) {
    return [`${head} ${outcome.reason}`];
  }
  const line = `${head} ${pairFields(outcome.worst)} floor=${outcome.floor.toFixed(RATIO_DIGITS)} pairs=${outcome.pairs.length}`;
  const details = outcome.verdict === "FAIL" ? outcome.pairs.map((pair, i) => `${PAIR_INDENT}pair ${i + 1}: ${pairFields(pair)}`) : [];
  return [line, ...details];
}

const USD_DIGITS = 4;

/** A route's spend line: the provider-reported cost summed, and how many replies reported one. */
export function formatSpend(route: CacheRoute, replyCosts: readonly (number | null)[]): string {
  const priced = replyCosts.filter((cost): cost is number => cost !== null);
  const usd = priced.reduce((sum, cost) => sum + cost, 0);
  return `${"SPEND".padEnd(VERDICT_WIDTH)} ${route.padEnd(ROUTE_WIDTH)} usd=${usd.toFixed(USD_DIGITS)} replies=${replyCosts.length} priced=${priced.length}`;
}
