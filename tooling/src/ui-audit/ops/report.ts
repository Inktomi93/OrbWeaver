// Console reporting: the findings table, the pixel-refusal block, the nav verdict.
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Finding, Severity } from "../contract/findings.ts";
import type { CensusReachInput } from "../contract/samples.ts";
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

/** The interactive census's DENOMINATOR (#653), printed above the findings table.
 *
 *  Silence is only evidence when the reader knows what was looked at. `census=` on the RESULT line
 *  states how many nodes the walk SAW; this states how much of the offered control population the
 *  viewport-bound families could actually MEASURE. Three arms, all loud:
 *   • the walker predates the counters (a pinned fixture sample set) — say `unreported`, never zero;
 *   • the reveal budget ran out — the sweep is incomplete and the skip count is a floor;
 *   • controls remain unreachable — name how many and why.
 *  A fully-reached census prints one quiet line rather than nothing, so its absence is itself a tell. */
export function printCensusReach(reach: CensusReachInput | undefined): void {
  if (reach === undefined) {
    print("REACH        unreported — this sample set predates the reach counters (#653); the tap-target / door / silhouette families state no denominator");
    print("");
    return;
  }
  const measured = reach.onScreen + reach.revealed;
  const base = `REACH        ${measured}/${reach.offered} offered control(s) measured (${reach.onScreen} on screen + ${reach.revealed} revealed by ${reach.revealScrolls} scroll(s))`;
  if (reach.budgetExhausted) {
    print(`${base} — BUDGET EXHAUSTED at ${reach.revealBudget} scrolls: the sweep is INCOMPLETE and the skip count below is a floor, not a total`);
  } else {
    print(base);
  }
  if (reach.skippedOffViewport > 0) {
    print(
      `SKIPPED      ${reach.skippedOffViewport} offered control(s) still outside the viewport after a reveal attempt (off-canvas / fixed past the edge) — no tap-target, action-door or silhouette rule judged them`,
    );
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
