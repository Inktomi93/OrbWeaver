// The per-policy waiver ratchet (docs/law/gate-runtime-standardization.md §5): a policy's waived plus granted
// count over the population a run walks must equal that population's budget in `lib/waiver-budget.ts`. An
// application run judges the application part; every other complete run judges both parts together.
import type {
  GateAuthorityAlarm,
  GateOwnerResult,
  WaiverBudget,
  WaiverBudgetAuthorityAlarm,
  WaiverBudgetJudgement,
  WaiverBudgetPart,
  WaiverBudgetPopulation,
  WaiverBudgetReport,
} from "../contract/gate-authority.ts";

interface PopulationRule {
  /** The budget parts whose rows sum to this population's allowance. */
  readonly parts: readonly WaiverBudgetPart[];
  /** Whether the owner walked this whole population, given whether authority withheld it. */
  readonly walked: (result: GateOwnerResult, withheld: boolean) => boolean;
  /** The remedy for a fall, naming the row that moves. */
  readonly lower: (count: number) => string;
}

const POPULATION_RULES: Readonly<Record<WaiverBudgetPopulation, PopulationRule>> = {
  application: {
    parts: ["application"],
    // An application pass resolves every owner to its declared population intersected with the application
    // subjects and never narrows that by requested paths (lib/policy-effective-population.ts). So an owner that
    // ran walked its whole application part. One with an empty intersection is not-applicable: authority withholds
    // it from waiver liveness because it walked nothing, but its application count is zero by construction, so it
    // is judged too (findings from it are a tool error that already voids the run).
    walked: (result, withheld) => result.owner.status === "not-applicable" || (result.owner.status === "success" && !withheld),
    lower: (count) => `lower its application row to ${count} in lib/waiver-budget.ts`,
  },
  repository: {
    parts: ["application", "implementation"],
    walked: (result, withheld) => result.owner.status === "success" && result.coverage === "whole" && !withheld,
    lower: (count) =>
      `lower its rows in lib/waiver-budget.ts so application plus implementation equals ${count}; the implementation row moves unless the application run also reports a fall`,
  },
};

function allowance(budget: WaiverBudget, parts: readonly WaiverBudgetPart[], policyId: string): number {
  return parts.reduce((sum, part) => sum + (budget[part][policyId] ?? 0), 0);
}

// One alarm per judged policy whose live count differs from its population's budget. A marker an analysis gap
// deferred excuses nothing yet still occupies a budget slot, so it counts beside the excused findings.
function judgeWaiverBudget(
  { population, budget }: WaiverBudgetJudgement,
  judged: readonly string[],
  excused: ReadonlyMap<string, number>,
  deferred: ReadonlyMap<string, number>,
): readonly WaiverBudgetAuthorityAlarm[] {
  const rule = POPULATION_RULES[population];
  return judged.flatMap((policyId) => {
    const allowed = allowance(budget, rule.parts, policyId);
    const held = deferred.get(policyId) ?? 0;
    const count = (excused.get(policyId) ?? 0) + held;
    if (count === allowed) {
      return [];
    }
    const deferral = held === 0 ? "" : ` (including ${held} marker(s) whose liveness an analysis gap defers)`;
    const head = `${policyId} excuses ${count} findings${deferral} over the ${population} population against a waiver budget of ${allowed}`;
    const message = count > allowed ? `${head}: fix the new finding instead of excusing it` : `${head}: ${rule.lower(count)}`;
    return [{ kind: "waiver-budget", policyId, population, budget: allowed, count, message }];
  });
}

/** The ratchet over one authority batch. No budget means a fixture or conformance pass, which judges nothing
 *  and reports no budget verdict. */
export function waiverRatchet(
  judgement: WaiverBudgetJudgement | undefined,
  results: ReadonlyMap<string, GateOwnerResult>,
  slots: {
    readonly excused: readonly { readonly finding: { readonly policyId: string } }[];
    readonly deferred: ReadonlyMap<string, number>;
  },
  withheld: ReadonlySet<string>,
): { readonly alarms: readonly GateAuthorityAlarm[]; readonly report: WaiverBudgetReport | null } {
  const { excused: excusedFindings, deferred } = slots;
  if (judgement === undefined) {
    return { alarms: [], report: null };
  }
  const excused = new Map<string, number>();
  for (const { finding } of excusedFindings) {
    excused.set(finding.policyId, (excused.get(finding.policyId) ?? 0) + 1);
  }
  const { walked } = POPULATION_RULES[judgement.population];
  const judged: string[] = [];
  const unjudged: string[] = [];
  for (const [id, result] of [...results].toSorted(([left], [right]) => left.localeCompare(right))) {
    (walked(result, withheld.has(id)) ? judged : unjudged).push(id);
  }
  return { alarms: judgeWaiverBudget(judgement, judged, excused, deferred), report: { population: judgement.population, judged, unjudged } };
}
