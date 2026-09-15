// `reports/check-structure.json`: map one `runPolicyPass` result onto the artifact's rows and aggregate
// (contract/structure-report.ts). Pure: no I/O, no rendering. This file exists so the artifact writer, the
// console renderer and the corpus tests all derive a row from ONE function — and since #2176 Phase F
// (2026-09-14) it is the ONLY mapping there is, the legacy side having retired with its dispatcher.
import type { CoordinatedGateFinding, GateAuthorityAlarm } from "../contract/gate-authority.ts";
import type { Violation } from "../contract/harness.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { GateFactOwnerResult, PolicyOwnerResult, PolicyPassResult, PolicyPopulationReceipt } from "../contract/policy-pass.ts";
import type { FinalPolicyRow, PopulationCounts, StructureCountReconciliation, StructureFactRow, StructurePolicyReport } from "../contract/structure-report.ts";

/** The FINAL side of one mixed run, in the THREE shapes its consumers need — the raw pass result (the exit
 *  rule and the timing ledger read it), the artifact's rows, and the artifact's aggregate. Homed here rather
 *  than in the front door because the artifact writer and the console renderer both take it, which is this
 *  file's stated reason to exist; `null` throughout is the honest answer for a corpus holding no final
 *  policy (a planted legacy-only tree), never an empty report that claims a final side ran. */
export interface FinalSide {
  readonly result: PolicyPassResult | null;
  readonly rows: readonly FinalPolicyRow[];
  readonly report: StructurePolicyReport | null;
}

interface FindingRow {
  readonly violations: readonly unknown[];
}

/** ONE derivation of the headline. `blocking` deliberately reads the authority verdict rather than restating
 *  its severity policy; the other three fields expose the equivalent human-readable equation. */
export function structureCountReconciliation(rows: readonly FindingRow[], policy: StructurePolicyReport | null): StructureCountReconciliation {
  const finalEffectiveFindings = rows.reduce((sum, entry) => sum + entry.violations.length, 0);
  const verdict = policy?.authority.verdict;
  return {
    finalEffectiveFindings,
    nonblockingWarnings: verdict === undefined || verdict.failOnWarnings ? 0 : verdict.warnings,
    authorityAlarms: policy?.authority.alarms.length ?? 0,
    blocking: verdict?.blocking ?? 0,
  };
}

/** The same equation emitted by the live console and by `check:show`. */
export function structureCountLine(counts: StructureCountReconciliation): string {
  return (
    `${counts.blocking} blocking = ${counts.finalEffectiveFindings} effective` +
    ` - ${counts.nonblockingWarnings} nonblocking warning(s) + ${counts.authorityAlarms} authority alarm(s)`
  );
}

export function finalSide(selectedFinal: readonly GatePolicy[], result: PolicyPassResult | null): FinalSide {
  if (result === null) {
    return { result, rows: [], report: null };
  }
  return { result, rows: policyRows(result, selectedFinal), report: policyReport(result) };
}

function populationCounts(population: PolicyPopulationReceipt): PopulationCounts {
  return {
    declaredSourcePaths: population.declaredSourcePaths.length,
    declaredResourcePaths: population.declaredResourcePaths.length,
    effectiveSourcePaths: population.effectiveSourcePaths.length,
    effectiveResourcePaths: population.effectiveResourcePaths.length,
    requestedPaths: population.requestedPaths === null ? null : population.requestedPaths.length,
  };
}

/** A coordinated finding as the artifact's `Violation`: the policy's message unless the finding overrides it. */
function violationOf(finding: CoordinatedGateFinding, policy: GatePolicy): Violation {
  return {
    file: finding.file,
    line: finding.line,
    column: finding.column,
    message: finding.message ?? policy.message,
    severity: finding.severity,
    ...(finding.token === undefined ? {} : { token: finding.token }),
  };
}

interface Tallies {
  readonly effective: ReadonlyMap<string, readonly CoordinatedGateFinding[]>;
  readonly waived: ReadonlyMap<string, number>;
  readonly granted: ReadonlyMap<string, number>;
  readonly alarmed: ReadonlySet<string>;
  readonly withheld: ReadonlySet<string>;
}

function count(map: Map<string, number>, id: string): void {
  map.set(id, (map.get(id) ?? 0) + 1);
}

function tallies(result: PolicyPassResult): Tallies {
  const effective = Map.groupBy(result.authority.effectiveFindings, ({ policyId }) => policyId);
  const waived = new Map<string, number>();
  const granted = new Map<string, number>();
  for (const { finding } of result.authority.waivedFindings) {
    count(waived, finding.policyId);
  }
  for (const { finding } of result.authority.grantedFindings) {
    count(granted, finding.policyId);
  }
  return {
    effective,
    waived,
    granted,
    alarmed: new Set(result.authority.authorityAlarms.map((alarm: GateAuthorityAlarm) => alarm.policyId)),
    withheld: new Set(result.authority.withheldPolicyIds),
  };
}

function row(owner: PolicyOwnerResult, policy: GatePolicy, t: Tallies): FinalPolicyRow {
  const findings = t.effective.get(owner.id) ?? [];
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const withheld = t.withheld.has(owner.id);
  return {
    contract: "final",
    name: owner.id,
    family: policy.family,
    authority: policy.authority,
    severity: policy.severity,
    workItem: policy.severity === "warning" ? policy.workItem : null,
    ok: owner.owner.status === "success" && !withheld && errors === 0 && !t.alarmed.has(owner.id),
    owner: owner.owner,
    withheld,
    population: populationCounts(owner.population),
    receipts: owner.receipts,
    violations: findings.map((finding) => violationOf(finding, policy)),
    waived: t.waived.get(owner.id) ?? 0,
    granted: t.granted.get(owner.id) ?? 0,
    timing: owner.timing,
  };
}

/** One row per owner result, in the dispatcher's (sorted-by-id) order. A result naming a policy the roster does not
 *  hold is a writer bug and throws — the artifact never carries a row nobody can explain. */
export function policyRows(result: PolicyPassResult, policies: readonly GatePolicy[]): readonly FinalPolicyRow[] {
  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const t = tallies(result);
  return result.policies.map((owner) => {
    const policy = byId.get(owner.id);
    if (policy === undefined) {
      throw new Error(`final pass returned a result for a policy the roster does not hold: ${owner.id}`);
    }
    return row(owner, policy, t);
  });
}

function factRow(fact: GateFactOwnerResult): StructureFactRow {
  return { id: fact.id, status: fact.status, population: populationCounts(fact.population), receipts: fact.receipts, timing: fact.timing, error: fact.error };
}

export function policyReport(result: PolicyPassResult): StructurePolicyReport {
  return {
    facts: result.facts.map(factRow),
    factErrors: result.factErrors,
    toolErrors: result.toolErrors,
    waiverCarrierRefusals: result.waiverCarrierRefusals,
    authority: {
      alarms: result.authority.authorityAlarms,
      toolErrors: result.authority.toolErrors,
      withheldPolicyIds: result.authority.withheldPolicyIds,
      ordinaryConsumption: result.authority.ordinaryConsumption,
      reviewedGrantConsumption: result.authority.reviewedGrantConsumption,
      verdict: result.authority.verdict,
    },
    timing: result.timing,
  };
}

/** The "run is not a verdict" count on the final side — every class `policyPassExitCode` reads as exit 2. */
export function finalToolErrorCount(result: PolicyPassResult): number {
  return result.factErrors.length + result.toolErrors.length + result.authority.toolErrors.length;
}
