// `pnpm check:show`'s LEGACY STRUCTURE GATE LIST renderer — the toolError/blind/population/final-side header
// block, the per-gate violation rows, and the near-cap advisories. Split out of ops/show.ts under the
// tooling line cap (Core-Tooling-Law.md §4.3, docs/work item 0267): this is the RENDERER half, returning
// lines rather than writing them, so it stays testable without a spawned CLI; ops/show.ts keeps argv,
// filtering decisions and the one write per line.
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import type { GateReport, GateScanView, StructureReport, Violation } from "../contract/show-artifact.ts";
import type { StructurePolicyReport } from "../contract/structure-report.ts";
import { nearCapAdvisories } from "./near-cap.ts";
import { brokenEvidenceCount, isFinalRow, populationAlarmText } from "./show-artifact.ts";
import type { ShowInk } from "./show-policy.ts";
import { failedHeaderLine, finalBlockLines, finalBrokenEvidenceCount, finalRowHeader, violationLine } from "./show-policy.ts";

/** The subset of `ops/show.ts`'s `Filter` this renderer reads: a gate/file narrower and the per-gate sample
 *  cap. A plain `Filter` satisfies this structurally, so the caller passes its own filter unchanged. */
export interface StructureViewFilter {
  readonly errorsOnly: boolean;
  readonly gate: string | null;
  readonly file: string | null;
  readonly limit: number;
}

function matchesGate(g: GateReport, f: StructureViewFilter): boolean {
  return f.gate === null || g.name.toLowerCase().includes(f.gate.toLowerCase());
}

function filteredViolations(g: GateReport, f: StructureViewFilter): readonly Violation[] {
  if (f.file === null) {
    return g.violations;
  }
  const needle = f.file.toLowerCase();
  return g.violations.filter((v) => v.file.toLowerCase().includes(needle));
}

/** The scan denominator behind a gate's verdict, for the artifact view. Absent on a pre-2026-08-13
 *  artifact — printed as nothing rather than a fabricated zero. */
function scanNote(scan: GateScanView | undefined, ink: ShowInk): string {
  if (scan === undefined) {
    return "";
  }
  const parts = [`scanned ${scan.scanned}/${scan.candidates} files`];
  if (scan.declared !== undefined) {
    parts.push(`${scan.declared.scanned}/${scan.declared.candidates} ${scan.declared.unit}s`);
  }
  if (scan.admitted > 0) {
    const ratified = scan.admittedRatified ?? 0;
    parts.push(`admitted-by-ratchet: ${scan.admitted} ${formatSplit(scan.admitted - ratified, ratified)}`);
  }
  return ink.dim(`  ·  ${parts.join(" · ")}`);
}

function gateLines(g: GateReport, violations: readonly Violation[], f: StructureViewFilter, ink: ShowInk): readonly string[] {
  const header = isFinalRow(g)
    ? finalRowHeader(g, violations.length, ink)
    : `${g.ok ? ink.green("✓") : ink.red("✗")} ${ink.bold(g.name)} (${violations.length} violation${violations.length === 1 ? "" : "s"})${scanNote(g.scan, ink)}`;
  if (f.errorsOnly || violations.length === 0) {
    return [header, ""];
  }
  const sample = violations.slice(0, f.limit);
  const lines = [header, ...sample.map((v) => violationLine(v, ink))];
  if (violations.length > sample.length) {
    lines.push(ink.dim(`  …and ${violations.length - sample.length} more (--limit N to widen)`));
  }
  lines.push("");
  return lines;
}

/** The failure header + the thrown-gate rows. A thrown gate is a broken CHECKER, not a violation — rendered
 *  before the gate list so an otherwise-empty failing report explains itself. `filtersActive` decides the
 *  clean header's wording: "(filter view)" is true only when `--gate`/`--file` narrowed the read — the same
 *  clean report reached through the failed-verify-run fallthrough (structure itself is green, but the run
 *  around it was not) is not a filtered inspection and must not claim to be one. */
function verdictLines(report: StructureReport, filtersActive: boolean, ink: ShowInk): readonly string[] {
  const toolErrors = report.toolErrors ?? [];
  const blind = report.scanAlarms ?? [];
  const populations = report.populationAlarms ?? [];
  const evidenceBroken = brokenEvidenceCount(report) > 0;
  // ANNOTATED LOCAL — see the same note in ops/structure.ts: biome resolves the imported view's optional
  // `policy` as always-present and reds the `?.` below; tsc reads the union correctly.
  const policy: StructurePolicyReport | null | undefined = report.policy;
  const counts = {
    total: report.total,
    toolErrors: toolErrors.length,
    blind: blind.length,
    populations: populations.length,
    finalToolErrors: finalBrokenEvidenceCount(report.policy),
    alarms: policy?.authority.alarms.length ?? 0,
  };
  const cleanHeader = filtersActive ? "✓ check:structure passed (filter view)\n" : "✓ check:structure passed\n";
  const lines: string[] = [report.ok && !evidenceBroken ? ink.green(cleanHeader) : failedHeaderLine(counts, ink)];
  for (const e of toolErrors) {
    lines.push(`${ink.red("✗ TOOL ERROR")} ${ink.bold(e.gate)} [${e.phase}]  ${e.message}`);
  }
  for (const name of blind) {
    lines.push(
      `${ink.red("✗ SCANNED ZERO FILES")} ${ink.bold(name)}  the gate ran and read nothing — its verdict is a placebo (tooling/src/verify/gates/GATE-AUTHORING.md §3).`,
    );
  }
  for (const a of populations) {
    lines.push(`${ink.red("✗ REFUSED POPULATION")} ${ink.bold(a.gate)}  ${populationAlarmText(a)}`);
  }
  if (report.policy !== null && report.policy !== undefined) {
    lines.push(...finalBlockLines(report.policy, ink));
  }
  if (evidenceBroken) {
    lines.push("");
  }
  return lines;
}

/** The failing-report gate list — one row per gate that matches the filter and (unless the caller asked for
 *  this exact gate by name) carries a violation. */
export function gateListLines(report: StructureReport, filter: StructureViewFilter, filtersActive: boolean, ink: ShowInk): readonly string[] {
  const lines: string[] = [...verdictLines(report, filtersActive, ink)];
  for (const g of report.gates) {
    if (!matchesGate(g, filter)) {
      continue;
    }
    const violations = filteredViolations(g, filter);
    // A clean gate is noise unless the caller explicitly asked to inspect this exact gate.
    if (violations.length === 0 && filter.gate === null) {
      continue;
    }
    lines.push(...gateLines(g, violations, filter, ink));
  }
  return lines;
}

/** #644 — the near-cap ADVISORY, never a violation: a file a few lines under its component-size /
 *  component-size-ui / tooling-size cap is a fact a lane needs BEFORE it edits (a one-member tuple addition
 *  + biome's re-wrap turns "a few lines under" into a surprise RED naming a file the edit never meant to
 *  restructure). Computed fresh off disk every call — cheap, no ts-morph — so it can never go stale relative
 *  to the last `check:structure` run the way a report-embedded count would. */
export function nearCapAdvisoryLines(root: string, ink: ShowInk): readonly string[] {
  const rows = nearCapAdvisories(root);
  if (rows.length === 0) {
    return [];
  }
  return [
    ink.dim(`ℹ ${rows.length} file(s) inside their line-cap band — plan a split before your next edit there (tooling/src/verify/lib/near-cap.ts, #644):`),
    ...rows.map((r) => ink.dim(`  ${r.file} — ${r.lines}/${r.cap} (headroom ${r.headroom}, ${r.gate})`)),
    "",
  ];
}
