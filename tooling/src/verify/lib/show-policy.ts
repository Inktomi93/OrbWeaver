// `check:show`'s FINAL-side renderers (mixed runtime, #1584 §5): the header line of a final policy row and the
// policy block (facts, refusals, alarms, withheld owners) — split out of ops/show.ts, which sits at the tooling
// line cap. Same voice as the legacy lines there: the artifact reader prints what the artifact SAYS, never a
// re-derivation. Colour functions arrive from the caller so this file owns no TTY detection.
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import type { Violation } from "../contract/harness.ts";
import type { FinalPolicyRow, StructurePolicyReport } from "../contract/structure-report.ts";

export interface ShowInk {
  readonly bold: (s: string) => string;
  readonly dim: (s: string) => string;
  readonly green: (s: string) => string;
  readonly red: (s: string) => string;
  readonly cyan: (s: string) => string;
}

/** The final row's own denominator note: the artifact's population counts, receipts, waived/granted, owner state. */
function finalRowNote(row: FinalPolicyRow, ink: ShowInk): string {
  const parts = [
    `final ${row.authority}/${row.severity}`,
    `population ${row.population.effectiveSourcePaths} source · ${row.population.effectiveResourcePaths} resource`,
    ...row.receipts.map((r) => {
      const n = r.kind === "population" ? `${r.members} member(s)` : `${r.resources} resource(s)`;
      return r.unresolved > 0 ? `${r.source}: ${n}, ${r.unresolved} UNRESOLVED` : `${r.source}: ${n}`;
    }),
  ];
  if (row.waived > 0) {
    parts.push(`waived ${row.waived}`);
  }
  if (row.granted > 0) {
    parts.push(`granted ${row.granted}`);
  }
  if (row.owner.status !== "success") {
    parts.push(`owner ${row.owner.status}${"reason" in row.owner ? `: ${row.owner.reason}` : ""}`);
  }
  if (row.withheld) {
    parts.push("WITHHELD by authority");
  }
  return ink.dim(`  ·  ${parts.join(" · ")}`);
}

/** The header glyph + name + count for a final row. A warning-only row is ✓ with its warnings counted — visible,
 *  not blocking — which is the final contract's severity semantics, not a legacy ✗. */
export function finalRowHeader(row: FinalPolicyRow, shown: number, ink: ShowInk): string {
  const errors = row.violations.filter(({ severity }) => severity === "error").length;
  const warnings = row.violations.length - errors;
  const glyph = row.ok ? ink.green("✓") : ink.red("✗");
  const counted = row.ok && warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : `${shown} violation${shown === 1 ? "" : "s"}`;
  return `${glyph} ${ink.bold(row.name)} (${counted})${finalRowNote(row, ink)}`;
}

/** Every "the run is not a verdict" signal the final side carries — the same class `brokenEvidenceCount` sums. */
export function finalBrokenEvidenceCount(policy: StructurePolicyReport | null | undefined): number {
  if (policy === null || policy === undefined) {
    return 0;
  }
  return policy.factErrors.length + policy.toolErrors.length + policy.authority.toolErrors.length;
}

/** The final-side block printed beside the legacy tool errors: refusals first (they void the verdict), then the
 *  alarms (they ARE violations of the exception table), then the receipted skips. */
export function finalBlockLines(policy: StructurePolicyReport, ink: ShowInk): readonly string[] {
  const out: string[] = [];
  for (const e of policy.factErrors) {
    out.push(`${ink.red("✗ FACT TOOL ERROR")} ${ink.bold(e.factId)} [${e.phase}]  ${e.message}`);
  }
  for (const e of policy.toolErrors) {
    out.push(`${ink.red("✗ POLICY TOOL ERROR")} ${ink.bold(e.policyId)} [${e.phase}]  ${e.message}`);
  }
  for (const e of policy.authority.toolErrors) {
    out.push(`${ink.red("✗ AUTHORITY TOOL ERROR")} ${ink.bold(e.policyId ?? "-")} [${e.kind}]  ${e.message}`);
  }
  for (const a of policy.authority.alarms) {
    out.push(`${ink.red("✗ AUTHORITY ALARM")} ${ink.bold(a.policyId)} [${a.kind}]  ${a.message}`);
  }
  for (const r of policy.waiverCarrierRefusals) {
    out.push(ink.dim(`ℹ waiver carrier refused ${r.path} (${r.format}, ${r.status}): ${r.reason}`));
  }
  return out;
}

/** The final tallies for the pass line. */
function finalPassSummary(rows: readonly FinalPolicyRow[], policy: StructurePolicyReport): string {
  const waived = rows.reduce((n, row) => n + row.waived, 0);
  const granted = rows.reduce((n, row) => n + row.granted, 0);
  const effective = rows.reduce((n, row) => n + row.violations.length, 0);
  return `final raw ${waived + granted + effective} = ${waived} waived + ${granted} granted + ${effective} effective (${policy.authority.verdict.warnings} warning)`;
}

/** One violation as the reader prints it: the clickable coordinate (a final finding carries its column), the
 *  message, and the severity tag a warning finding carries. */
export function violationLine(v: Violation, ink: ShowInk): string {
  let loc = v.file;
  if (v.line > 0) {
    loc = v.column === undefined ? `${v.file}:${v.line}` : `${v.file}:${v.line}:${v.column}`;
  }
  return `  ${ink.cyan(loc)}  ${v.message}${v.severity === "warning" ? ink.dim("  [warning]") : ""}`;
}

/** What the FAILED header counts, both contracts. */
export interface FailedCounts {
  readonly total: number;
  readonly toolErrors: number;
  readonly blind: number;
  readonly populations: number;
  readonly finalToolErrors: number;
  readonly alarms: number;
}

/** The failure header: every "the run is not a verdict" class beside the violation count, so an otherwise-empty
 *  failing report explains itself in its first line. */
export function failedHeaderLine(c: FailedCounts, ink: ShowInk): string {
  const parts = [
    c.toolErrors > 0 ? ` + ${c.toolErrors} TOOL ERROR(S)` : "",
    c.blind > 0 ? ` + ${c.blind} BLIND GATE(S)` : "",
    c.populations > 0 ? ` + ${c.populations} REFUSED POPULATION(S)` : "",
    c.finalToolErrors > 0 ? ` + ${c.finalToolErrors} FINAL TOOL ERROR(S)` : "",
    c.alarms > 0 ? ` + ${c.alarms} AUTHORITY ALARM(S)` : "",
  ];
  return ink.red(`✗ check:structure FAILED — ${c.total} violation(s)${parts.join("")} across its gates\n`);
}

/** A row's ratchet-admitted numbers as the pass line reads them — a final row carries none. */
interface AdmittedView {
  readonly contract?: "legacy" | "final";
  readonly scan?: { readonly admitted: number; readonly admittedRatified?: number } | undefined;
}

/** The green pass line: gate count split by contract, the ratchet debt a green run still carries (Codex GA-H-02),
 *  and the final side's raw/waived/granted tallies. */
export function passLine(gates: readonly (AdmittedView | FinalPolicyRow)[], policy: StructurePolicyReport | null | undefined, ink: ShowInk): string {
  const finalRows = gates.filter((g): g is FinalPolicyRow => g.contract === "final");
  const legacy = gates.filter((g): g is AdmittedView => g.contract !== "final");
  const admitted = legacy.reduce((n, g) => n + (g.scan?.admitted ?? 0), 0);
  const ratified = legacy.reduce((n, g) => n + (g.scan?.admittedRatified ?? 0), 0);
  const debt = admitted > 0 ? ink.dim(` · ${admitted} finding(s) admitted by ratchet baselines ${formatSplit(admitted - ratified, ratified)}`) : "";
  const split = finalRows.length > 0 ? ` (${legacy.length} legacy · ${finalRows.length} final)` : "";
  const finalNote = policy === null || policy === undefined ? "" : ink.dim(` · ${finalPassSummary(finalRows, policy)}`);
  return `${ink.green(`✓ check:structure passed — ${gates.length} gates${split}, 0 violations`)}${debt}${finalNote}`;
}
