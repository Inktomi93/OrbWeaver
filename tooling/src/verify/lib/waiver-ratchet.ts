// The per-policy waiver ratchet (docs/law/gate-runtime-standardization.md §5): a policy's waived plus granted
// count must equal its committed budget in `lib/waiver-budget.ts`. A rise is a new excuse; a fall leaves room for
// one, so both red until the budget moves. Judged only for an owner that completed over its whole population.
import type { GateAuthorityAlarm, GateOwnerResult, WaiverBudget, WaiverBudgetAuthorityAlarm } from "../contract/gate-authority.ts";

// One alarm per judged policy whose live count differs from its budget.
function judgeWaiverBudget(budget: WaiverBudget, judged: readonly string[], excused: ReadonlyMap<string, number>): readonly WaiverBudgetAuthorityAlarm[] {
  return judged.flatMap((policyId) => {
    const allowed = budget[policyId] ?? 0;
    const count = excused.get(policyId) ?? 0;
    if (count === allowed) {
      return [];
    }
    const message =
      count > allowed
        ? `${policyId} excuses ${count} findings against a waiver budget of ${allowed}: fix the new finding instead of excusing it`
        : `${policyId} excuses ${count} findings against a waiver budget of ${allowed}: lower its budget to ${count} in lib/waiver-budget.ts`;
    return [{ kind: "waiver-budget", policyId, budget: allowed, count, message }];
  });
}

/** The ratchet over one authority batch. No budget means a fixture or conformance pass, which judges nothing. */
export function waiverRatchetAlarms(
  budget: WaiverBudget | undefined,
  results: ReadonlyMap<string, GateOwnerResult>,
  excusedFindings: readonly { readonly finding: { readonly policyId: string } }[],
  withheld: ReadonlySet<string>,
): readonly GateAuthorityAlarm[] {
  if (budget === undefined) {
    return [];
  }
  const excused = new Map<string, number>();
  for (const { finding } of excusedFindings) {
    excused.set(finding.policyId, (excused.get(finding.policyId) ?? 0) + 1);
  }
  const judged = [...results]
    .filter(([id, result]) => result.coverage === "whole" && result.owner.status === "success" && !withheld.has(id))
    .map(([id]) => id)
    .toSorted((left, right) => left.localeCompare(right));
  return judgeWaiverBudget(budget, judged, excused);
}
