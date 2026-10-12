// The per-policy waiver ratchet (docs/law/gate-runtime-standardization.md §5): a policy's waived plus granted
// count over its whole declared population must equal its row in `lib/waiver-budget.ts`. Any selection that walked
// that population judges it the same way; one that did not reports the policy unjudged, never passed.
import type { GateAuthorityAlarm, GateOwnerResult, WaiverBudget, WaiverBudgetAuthorityAlarm, WaiverBudgetReport } from "../contract/gate-authority.ts";

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

/** The ratchet over one authority batch. No budget means a fixture or conformance pass, which judges nothing
 *  and reports no budget verdict. */
export function waiverRatchet(
  budget: WaiverBudget | undefined,
  results: ReadonlyMap<string, GateOwnerResult>,
  excusedFindings: readonly { readonly finding: { readonly policyId: string } }[],
  withheld: ReadonlySet<string>,
): { readonly alarms: readonly GateAuthorityAlarm[]; readonly report: WaiverBudgetReport | null } {
  if (budget === undefined) {
    return { alarms: [], report: null };
  }
  const excused = new Map<string, number>();
  for (const { finding } of excusedFindings) {
    excused.set(finding.policyId, (excused.get(finding.policyId) ?? 0) + 1);
  }
  const judged: string[] = [];
  const unjudged: string[] = [];
  for (const [id, result] of [...results].toSorted(([left], [right]) => left.localeCompare(right))) {
    (result.coverage === "whole" && result.owner.status === "success" && !withheld.has(id) ? judged : unjudged).push(id);
  }
  return { alarms: judgeWaiverBudget(budget, judged, excused), report: { judged, unjudged } };
}
