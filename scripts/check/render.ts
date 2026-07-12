// The grouped, per-occurrence reporter (TSMORPH-SINGLE-PASS-AUDIT.md §9.3 + owner rulings 1/2). The
// dispatcher (pass.ts) emits EXHAUSTIVE per-occurrence findings — one per offending TOKEN — carrying only
// `{file,line,column,token}`. The reason (what's wrong + WHY + HOW to fix) lives ONCE on the gate
// descriptor. This reporter GROUPS by gate → prints the reason once as the group header → lists ALL
// occurrences beneath it as clickable `path.ts:line:col` jump-links (the shape editors + Claude Code
// linkify). Like grouped eslint/tsc output.
//
// Read-side foundation running ALONGSIDE the legacy harness reporter — nothing here changes the legacy
// verdict; it renders the NEW dispatcher's findings for the ported gates only.
import type { Finding, GateDescriptor } from "./contract.ts";
import type { PassResult, ToolError } from "./pass.ts";

/** A finding's clickable coordinate: `path:line:col` for a node/token-anchored hit; bare `path` for a
 *  genuinely file-level hit (line/column 0) so the linker never jumps to a phantom `:0:0`. */
function locRef(f: Finding): string {
  return f.line > 0 ? `${f.file}:${f.line}:${f.column}` : f.file;
}

/** The per-occurrence suffix: the offending token, or a per-occurrence message override for the rare
 *  finding whose text varies (a stale-registry arm naming the dead entry), or nothing. */
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

/** Render ONE failing gate as a group: the ✗ header with the count, the reason (message + fix) printed
 *  ONCE, then every occurrence beneath. */
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

/** A tool error (a gate that threw) — the checker itself is broken (§9.4), distinct from a violation. */
function renderToolError(e: ToolError): string {
  return `  ⚠ ${e.gate} [${e.phase}]: ${e.message}`;
}

/** Render the whole pass result: grouped failing gates (reason once, occurrences under), a one-line ✓ per
 *  clean gate, then the summary footer. `gatesByName` resolves each result's descriptor for its reason. */
export function renderPass(
  result: PassResult,
  gatesByName: ReadonlyMap<string, GateDescriptor>,
): string {
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
      // Defensive: a result without its descriptor still prints its occurrences (no reason header).
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
  out.push(
    violationTotal > 0 ? `single-pass: ${violationTotal} violation(s)` : "single-pass: clean",
  );
  return out.join("\n");
}
