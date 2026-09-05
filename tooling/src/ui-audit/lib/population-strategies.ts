// Pure population-accounting strategies for ui-audit's collect dispatcher. Split from collect.ts
// (#450-line cap headroom, 2026-09-01) — the four rungs a rule's checker is wired through.
//
// FOUR COLLECTION STRATEGIES (owner ruling 2026-09-01: no gate — rule shape is a judgment call a
// checker can't make; the RUNG ASSIGNMENT table lives in collect.ts's header, because that is a
// dispatcher fact). This header carries the MECHANICS only:
// | rung | fn                     | adds over the rung below     |
// | 1 | nullableFindings          | plain map, no accounting     |
// | 2 | accountedFindings         | census + RulePopulationAccounting |
// | 2 | partitionedFindings       | same rung, second door: the checker itself names each candidate's
// |   |                           | disposition (judged / withheld / excluded), so a rule that DECLINES
// |   |                           | some candidates publishes why instead of a candidates==judged lie |
// | 3 | cappedRelationalFindings  | + cap, never truncates affected/judged |
// | 4 | decisionPopulationFindings| + authored-decision grouping (decisionKey) |
// WHICH RUNG-2 DOOR: `accountedFindings` when the check is a TOTAL judge over its census (every sample
// gets a verdict — candidates == judged is the truth, not a default); `partitionedFindings` when the
// check returns `null` for two different reasons and a bare zero would conflate them. The partition's
// polarity is the one #987 states and `checks-color.ts`'s ContrastOutcome/GrayOutcome demonstrate:
// EXCLUDED = measured facts prove the rule inapplicable (an owner-sanctioned effect carrier, a role
// this lens does not govern, a sample owned by a sibling rule) — complete evidence, never a gap;
// WITHHELD = the rule APPLIES and the instrument could not judge it, which makes the run NO VERDICT.
// A shape gate the rule itself asks about ("is this wash big enough to be a background glow?") is a
// JUDGED PASS, not an exclusion — checks-color.ts's `grayOnColorOutcome` header is the precedent, and
// checks-font-census.ts's four-arm header is the precedent for NOT routing a ubiquitous measured
// absence to `withheld` and burying every run in NO VERDICT.
// population.ts's reason maps are NOT interchangeable: withheld = a candidate the instrument COULD
// NOT JUDGE (+ the presentation-only reasons the contract's `PRESENTATION_WITHHELD_REASONS` tuple
// closes; any other withholding is a NO VERDICT run, see
// populationEvidenceGap); excluded = measured facts PROVE the rule does not apply; collapsed =
// adjudicated by a same-owner decision (rung 4's grouping). settledPopulationAccounting THROWS on
// arithmetic that doesn't close (candidates = judged + withheld[non-cap] + excluded; affected =
// emitted + cap + collapsed) — a malformed counter is an instrument error, never normalized.
// THE WALKER-FILTERED TRAP: some rules' candidates are filtered by the WALKER, so the check sees
// only survivors and accounting bolted on here reports candidates == judged while the real
// denominator was lost upstream — relational families carry `relationalAccounting` FROM the walker
// instead (contract/samples-populations.ts); a filtered census keeps its accounting there, not here.
import type { CandidateDisposition, Finding, RulePopulationAccounting } from "../contract/findings.ts";
import { WITHHELD_REASONS } from "../contract/findings.ts";
import type { DesignAuditRuleId } from "../contract/rules.ts";
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";
import { assertCensusAccounting, assertRelationalCensus, settledPopulationAccounting } from "./population.ts";

export function nullableFindings<T>(items: readonly T[], check: (item: T) => Finding | null): Finding[] {
  const findings: Finding[] = [];
  for (const item of items) {
    const finding = check(item);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

export const RELATIONAL_REPRESENTATIVE_CAPS = {
  "cohort-anatomy": 12,
  "pane-ink": 6,
  "row-void": 8,
} as const;

/** The walker's withheld SUBJECTS as an accounting fragment (#1704). They travel with the tally they
 *  explain — a NO-VERDICT that names no subject cannot be chased — and Node adds no subject of its own.
 *  Spelled ONCE because all three builders below need it and a conditional spread repeated three times is
 *  how the `carried` tag came to reach only one of them. */
function withheldSubjectsOf(census: RelationalCensusAccountingInput | undefined): Pick<RulePopulationAccounting, "withheldSubjects"> {
  return census?.withheldSubjects === undefined ? {} : { withheldSubjects: { ...census.withheldSubjects } };
}

export function cappedRelationalFindings<T>(
  rule: keyof typeof RELATIONAL_REPRESENTATIVE_CAPS,
  items: readonly T[],
  check: (item: T) => Finding | null,
  census: RelationalCensusAccountingInput | undefined,
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  if (census !== undefined) {
    assertRelationalCensus(rule, census, items.length);
  }
  const affected = nullableFindings(items, check);
  const cap = RELATIONAL_REPRESENTATIVE_CAPS[rule];
  const emitted = affected.slice(0, cap);
  const capWithheld = affected.length - emitted.length;
  const withheld = { ...(census?.withheld ?? {}) };
  if (capWithheld > 0) {
    withheld[WITHHELD_REASONS.representativeCap] = capWithheld;
  }
  return {
    findings: emitted,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected: affected.length,
      populations: affected.length,
      emitted: emitted.length,
      withheld,
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
      ...withheldSubjectsOf(census),
    }),
  };
}

export function accountedFindings<T>(
  rule: DesignAuditRuleId,
  items: readonly T[],
  check: (item: T) => Finding | null,
  options: { readonly census: RelationalCensusAccountingInput | undefined; readonly samplesAreJudged: boolean },
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  const { census, samplesAreJudged } = options;
  if (census !== undefined) {
    if (samplesAreJudged) {
      assertRelationalCensus(rule, census, items.length);
    } else {
      assertCensusAccounting(rule, census);
    }
  }
  const findings = nullableFindings(items, check);
  return {
    findings,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected: findings.length,
      populations: findings.length,
      emitted: findings.length,
      withheld: { ...(census?.withheld ?? {}) },
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
      ...withheldSubjectsOf(census),
    }),
  };
}

/** RUNG 2, second door. The per-candidate `CandidateDisposition` a classifier returns is homed in
 *  contract/findings.ts, beside the accounting row it settles into. Emission is unchanged from `nullableFindings` — every judged finding is
 *  emitted, ungrouped and uncapped — and the accounting publishes the denominator the bare map threw
 *  away. `settledPopulationAccounting` throws when the partition does not close, so a classifier that
 *  forgets a branch is an instrument error rather than a quietly smaller candidate count. */
/** THE WALKER'S CAP IS A CANDIDATE THE CHECK NEVER SAW (#1038). `capExceeded` is how many carriers the
 *  in-page census counted and could not carry out (contract/samples-populations.ts `CensusCapRow`), so
 *  `items` is short by exactly that many and `candidates: items.length` would report a truncated
 *  denominator as the whole page. It is added to BOTH the candidate count and `withheld` — under the
 *  house polarity a bound the instrument hit is the absence of a measurement, never proof of
 *  inapplicability, so a truncated family makes the run NO VERDICT (`populationEvidenceGap`). It is
 *  deliberately NOT spelled `cap`: that reason is the Node-side REPRESENTATIVE cap, which withholds a
 *  finding from the printed list after judging it, and `assertCensusAccounting` refuses a walker that
 *  supplies it. */
export function partitionedFindings<T>(
  rule: DesignAuditRuleId,
  items: readonly T[],
  classify: (item: T) => CandidateDisposition,
  capExceeded = 0,
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  const findings: Finding[] = [];
  const withheld: Record<string, number> = capExceeded > 0 ? { [WITHHELD_REASONS.censusCapExceeded]: capExceeded } : {};
  const excluded: Record<string, number> = {};
  let judged = 0;
  for (const item of items) {
    const disposition = classify(item);
    if (disposition.kind === "judged") {
      judged += 1;
      if (disposition.finding !== null) {
        findings.push(disposition.finding);
      }
      continue;
    }
    const reasons = disposition.kind === "withheld" ? withheld : excluded;
    reasons[disposition.reason] = (reasons[disposition.reason] ?? 0) + 1;
  }
  return {
    findings,
    accounting: settledPopulationAccounting(rule, {
      candidates: items.length + capExceeded,
      judged,
      affected: findings.length,
      populations: findings.length,
      emitted: findings.length,
      withheld,
      excluded,
      collapsed: {},
    }),
  };
}

const DECISION_REPRESENTATIVE_CAP = 5;

interface DecisionFindingRow<T> {
  readonly input: T;
  readonly finding: Finding | null;
}

export function decisionPopulationFindings<T extends { readonly selector: string }>(
  rule: DesignAuditRuleId,
  items: readonly T[],
  check: (item: T) => Finding | null,
  options: { readonly census: RelationalCensusAccountingInput | undefined; readonly decisionKey: (item: T) => string },
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  const { census, decisionKey } = options;
  if (census !== undefined) {
    assertCensusAccounting(rule, census);
  }
  const groups = new Map<string, DecisionFindingRow<T>[]>();
  for (const input of items) {
    const key = decisionKey(input);
    const group = groups.get(key) ?? [];
    group.push({ input, finding: check(input) });
    groups.set(key, group);
  }
  const findings: Finding[] = [];
  let affected = 0;
  let emitted = 0;
  for (const group of groups.values()) {
    const failures = group.filter((row): row is DecisionFindingRow<T> & { readonly finding: Finding } => row.finding !== null);
    const first = failures[0];
    if (first === undefined) {
      continue;
    }
    const representatives = failures.slice(0, DECISION_REPRESENTATIVE_CAP).map(({ input }) => input.selector);
    const capped = failures.length - representatives.length;
    const affectedSummary =
      failures.length === group.length ? `${String(failures.length)} affected` : `${String(failures.length)} affected of ${String(group.length)} judged`;
    affected += failures.length;
    emitted += representatives.length;
    findings.push({
      ...first.finding,
      selector: representatives[0] ?? first.input.selector,
      value: `${first.finding.value}; ${affectedSummary}; ${String(representatives.length)} representative(s), ${String(capped)} capped`,
      representatives,
      population: { affected: failures.length, judged: group.length, capped },
    } as Finding);
  }
  const cap = affected - emitted;
  const withheld = { ...(census?.withheld ?? {}) };
  if (cap > 0) {
    withheld[WITHHELD_REASONS.representativeCap] = cap;
  }
  return {
    findings,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected,
      populations: findings.length,
      emitted,
      withheld,
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
      // The walker's route tag travels to the printed row unchanged (#1172) — Node adds no route of its own.
      ...(census?.carried === undefined ? {} : { carried: { ...census.carried } }),
      ...withheldSubjectsOf(census),
    }),
  };
}
