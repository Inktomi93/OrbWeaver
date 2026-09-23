// The grouped, per-occurrence reporter for the policy dispatcher's roster: `  ✓ <id>` / `  ✗ <id> (N)` /
// `  ⚠ <id>`, each carrying a `  ·  ` suffix with the vocabulary a verdict actually rests on (authority,
// severity, the population and receipt denominators, waived/granted). A failing policy prints its reason
// ONCE as a group header and lists every occurrence beneath it as a clickable `path.ts:line:col` jump-link.
//
// The LEGACY half — `renderPass`, the per-gate file scan denominator, the zero-scan and refused-population
// footers — retired with the legacy dispatcher at #2176 Phase F (2026-09-14). Its blindness signals did not
// retire with it: they moved INTO the contract, where a policy that resolves an empty population is refused
// by the dispatcher itself (`contract/policy-pass.ts#POLICY_PASS_REFUSALS`) rather than rendered as a ⚠.
import type { Violation } from "../contract/harness.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { FinalPolicyRow, StructurePolicyReport } from "../contract/structure-report.ts";

/** THE PER-FINDING MESSAGE IS PRINTED WHEN IT DIFFERS FROM THE POLICY'S (#2002, owner arm A).
 *  `lib/structure-report.ts` already puts `finding.message ?? policy.message` on every violation, and the
 *  group header prints `policy.message` ONCE — so a multi-arm policy printed ONE remedy for all of its arms
 *  while the correct text sat unread in the JSON. The console line is what the person the gate fires on
 *  actually reads, so for some fraction of a multi-arm policy's findings it was systematically the wrong
 *  remedy. An EQUAL message is still printed once, in the header: the comparison is what keeps the ordinary
 *  single-message policy's output byte-identical. A policy the roster cannot supply has no header at all,
 *  which is why `undefined` prints. */
function policyOccurrenceLine(v: Violation, policyMessage: string | undefined): string {
  const loc = v.line > 0 ? `${v.file}:${v.line}:${v.column ?? 0}` : v.file;
  const suffix = v.token === undefined ? "" : `  ${v.token}`;
  const warning = v.severity === "warning" ? "  [warning]" : "";
  const own = v.message === policyMessage ? "" : `  — ${v.message}`;
  return `      ${loc}${suffix}${warning}${own}`;
}

/** The denominator suffix every final line carries: what the policy resolved, what its receipts counted, and what
 *  central reconciliation absorbed. */
function policySuffix(row: FinalPolicyRow): string {
  const parts = [
    `final ${row.authority}/${row.severity}`,
    `population ${row.population.effectiveSourcePaths} source · ${row.population.effectiveResourcePaths} resource`,
  ];
  for (const receipt of row.receipts) {
    const n = receipt.kind === "population" ? `${receipt.members} member(s)` : `${receipt.resources} resource(s)`;
    parts.push(receipt.unresolved > 0 ? `${receipt.source}: ${n}, ${receipt.unresolved} UNRESOLVED` : `${receipt.source}: ${n}`);
  }
  if (row.waived > 0) {
    parts.push(`waived ${row.waived}`);
  }
  if (row.granted > 0) {
    parts.push(`granted ${row.granted}`);
  }
  return `  ·  ${parts.join(" · ")}`;
}

function renderPolicyRow(row: FinalPolicyRow, policy: GatePolicy | undefined): readonly string[] {
  const suffix = policySuffix(row);
  if (row.owner.status !== "success" || row.withheld) {
    const reason = "reason" in row.owner ? `: ${row.owner.reason}` : "";
    return [`  ⚠ ${row.name}${suffix} · owner ${row.owner.status}${reason}${row.withheld ? " · WITHHELD by authority" : ""}`];
  }
  const errors = row.violations.filter(({ severity }) => severity === "error").length;
  const warnings = row.violations.length - errors;
  const occurrence = (violation: Violation): string => policyOccurrenceLine(violation, policy?.message);
  if (row.ok) {
    const head = warnings > 0 ? `  ✓ ${row.name} (${warnings} warning(s))${suffix}` : `  ✓ ${row.name}${suffix}`;
    return [head, ...row.violations.map(occurrence)];
  }
  const lines = [`  ✗ ${row.name} (${row.violations.length})${suffix}`];
  if (policy !== undefined) {
    lines.push(`      ${policy.message}`);
    if (policy.fix !== undefined) {
      lines.push(`      fix: ${policy.fix}`);
    }
  }
  lines.push(...row.violations.map(occurrence));
  return lines;
}

function renderPolicyBlock(report: StructurePolicyReport): readonly string[] {
  const out: string[] = [];
  for (const fact of report.facts) {
    const receipts = fact.receipts
      .map((r) => (r.kind === "population" ? `${r.source} ${r.members} member(s)` : `${r.source} ${r.resources} resource(s)`))
      .join(", ");
    out.push(
      `  fact ${fact.id}: ${fact.status} · ${receipts === "" ? "no receipt" : receipts} · ${fact.timing.totalMs.toFixed(1)}ms${fact.error === null ? "" : ` · ${fact.error}`}`,
    );
  }
  for (const e of report.factErrors) {
    out.push(`  ⚠ fact ${e.factId} [${e.phase}]: ${e.message}`);
  }
  for (const e of report.toolErrors) {
    out.push(`  ⚠ ${e.policyId} [${e.phase}]: ${e.message}`);
  }
  for (const e of report.authority.toolErrors) {
    out.push(`  ⚠ authority [${e.kind}]${e.policyId === undefined ? "" : ` ${e.policyId}`}: ${e.message}`);
  }
  for (const a of report.authority.alarms) {
    out.push(`  ⚠ authority alarm [${a.kind}] ${a.policyId}: ${a.message}`);
  }
  for (const [policyId, grants] of Map.groupBy(report.authority.unjudgedReviewedGrants, (grant) => grant.policyId)) {
    out.push(
      `  ⚠ grant liveness NOT judged ${policyId}: ${grants.length} reviewed grant(s) unconsumed by this subset run are neither live nor stale; the whole-tree run judges them`,
    );
  }
  for (const r of report.waiverCarrierRefusals) {
    out.push(`  ⚠ waiver carrier ${r.path} (${r.format}) ${r.status}: ${r.reason}`);
  }
  return out;
}

/** Render the final pass: one line per policy (grouped occurrences under a failing one), the facts and every
 *  refusal/alarm, then the final footer. `policies` supplies message/fix for the group headers. */
export function renderPolicyPass(rows: readonly FinalPolicyRow[], report: StructurePolicyReport, policies: readonly GatePolicy[]): string {
  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const out: string[] = [];
  for (const row of rows) {
    out.push(...renderPolicyRow(row, byId.get(row.name)));
  }
  out.push(...renderPolicyBlock(report));
  const waived = rows.reduce((n, row) => n + row.waived, 0);
  const granted = rows.reduce((n, row) => n + row.granted, 0);
  const effective = rows.reduce((n, row) => n + row.violations.length, 0);
  const { verdict } = report.authority;
  const toolErrors = report.factErrors.length + report.toolErrors.length + report.authority.toolErrors.length;
  out.push("");
  out.push(
    `final policies: ${rows.length} ran · raw ${waived + granted + effective} = waived ${waived} + granted ${granted} + effective ${effective} (${verdict.errors - report.authority.alarms.length} error, ${verdict.warnings} warning) · ${report.authority.alarms.length} alarm(s) · ${toolErrors} tool error(s) · ${report.authority.withheldPolicyIds.length} withheld`,
  );
  return out.join("\n");
}
