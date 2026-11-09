// THE FAMILY-CHECKER RUNNER — the scaffolding every `*Findings(samples)` function in
// `collect-families.ts` is written against, split out at the tooling 450-line cap. Nothing here knows a
// RULE: it owns the mutable accumulator a family fills, the two ways a detector reports (one-or-none and
// many), rung 2's total-judge door, the one place a never-capped census reads as 0, and the rung-4
// authored-identity grouping key. The families stay next door; this is the vocabulary they share, so a
// change to how a family ACCUMULATES lands in one file instead of eight.

import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
import { WITHHELD_REASONS } from "../contract/findings.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { CensusCapFamily, WalkerProvenRule } from "../contract/samples-populations.ts";
import { accountedFindings, nullableFindings } from "./population-strategies.ts";

interface MutableFamilyCheckResult {
  readonly findings: Finding[];
  scans: number;
}

export function emptyFamilyResult(): MutableFamilyCheckResult {
  return { findings: [], scans: 0 };
}

export function runNullable(state: MutableFamilyCheckResult, detector: () => Finding | null): void {
  state.scans += 1;
  const finding = detector();
  if (finding !== null) {
    state.findings.push(finding);
  }
}

export function runArray(state: MutableFamilyCheckResult, detector: () => readonly Finding[]): void {
  state.scans += 1;
  state.findings.push(...detector());
}

/** Rung 2's total-judge door, spelled once: a full census whose checker owes every sample a verdict. */
export function totalJudge<T>(
  rule: Parameters<typeof accountedFindings>[0],
  items: readonly T[],
  check: (item: T) => Finding | null,
): ReturnType<typeof accountedFindings> {
  return accountedFindings(rule, items, check, { census: undefined, samplesAreJudged: true });
}

/** How many carriers of one capped walker census never made it out of the page (#1038,
 *  contract/samples-populations.ts). Absent family = never capped, which reads as 0 — the ONE place that
 *  default is written, so no family checker re-spells it. */
export function capExceeded(samples: RawSamples, family: CensusCapFamily): number {
  return samples.censusCaps[family]?.dropped ?? 0;
}

/** The walker-proven door. The walker returns only findings, so its own census row is the denominator; a
 *  sample set without the row publishes none, because a row derived here would restate the finding count.
 *  A walker cap dropped judged findings it could not carry out, so they move from judged to withheld. */
export function walkerProvenFindings<T>(
  rule: WalkerProvenRule,
  items: readonly T[],
  check: (item: T) => Finding | null,
  walk: { readonly samples: RawSamples; readonly capFamily?: CensusCapFamily },
): { readonly findings: readonly Finding[]; readonly accounting: Partial<Record<WalkerProvenRule, RulePopulationAccounting>> } {
  const { samples, capFamily } = walk;
  const census = samples.relationalAccounting?.[rule];
  if (census === undefined) {
    return { findings: nullableFindings(items, check), accounting: {} };
  }
  const dropped = capFamily === undefined ? 0 : capExceeded(samples, capFamily);
  const carried =
    dropped === 0 ? census : { ...census, judged: census.judged - dropped, withheld: { ...census.withheld, [WITHHELD_REASONS.censusCapExceeded]: dropped } };
  const result = accountedFindings(rule, items, check, { census: carried, samplesAreJudged: false });
  return { findings: result.findings, accounting: { [rule]: result.accounting } };
}

/** The rung-4 grouping key every authored-identity family in `collect-families.ts` uses: the authored target paired
 *  with its position-free home, NUL-joined so neither part can forge the boundary. Falls back to the
 *  selector for sample bundles that predate authored identity (#989), which groups per instance — the
 *  pre-#989 behavior — rather than collapsing unrelated rows under a shared `undefined`. */
export function authoredDecisionKey(input: { readonly selector: string; readonly authoredTarget?: string; readonly authoredHome?: string }): string {
  return `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`;
}
