// Console reporting: the findings table, the pixel-refusal block, the nav verdict.
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Finding, PopulationAccounting, Severity } from "../contract/findings.ts";
import { PRESENTATION_WITHHELD_REASONS } from "../contract/findings.ts";
import type { CensusReachInput, ObscuredScanInput } from "../contract/samples.ts";
import type { DriveStateCandidate, SurfaceStateAccounting } from "../contract/surface-state.ts";
import type { BackdropRefusal, ShellStateSnapshot } from "../contract/types.ts";
import { surfaceStateAxisLabel } from "../lib/surface-state.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

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
  const base = `REACH        ${measured}/${reach.offered} offered control(s) measured (${reach.onScreen} on screen + ${reach.revealed} revealed by ${reach.revealScrolls} scroll(s), ${reach.recentred} re-centred for the hit probe)`;
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
  // The #797 withholding, printed for the same reason SKIPPED is: a control whose hit-probe ring was cut
  // by a viewport edge has a LOWER BOUND, not a size, and the alternative — minting a sub-target finding
  // from it — is the phantom P1 class this counter exists to make impossible AND legible.
  if (reach.frameTruncated > 0) {
    print(
      `NO FRAME     ${reach.frameTruncated} offered control(s) kept an incomplete ±22px hit-probe ring even after re-centring (clipped by a viewport edge) — their extent is a LOWER BOUND and their target-size verdict is WITHHELD, not passed`,
    );
  }
  print("");
}

/** The OBSCURED census's denominator (#816), same law as the reach line above: silence is only evidence
 *  when the reader knows what was looked at. A centre point outside the viewport is UNASKABLE — the
 *  compositor answers `null` there and null reads as "nobody else owns it" (#797) — so an un-probed
 *  candidate is counted and named rather than folded into the clean answer. */
export function printObscuredScan(scan: ObscuredScanInput | undefined): void {
  if (scan === undefined) {
    print("OBSCURED     unreported — this sample set predates the obscured-target census (#816); nothing states whether any element lost its own centre");
    print("");
    return;
  }
  if (scan.unaskable === 0) {
    return;
  }
  print(
    `OBSCURED     ${scan.unaskable} of ${scan.candidates} candidate(s) produced no compositor verdict after re-centring — their obscured verdict is WITHHELD, not passed`,
  );
  for (const subject of (scan.subjects ?? []).slice(0, REFUSAL_PRINT_CAP)) {
    print(
      `             ${subject.selector} centre=${Math.round(subject.centre.x)},${Math.round(subject.centre.y)} rect=${Math.round(subject.rect.left)},${Math.round(subject.rect.top)}..${Math.round(subject.rect.right)},${Math.round(subject.rect.bottom)} ${subject.reason}`,
    );
  }
  if ((scan.subjects?.length ?? 0) > REFUSAL_PRINT_CAP) {
    print(`             … ${String((scan.subjects?.length ?? 0) - REFUSAL_PRINT_CAP)} more (full list in the report json)`);
  }
  print("");
}

/** A RESULT-line value is ONE whitespace-free token — every reader of this line splits on whitespace —
 *  so the two summaries below join with `+` and slug their reason strings rather than reading as prose. */
function resultToken(value: string): string {
  return value.replace(/\s+/gu, "-");
}

/** WHICH RULES were withheld, and WHY, on the RESULT line itself (#1345).
 *
 *  `population-verdict=NO-VERDICT` on its own says a rule population was not completely judged and makes
 *  the reader go find out which: a 2026-09-04 review spent three calls and a python heredoc over the
 *  report JSON to learn that the withheld rules were contrast/text-over-art and the reason was
 *  `unresolvedBackdrop`. Both halves are already in hand here. Presentation-only withholding (the
 *  representative cap) is NOT a completeness gap and is excluded by `populationEvidenceGap`, so this
 *  reads the same source it does: `lib/population.ts`. */
export function populationWithheldSummary(accounting: PopulationAccounting): string {
  const rows: string[] = [];
  for (const [rule, row] of Object.entries(accounting)) {
    for (const [reason, count] of Object.entries(row.withheld)) {
      if (!PRESENTATION_WITHHELD_REASONS.some((presentation) => presentation === reason) && count > 0) {
        rows.push(`${rule}:${reason}×${String(count)}`);
      }
    }
  }
  return rows.length === 0 ? "none" : resultToken(rows.join("+"));
}

/** The DISTINCT refusal reasons behind an unresolvable backdrop, with counts — "box is off-screen" is a
 *  different instruction to the reader than "no painted ancestor", and the RESULT line said neither. */
export function backdropRefusalSummary(refusals: readonly BackdropRefusal[]): string {
  const byReason = new Map<string, number>();
  for (const refusal of refusals) {
    byReason.set(refusal.reason, (byReason.get(refusal.reason) ?? 0) + 1);
  }
  return byReason.size === 0 ? "none" : resultToken([...byReason].map(([reason, count]) => `${reason}×${String(count)}`).join("+"));
}

/** Population verdicts bound presentation without losing the machine denominator. Print every owned
 * counter, including zero, so an absent/partial family cannot resemble a complete clean census.
 *
 * THE ZERO-CANDIDATE FOLD (#1345). The rule above is unchanged and still binding: every owned counter is
 * accounted for inline, BY NAME. What changed is the SHAPE of the accounting for the one class that
 * carries no counters at all — a rule whose census offered zero candidates has nothing to judge, withhold
 * or exclude, so its full row is 130 characters saying `0` seven times. On a real route ~40 of the ~59
 * rules are that shape: ~5 KB of the 9.5–17 KB terminal report, which is what pushed the findings table
 * past the point a reader (or the Bash tool's output cap) reaches. They now ride ONE line that names
 * every one of them, so "which rule saw nothing here" — the signal `census-grid.ts` was built around when
 * the Characters census silently went candidates=1 → candidates=0 — is still answerable from stdout
 * alone, and the full per-rule table remains in the report JSON. */
export function printPopulationAccounting(accounting: PopulationAccounting): void {
  const empty = Object.entries(accounting)
    .filter(([, row]) => row.candidates === 0)
    .map(([rule]) => rule);
  if (empty.length > 0) {
    print(`POPULATION   nothing-to-judge=${String(empty.length)} rule(s) with candidates=0: ${empty.join(", ")}`);
  }
  for (const [rule, row] of Object.entries(accounting)) {
    if (row.candidates === 0) {
      continue;
    }
    const withheld = Object.entries(row.withheld)
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(" ");
    const collapsed = Object.entries(row.collapsed)
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(" ");
    const excluded = Object.entries(row.excluded)
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(" ");
    // `carried` prints ONLY where a census has an alternate route (#1172), and it is deliberately last:
    // an empty `carried()` on the other ~47 rows would read as "this rule has a route and saw none of it".
    const carried = Object.entries(row.carried ?? {})
      .map(([route, count]) => ` carried(${route}=${String(count)})`)
      .join("");
    // The withheld SUBJECTS ride a SEPARATE trailing segment (#1704), never inside `withheld(...)`: that
    // token is a stable machine surface several suites read by value, and a NO-VERDICT that names its
    // subject must not cost a reader who was parsing the tally. Absent when nothing was withheld.
    const withheldAt = Object.entries(row.withheldSubjects ?? {})
      .filter(([reason]) => (row.withheld[reason] ?? 0) > 0)
      .map(([reason, subjects]) => ` withheld-at(${reason}: ${subjects.join(", ")})`)
      .join("");
    print(
      `POPULATION   ${rule} candidates=${String(row.candidates)} judged=${String(row.judged)} affected=${String(row.affected)} populations=${String(row.populations)} representatives=${String(row.emitted)} withheld(${withheld}) excluded(${excluded}) collapsed(${collapsed})${carried}${withheldAt}`,
    );
  }
  if (Object.keys(accounting).length > 0) {
    print("");
  }
}

/** The panel-axis declare + account (#148 item 2): the ONE shell configuration `__orb.shell()` read for
 *  this run, then — same law as `printPopulationAccounting` above — every candidate this run did NOT
 *  visit, named rather than silently folded into a clean-looking zero. A verdict that never prints this
 *  cannot be told apart from one that measured every configuration. */
function shellFocusLabel(shell: ShellStateSnapshot | null): string {
  if (shell === null) {
    return "unmounted";
  }
  return shell.focus ? "on" : "off";
}

export function printSurfaceState(shell: ShellStateSnapshot | null, accounting: SurfaceStateAccounting, drive: DriveStateCandidate): void {
  const listMode = shell?.panels.find((p) => p.side === "list")?.mode ?? "unmounted";
  const contextMode = shell?.panels.find((p) => p.side === "context")?.mode ?? "unmounted";
  print(
    `SHELL STATE  section=${shell?.section ?? "unmounted"} panel-list=${listMode} panel-context=${contextMode} focus=${shellFocusLabel(shell)} drive=${drive}`,
  );
  for (const [axis, census] of [
    ["panel-list", accounting.panelList],
    ["panel-context", accounting.panelContext],
    ["focus", accounting.focus],
    ["drive", accounting.drive],
  ] as const) {
    const withheld = Object.entries(census.withheld)
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(" ");
    const excluded = Object.entries(census.excluded)
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(" ");
    print(
      `SURFACE-AXIS ${axis} candidates=${String(census.candidates)} judged=${String(census.judged)} withheld(${withheld}) excluded(${excluded}) — ${surfaceStateAxisLabel(census)}`,
    );
  }
  print("");
}

export function printFindingsTable(findings: readonly Finding[], complete = true): void {
  if (findings.length === 0) {
    print(complete ? "no findings — clean" : "NO VERDICT   no emitted findings — one or more rule populations were not completely judged");
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
