// Pure population-accounting strategies for ui-audit's collect dispatcher. Split from collect.ts
// (#450-line cap headroom, 2026-09-01) — the four rungs a rule's checker is wired through.
//
// FOUR COLLECTION STRATEGIES (owner ruling 2026-09-01: no gate — rule shape is a judgment call a
// checker can't make; the RUNG ASSIGNMENT table lives in collect.ts's header, because that is a
// dispatcher fact). This header carries the MECHANICS only:
// | rung | fn                     | adds over the rung below     |
// | 1 | nullableFindings          | plain map, no accounting     |
// | 2 | accountedFindings         | census + RulePopulationAccounting |
// | 3 | cappedRelationalFindings  | + cap, never truncates affected/judged |
// | 4 | decisionPopulationFindings| + authored-decision grouping (decisionKey) |
// population.ts's reason maps are NOT interchangeable: withheld = a candidate the instrument COULD
// NOT JUDGE (+ the presentation-only "cap" reason; non-cap withholding is a NO VERDICT run, see
// populationEvidenceGap); excluded = measured facts PROVE the rule does not apply; collapsed =
// adjudicated by a same-owner decision (rung 4's grouping). settledPopulationAccounting THROWS on
// arithmetic that doesn't close (candidates = judged + withheld[non-cap] + excluded; affected =
// emitted + cap + collapsed) — a malformed counter is an instrument error, never normalized.
// THE WALKER-FILTERED TRAP: some rules' candidates are filtered by the WALKER, so the check sees
// only survivors and accounting bolted on here reports candidates == judged while the real
// denominator was lost upstream — relational families carry `relationalAccounting` FROM the walker
// instead (contract/samples-populations.ts); a filtered census keeps its accounting there, not here.
import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
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
    withheld["cap"] = capWithheld;
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
    }),
  };
}

export const DECISION_REPRESENTATIVE_CAP = 5;

export interface DecisionFindingRow<T> {
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
    withheld["cap"] = cap;
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
    }),
  };
}
