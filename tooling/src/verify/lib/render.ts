// The grouped, per-occurrence reporter. The dispatcher (pass.ts) emits per-occurrence findings carrying
// only `{file,line,column,token}`; the reason lives once on the gate descriptor. This reporter groups by
// gate, prints the reason once as the group header, then lists all occurrences beneath it as clickable
// `path.ts:line:col` jump-links — like grouped eslint/tsc output.
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import type { Finding, GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import type { GatePassResult, GateScan, PassResult, ToolError } from "../contract/pass.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { FinalPolicyRow, StructurePolicyReport } from "../contract/structure-report.ts";
import { isBlindScan } from "./pass.ts";
import { populationAlarmLine, populationAlarms } from "./population.ts";

/** A finding's clickable coordinate: `path:line:col` for a node/token-anchored hit; bare `path` for a
 *  genuinely file-level hit (line/column 0) so the linker never jumps to a phantom `:0:0`. */
function locRef(f: Finding): string {
  return f.line > 0 ? `${f.file}:${f.line}:${f.column}` : f.file;
}

/** The per-occurrence suffix: the offending token, or a per-occurrence message override, or nothing. */
function occurrenceSuffix(f: Finding): string {
  if (f.token !== undefined) {
    return `  ${f.token}`;
  }
  if (f.message !== undefined) {
    return `  ${f.message}`;
  }
  return "";
}

/** The occurrence line: the jump-link, then the offending token / override. */
function occurrenceLine(f: Finding): string {
  return `      ${locRef(f)}${occurrenceSuffix(f)}`;
}

const ZERO_SCAN_MARKER = "SCANNED ZERO FILES";
const POPULATION_MARKER = "REFUSED POPULATION receipt(s)";

/** The zero-scan explanation, printed on the gate's own line so a blind gate cannot be skimmed past. */
const ZERO_SCAN_NOTE =
  `${ZERO_SCAN_MARKER}: the gate ran and read nothing, so its verdict is a placebo — a scanRoot/predicate ` +
  "regression looks exactly like a clean tree. See tooling/src/verify/gates/GATE-AUTHORING.md §3.";

/** The scan-health suffix every gate line carries: the denominator behind the verdict, the ratchet debt
 *  it is silently carrying, and any units the gate counted itself. `alarm` is set only by the real-tree
 *  entrypoint — a scoped run's zero is legitimate (pass.ts `zeroScanGates`). */
function scanSuffix(scan: GateScan, alarm: boolean): string {
  if (alarm && isBlindScan(scan)) {
    return `  ·  scanned ${scan.scanned}/${scan.candidates} files — ${ZERO_SCAN_NOTE}`;
  }
  const parts = [`scanned ${scan.scanned}/${scan.candidates} files`];
  const declared = scan.declared;
  if (declared !== undefined) {
    parts.push(`${declared.scanned}/${declared.candidates} ${declared.unit}s (gate-declared)`);
    for (const [reason, n] of Object.entries(declared.skipReasons)) {
      parts.push(`skipped ${n} (${reason})`);
    }
  }
  for (const p of scan.populations) {
    // The SEMANTIC denominator (#946), printed beside the file one: a coverage gate's verdict rests on
    // this number, and a shrinking member count is invisible in a healthy file count.
    parts.push(p.unresolved > 0 ? `${p.source}: ${p.members} member(s), ${p.unresolved} UNRESOLVED` : `${p.source}: ${p.members} member(s)`);
  }
  if (scan.admitted > 0) {
    // SPLIT BY CLASS (#569): a ratified admission is permanent by a recorded ruling / documented tool-FP —
    // printing one undifferentiated number made every ledger read as burnable backlog.
    parts.push(`admitted-by-ratchet: ${scan.admitted} ${formatSplit(scan.admitted - scan.admittedRatified, scan.admittedRatified)}`);
  }
  return `  ·  ${parts.join(" · ")}`;
}

/** Render ONE failing gate as a group: the header, the reason printed once, then every occurrence. */
function renderGroup(gate: GateDescriptor, findings: readonly Finding[], scanned: string): string {
  const lines: string[] = [`  ✗ ${gate.name} (${findings.length})${scanned}`];
  lines.push(`      ${gate.message}`);
  if (gate.fix !== undefined) {
    lines.push(`      fix: ${gate.fix}`);
  }
  for (const f of findings) {
    lines.push(occurrenceLine(f));
  }
  return lines.join("\n");
}

/** A tool error (a gate that threw) — the checker itself is broken, distinct from a violation. */
function renderToolError(e: ToolError): string {
  return `  ⚠ ${e.gate} [${e.phase}]: ${e.message}`;
}

interface RenderOptions {
  /** Render a gate that scanned NOTHING as a loud ⚠ instead of a ✓. Real-tree entrypoints only: a scoped
   *  run and a conformance mini-project legitimately hand a gate zero in-scope files. */
  readonly zeroScanAlarm?: boolean;
}

/** Render the whole pass result: grouped failing gates (reason once, occurrences under), a one-line ✓ per
 *  clean gate — each carrying its SCAN DENOMINATOR and any ratchet-admitted debt — then the summary
 *  footer. `gatesByName` resolves each result's descriptor for its reason. */
/** ONE gate's block: the ⚠/✓/✗ line (always carrying its scan denominator) plus, when it failed, the
 *  reason and every occurrence. */
function renderGateResult(g: GatePassResult, gatesByName: ReadonlyMap<string, GateDescriptor>, alarm: boolean): readonly string[] {
  const suffix = scanSuffix(g.scan, alarm);
  if (alarm && isBlindScan(g.scan)) {
    return [`  ⚠ ${g.name}${suffix}`];
  }
  if (g.ok) {
    return [`  ✓ ${g.name}${suffix}`];
  }
  const gate = gatesByName.get(g.name);
  if (gate === undefined) {
    return [`  ✗ ${g.name} (${g.findings.length})${suffix}`, ...g.findings.map(occurrenceLine)];
  }
  return [renderGroup(gate, g.findings, suffix)];
}

/** What the footer summarises — accumulated over the per-gate lines so the summary can never disagree
 *  with the block above it. */
interface PassTotals {
  readonly violations: number;
  readonly blind: number;
  readonly admitted: number;
  readonly ratified: number;
}

/** The summary footer. Every "the run is not a verdict" class prints its own line and BLOCKS the word
 *  "clean": a blind gate, a refused population receipt (#946), a thrown gate. */
function renderFooter(result: PassResult, totals: PassTotals, alarm: boolean): readonly string[] {
  const out: string[] = [];
  if (totals.blind > 0) {
    out.push(`single-pass: ${totals.blind} gate(s) ${ZERO_SCAN_MARKER} — the checker is BLIND, not clean`);
  }
  // The population half of the same alarm (#946), same placement rule: only the real-tree entrypoint asks
  // (a scoped run and a conformance mini-project legitimately resolve zero members).
  const populations = alarm ? populationAlarms(result) : [];
  for (const a of populations) {
    out.push(`  ⚠ ${populationAlarmLine(a)}`);
  }
  if (populations.length > 0) {
    out.push(`single-pass: ${populations.length} ${POPULATION_MARKER} — a coverage gate's member denominator, not its file count`);
  }
  if (result.toolErrors.length > 0) {
    out.push(`single-pass: ${result.toolErrors.length} tool error(s) — the checker is broken`);
  }
  if (totals.admitted > 0) {
    // The DEBT half is the burnable population a board row can claim; the RATIFIED half is permanent by a
    // recorded ruling or a documented tool false positive (`pnpm debt` lists both, separately).
    out.push(
      `single-pass: ${totals.admitted} finding(s) admitted by ratchet baselines ${formatSplit(totals.admitted - totals.ratified, totals.ratified)} — the debt half is a live population, the ratified half is ruled permanent`,
    );
  }
  if (totals.violations > 0) {
    out.push(`single-pass: ${totals.violations} violation(s)`);
    return out;
  }
  // A blind gate or a refused population must never be summarised as "clean" — that word is the whole
  // defect (a reader who skims the footer would take a checker that measured nothing for a passing tree).
  if (totals.blind > 0) {
    out.push("single-pass: 0 violations — NOT a clean verdict, a gate above read nothing");
  } else {
    out.push(populations.length > 0 ? "single-pass: 0 violations — NOT a clean verdict, a gate above resolved no members" : "single-pass: clean");
  }
  return out;
}

export function renderPass(result: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>, opts?: RenderOptions): string {
  const alarm = opts?.zeroScanAlarm === true;
  const out: string[] = [];
  let violations = 0;
  let blind = 0;
  let admitted = 0;
  let ratified = 0;
  for (const g of result.gates) {
    admitted += g.scan.admitted;
    ratified += g.scan.admittedRatified;
    const isBlind = alarm && isBlindScan(g.scan);
    blind += isBlind ? 1 : 0;
    violations += isBlind ? 0 : g.findings.length;
    out.push(...renderGateResult(g, gatesByName, alarm));
  }
  for (const e of result.toolErrors) {
    out.push(renderToolError(e));
  }
  out.push("");
  out.push(...renderFooter(result, { violations, blind, admitted, ratified }, alarm));
  return out.join("\n");
}

// ── the FINAL side (mixed runtime, #1584 §5) ─────────────────────────────────────────────────────────────
// Same line shapes as the legacy block above — `  ✓ <id>` / `  ✗ <id> (N)` / `  ⚠ <id>` with a `  ·  ` suffix —
// so a reader (and check-gates.repo.int's scrape) sees ONE roster; the suffix carries the final vocabulary (authority,
// severity, the population and receipt denominators, waived/granted) instead of a file scan count.

function policyOccurrenceLine(v: Violation): string {
  const loc = v.line > 0 ? `${v.file}:${v.line}:${v.column ?? 0}` : v.file;
  const suffix = v.token === undefined ? "" : `  ${v.token}`;
  return `      ${loc}${suffix}${v.severity === "warning" ? "  [warning]" : ""}`;
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
  if (row.ok) {
    const head = warnings > 0 ? `  ✓ ${row.name} (${warnings} warning(s))${suffix}` : `  ✓ ${row.name}${suffix}`;
    return [head, ...row.violations.map(policyOccurrenceLine)];
  }
  const lines = [`  ✗ ${row.name} (${row.violations.length})${suffix}`];
  if (policy !== undefined) {
    lines.push(`      ${policy.message}`);
    if (policy.fix !== undefined) {
      lines.push(`      fix: ${policy.fix}`);
    }
  }
  lines.push(...row.violations.map(policyOccurrenceLine));
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
