// One settlement door for every UI-audit population receipt (#987). A counter row is evidence only when
// its arithmetic closes exactly; partial evidence is a NO VERDICT, never a clean result.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { PopulationAccounting, RulePopulationAccounting } from "../contract/findings.ts";
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";

function assertCount(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`INSTRUMENT ERROR: ${label} must be a non-negative safe integer, got ${String(value)}`);
  }
}

function sumCounts(rule: string, kind: string, counts: Readonly<Record<string, number>>, excluded: ReadonlySet<string> = new Set()): number {
  let total = 0;
  for (const [reason, count] of Object.entries(counts)) {
    assertCount(`${rule} ${kind}.${reason}`, count);
    if (!excluded.has(reason)) {
      total += count;
    }
  }
  return total;
}

/** `carried` is a TAG over candidates, not a disposition (#1172), so it is settled against `candidates`
 *  rather than inside the judged/withheld/excluded identity. A route tag exceeding the census it tags is
 *  the same class of broken counter as a negative one: the walk counted something it never censused. */
function assertCarried(rule: string, carried: Readonly<Record<string, number>> | undefined, candidates: number): void {
  if (carried === undefined) {
    return;
  }
  const total = sumCounts(rule, "carried", carried);
  if (total > candidates) {
    throw new Error(`INSTRUMENT ERROR: ${rule} carried ${String(total)} exceeds candidates ${String(candidates)}`);
  }
}

export function assertCensusAccounting(rule: string, census: RelationalCensusAccountingInput): void {
  assertCount(`${rule} candidates`, census.candidates);
  assertCount(`${rule} judged`, census.judged);
  assertCarried(rule, census.carried, census.candidates);
  if (Object.hasOwn(census.withheld, "cap")) {
    throw new Error(`INSTRUMENT ERROR: ${rule} walker supplied Node-owned cap accounting`);
  }
  const withheld = sumCounts(rule, "withheld", census.withheld);
  const excluded = sumCounts(rule, "excluded", census.excluded);
  if (census.candidates !== census.judged + withheld + excluded) {
    throw new Error(
      `INSTRUMENT ERROR: ${rule} candidates ${String(census.candidates)} do not settle as judged ${String(census.judged)} + withheld ${String(withheld)} + excluded ${String(excluded)}`,
    );
  }
}

export function assertRelationalCensus(rule: string, census: RelationalCensusAccountingInput, returnedSamples: number): void {
  assertCensusAccounting(rule, census);
  assertCount(`${rule} returned samples`, returnedSamples);
  if (census.judged !== returnedSamples) {
    throw new Error(`INSTRUMENT ERROR: ${rule} walker judged ${String(census.judged)} but returned ${String(returnedSamples)} sample(s)`);
  }
}

function assertPopulationAccounting(rule: string, row: RulePopulationAccounting): void {
  for (const [label, value] of [
    ["candidates", row.candidates],
    ["judged", row.judged],
    ["affected", row.affected],
    ["populations", row.populations],
    ["emitted", row.emitted],
  ] as const) {
    assertCount(`${rule} ${label}`, value);
  }
  assertCarried(rule, row.carried, row.candidates);
  const cap = row.withheld["cap"] ?? 0;
  const unjudged = sumCounts(rule, "withheld", row.withheld, new Set(["cap"]));
  const excluded = sumCounts(rule, "excluded", row.excluded);
  const collapsed = sumCounts(rule, "collapsed", row.collapsed);
  if (row.candidates !== row.judged + unjudged + excluded) {
    throw new Error(
      `INSTRUMENT ERROR: ${rule} candidates ${String(row.candidates)} do not settle as judged ${String(row.judged)} + withheld ${String(unjudged)} + excluded ${String(excluded)}`,
    );
  }
  if (row.affected > row.judged) {
    throw new Error(`INSTRUMENT ERROR: ${rule} affected ${String(row.affected)} exceeds judged ${String(row.judged)}`);
  }
  if (row.affected !== row.emitted + cap + collapsed) {
    throw new Error(
      `INSTRUMENT ERROR: ${rule} affected ${String(row.affected)} do not settle as emitted ${String(row.emitted)} + cap ${String(cap)} + collapsed ${String(collapsed)}`,
    );
  }
  if (row.populations > row.affected || (row.affected === 0 && (row.populations !== 0 || row.emitted !== 0))) {
    throw new Error(`INSTRUMENT ERROR: ${rule} population cardinality does not settle`);
  }
}

export function settledPopulationAccounting(rule: string, row: RulePopulationAccounting): RulePopulationAccounting {
  assertPopulationAccounting(rule, row);
  return row;
}

export function populationEvidenceGap(accounting: PopulationAccounting): EvidenceGap | null {
  const incomplete: string[] = [];
  for (const [rule, row] of Object.entries(accounting)) {
    const reasons = Object.entries(row.withheld).filter(([reason, count]) => reason !== "cap" && count > 0);
    if (reasons.length > 0) {
      incomplete.push(`${rule}: ${reasons.map(([reason, count]) => `${reason}=${String(count)}`).join(" ")}`);
    }
  }
  return incomplete.length === 0
    ? null
    : {
        evidence: "rule population completeness",
        detail: `${incomplete.join("; ")} — candidates were withheld from judgment, so emitted findings are partial and this run has NO VERDICT`,
      };
}
