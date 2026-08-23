// Console reporting: the findings table, the pixel-refusal block, the nav verdict.
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Finding, Severity } from "../contract/findings.ts";
import type { BackdropRefusal } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

const MESSAGE_COL_WIDTH = 88;
const SEVERITY_COL = 9;
const RULE_COL = 21;
const SELECTOR_MAX_LEN = 38;
const SELECTOR_COL = 39;

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  // biome-ignore lint/style/useNamingConvention: P0-P3 ARE the Severity union's members — the counts map is keyed by the domain vocabulary, not by prose identifiers.
  const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

/** `nav=` covers both failure classes: a page that never loaded, and a nav/click action that never
 *  landed (which means the findings below describe some OTHER surface). */
export function navVerdict(navError: string | null, actionsFailed: number): string {
  if (navError !== null) {
    return "ERROR";
  }
  return actionsFailed > 0 ? "ACTIONS-FAILED" : "OK";
}

// Refusals are printed but do NOT redden the run: unlike snap's single requested measurement, this scan
// censuses every text node on the page, most of them scrolled out of the viewport, so an off-screen box is
// the normal case and not a failure. What must never happen is a SILENT drop — a reviewer reading a clean
// contrast table is entitled to know which nodes the instrument declined to judge, and why.
const REFUSAL_PRINT_CAP = 12;

export function printBackdropRefusals(refusals: readonly BackdropRefusal[]): void {
  if (refusals.length === 0) {
    return;
  }
  const byReason = new Map<string, number>();
  for (const r of refusals) {
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  }
  const summary = [...byReason].map(([reason, n]) => `${n} ${reason}`).join(" · ");
  print(`NO VERDICT   ${refusals.length} text node(s) over an unresolvable backdrop, not pixel-samplable: ${summary}`);
  for (const r of refusals.slice(0, REFUSAL_PRINT_CAP)) {
    print(`             ${r.selector}`);
  }
  if (refusals.length > REFUSAL_PRINT_CAP) {
    print(`             … ${refusals.length - REFUSAL_PRINT_CAP} more (full list in the report json)`);
  }
  print("");
}

export function printFindingsTable(findings: readonly Finding[]): void {
  if (findings.length === 0) {
    print("no findings — clean");
    return;
  }
  const sorted = [...findings].sort((a, b) => a.severity.localeCompare(b.severity));
  print("severity  rule                  selector                                message");
  for (const f of sorted) {
    const truncated = f.message.length > MESSAGE_COL_WIDTH ? `${f.message.slice(0, MESSAGE_COL_WIDTH)}…` : f.message;
    const severityCol = f.severity.padEnd(SEVERITY_COL);
    const ruleCol = f.rule.padEnd(RULE_COL);
    const selectorCol = f.selector.slice(0, SELECTOR_MAX_LEN).padEnd(SELECTOR_COL);
    print(`${severityCol} ${ruleCol} ${selectorCol} ${truncated} (${f.value})`);
  }
}
