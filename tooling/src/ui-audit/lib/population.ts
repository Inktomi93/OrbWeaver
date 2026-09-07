// One settlement door for every UI-audit population receipt (#987). A counter row is evidence only when
// its arithmetic closes exactly; partial evidence is a NO VERDICT, never a clean result.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { PopulationAccounting, RulePopulationAccounting } from "../contract/findings.ts";
import { PRESENTATION_WITHHELD_REASONS, WITHHELD_REASONS } from "../contract/findings.ts";
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";

/** The presentation-only reasons, as a lookup — one derivation of the contract tuple for both the
 *  settlement arithmetic and the completeness verdict, so the two can never disagree. */
const PRESENTATION_WITHHELD: ReadonlySet<string> = new Set<string>(PRESENTATION_WITHHELD_REASONS);

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
  if (Object.hasOwn(census.withheld, WITHHELD_REASONS.representativeCap)) {
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
  const cap = row.withheld[WITHHELD_REASONS.representativeCap] ?? 0;
  const unjudged = sumCounts(rule, "withheld", row.withheld, PRESENTATION_WITHHELD);
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

/** THE REMEDY FOR A WITHHELD REASON, WHERE ONE EXISTS — the ONE home, keyed by the reason a walker
 *  withheld under (#1385 item 2). A NO-VERDICT that names a reason and no way out costs its reader a
 *  round trip through the walker source to learn whether the run was recoverable at all; the polarity law
 *  (absence of measurement = withheld) makes that reader-facing gap a recurring cost, not a one-off.
 *
 *  DELIBERATELY SPARSE. A reason appears here only when the remedy is a real, verified operator action;
 *  the rest print exactly as before rather than carrying invented advice. Adding a remedy is a one-line
 *  edit HERE, never a second spelling at a print site. */
const WITHHELD_REMEDIES: Readonly<Record<string, string>> = {
  // #1114: a surface whose selection idiom only exists once driven is STRUCTURALLY no-verdict at rest —
  // every rest arm withholds here, and only the driven arm can reach `complete`.
  // THE REMEDY IS CONDITIONAL, AND SAYING SO IS THE HONEST HALF (#1704). This read as an unconditional
  // instruction with one surface's command baked in, so three Characters passes followed it, watched the
  // withholding survive, and had no way to tell "wrong command" from "no command can do this" — the
  // cohorts were never named. They are now (see `withheldSubjects`), and the text no longer asserts that a
  // drive exists: a cohort whose carriers are ALL unselected at rest may have no reachable selected twin
  // on this surface at all, and design-audit is read-only (`cli.ts`), so it cannot mint one.
  unmatchedUnselected:
    "drive the surface so a SELECTED member of the named cohort is rendered beside its unselected siblings (e.g. pnpm snap /chats --open-chat <id-or-title> --design-audit). If no interaction on this surface can select one, the cohort is structurally unjudgeable here and the withholding is the correct verdict — say so in the review rather than re-running",
  // THE OLD TEXT NAMED THE WRONG SHAPE (#1840). It read "a one-row list cannot answer this rule", which is
  // one of TWO ways a cohort ends up all-selected and not the common one: measured on Backup & Restore
  // (side-eye 2026-09-06), the withheld cohort was ELEVEN checkboxes, every one checked because the group's
  // default is everything selected — so the reader followed the remedy, looked for a one-row list, and
  // found eleven. The subject now carries its own census ("N of M chosen", `census-selection.ts`), so the
  // remedy names the action for each shape and asserts neither.
  unmatchedSelected:
    "read the cohort census printed beside the subject. M of M chosen is a BULK-DEFAULT group (every member starts selected): drive the surface so one member is DEselected beside its chosen siblings. 1 of 1 is a single-member cohort, which no drive can twin — the withholding is the correct verdict there, so say so in the review rather than re-running",
};

export function populationEvidenceGap(accounting: PopulationAccounting): EvidenceGap | null {
  const incomplete: string[] = [];
  const remedies = new Set<string>();
  for (const [rule, row] of Object.entries(accounting)) {
    const reasons = Object.entries(row.withheld).filter(([reason, count]) => !PRESENTATION_WITHHELD.has(reason) && count > 0);
    if (reasons.length > 0) {
      // NAME THE SUBJECT (#1704). A NO-VERDICT that prints only `unmatchedUnselected=2` is a refusal
      // nobody can chase: three passes on Characters ended on that exact string a week apart, and the
      // remedy below could not be tested against cohorts nobody could locate. The subjects are a bounded
      // representative sample (walker-side cap of 3) and the count beside them stays the complete number.
      incomplete.push(
        `${rule}: ${reasons
          .map(([reason, count]) => {
            const subjects = row.withheldSubjects?.[reason] ?? [];
            return `${reason}=${String(count)}${subjects.length === 0 ? "" : ` at ${subjects.join(", ")}`}`;
          })
          .join(" ")}`,
      );
      for (const [reason] of reasons) {
        const remedy = WITHHELD_REMEDIES[reason];
        if (remedy !== undefined) {
          remedies.add(`${reason}: ${remedy}`);
        }
      }
    }
  }
  return incomplete.length === 0
    ? null
    : {
        evidence: "rule population completeness",
        detail: `${incomplete.join("; ")} — candidates were withheld from judgment, so emitted findings are partial and this run has NO VERDICT${remedies.size === 0 ? "" : `. Remedy — ${[...remedies].join("; ")}`}`,
      };
}
