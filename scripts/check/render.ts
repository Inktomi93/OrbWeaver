// The grouped, per-occurrence reporter. The dispatcher (pass.ts) emits per-occurrence findings carrying
// only `{file,line,column,token}`; the reason lives once on the gate descriptor. This reporter groups by
// gate, prints the reason once as the group header, then lists all occurrences beneath it as clickable
// `path.ts:line:col` jump-links — like grouped eslint/tsc output.
import type { Finding, GateDescriptor } from "./contract.ts";
import type { PassResult, ToolError } from "./pass.ts";

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

/** Render ONE failing gate as a group: the header, the reason printed once, then every occurrence. */
function renderGroup(gate: GateDescriptor, findings: readonly Finding[]): string {
  const lines: string[] = [`  ✗ ${gate.name} (${findings.length})`];
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

/** Render the whole pass result: grouped failing gates (reason once, occurrences under), a one-line ✓ per
 *  clean gate, then the summary footer. `gatesByName` resolves each result's descriptor for its reason. */
export function renderPass(result: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>): string {
  const out: string[] = [];
  let violationTotal = 0;
  for (const g of result.gates) {
    if (g.ok) {
      out.push(`  ✓ ${g.name}`);
      continue;
    }
    violationTotal += g.findings.length;
    const gate = gatesByName.get(g.name);
    if (gate === undefined) {
      out.push(`  ✗ ${g.name} (${g.findings.length})`);
      for (const f of g.findings) {
        out.push(occurrenceLine(f));
      }
      continue;
    }
    out.push(renderGroup(gate, g.findings));
  }
  for (const e of result.toolErrors) {
    out.push(renderToolError(e));
  }
  out.push("");
  if (result.toolErrors.length > 0) {
    out.push(`single-pass: ${result.toolErrors.length} tool error(s) — the checker is broken`);
  }
  out.push(violationTotal > 0 ? `single-pass: ${violationTotal} violation(s)` : "single-pass: clean");
  return out.join("\n");
}
