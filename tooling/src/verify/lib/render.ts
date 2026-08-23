// The grouped, per-occurrence reporter. The dispatcher (pass.ts) emits per-occurrence findings carrying
// only `{file,line,column,token}`; the reason lives once on the gate descriptor. This reporter groups by
// gate, prints the reason once as the group header, then lists all occurrences beneath it as clickable
// `path.ts:line:col` jump-links — like grouped eslint/tsc output.
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import type { Finding, GateDescriptor } from "../contract/gate.ts";
import type { GatePassResult, GateScan, PassResult, ToolError } from "../contract/pass.ts";
import { isBlindScan } from "./pass.ts";

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

export function renderPass(result: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>, opts?: RenderOptions): string {
  const alarm = opts?.zeroScanAlarm === true;
  const out: string[] = [];
  let violationTotal = 0;
  let blind = 0;
  let admittedTotal = 0;
  let ratifiedTotal = 0;
  for (const g of result.gates) {
    admittedTotal += g.scan.admitted;
    ratifiedTotal += g.scan.admittedRatified;
    const isBlind = alarm && isBlindScan(g.scan);
    blind += isBlind ? 1 : 0;
    violationTotal += isBlind ? 0 : g.findings.length;
    out.push(...renderGateResult(g, gatesByName, alarm));
  }
  for (const e of result.toolErrors) {
    out.push(renderToolError(e));
  }
  out.push("");
  if (blind > 0) {
    out.push(`single-pass: ${blind} gate(s) ${ZERO_SCAN_MARKER} — the checker is BLIND, not clean`);
  }
  if (result.toolErrors.length > 0) {
    out.push(`single-pass: ${result.toolErrors.length} tool error(s) — the checker is broken`);
  }
  if (admittedTotal > 0) {
    // The DEBT half is the burnable population a board row can claim; the RATIFIED half is permanent by a
    // recorded ruling or a documented tool false positive (`pnpm debt` lists both, separately).
    out.push(
      `single-pass: ${admittedTotal} finding(s) admitted by ratchet baselines ${formatSplit(admittedTotal - ratifiedTotal, ratifiedTotal)} — the debt half is a live population, the ratified half is ruled permanent`,
    );
  }
  if (violationTotal > 0) {
    out.push(`single-pass: ${violationTotal} violation(s)`);
  } else {
    // A blind gate must never be summarised as "clean" — that word is the whole defect (a reader who
    // skims the footer would take a checker that read nothing for a passing tree).
    out.push(blind > 0 ? "single-pass: 0 violations — NOT a clean verdict, a gate above read nothing" : "single-pass: clean");
  }
  return out.join("\n");
}
