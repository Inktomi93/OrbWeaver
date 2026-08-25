/**
 * `pnpm check:show` → `cli.ts show` [--errors-only|--gate <name>|--file <path>|--limit <N>]
 *
 * Human-readable, read-don't-rerun view of `reports/check-structure.json` — avoids re-paying the
 * whole-repo ts-morph load just to see what failed.
 *
 * Flags:
 *   --errors-only     terse view — failing gate names + violation counts only, no per-site detail.
 *   --gate <substr>   filter to gates whose name contains <substr> (shows it even if it passes).
 *   --file <substr>   filter violations whose file path contains <substr> (case-insensitive).
 *   --limit <N>       sample violations per gate before an "…and N more" hint (default 10).
 *   --help, -h        usage.
 *
 * Exit code: mirrors the report's overall `ok` (0 clean / 1 dirty) — unless a filter is active,
 * in which case ordinary violations are an inspection view (0). Broken evidence is always toolError (2),
 * and invalid argv is always misuse (3), filters or not.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { reportsPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { nearCapAdvisories } from "../lib/near-cap.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:show");

const DEFAULT_LIMIT = 10;
const POSITIVE_INTEGER = /^\d+$/;
/** The artifact this view reads. ROOT arrives from the cli (the caller's cwd) — never a depth-derived
 *  `import.meta.dirname` walk, whose up-count silently changes at every move (playbook §9.1-4). */
const REPORT_NAME = "check-structure.json";

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}
/** Optional: absent in pre-2026-08-13 artifacts (pass.ts `GateScan`). */
interface GateScanView {
  readonly candidates: number;
  readonly scanned: number;
  readonly admitted: number;
  /** The RATIFIED subset of `admitted` (#569). Absent in pre-#569 artifacts — read as 0, which renders the
   *  whole admission as debt: the honest reading of an artifact written before the class existed. */
  readonly admittedRatified?: number;
  readonly declared?: { readonly unit: string; readonly candidates: number; readonly scanned: number };
}
interface GateReport {
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
  readonly scan?: GateScanView;
}
/** The run manifest (#410). OPTIONAL here on purpose: this view also reads artifacts written before the
 *  manifest existed, and a MISSING manifest is a pre-#410 artifact (readable), while a manifest that says
 *  `complete: false` is a run that DIED (refused). The two are not the same fact. */
interface RunManifestView {
  readonly runId: string;
  readonly complete: boolean;
  readonly ran: number;
  readonly active: number;
  readonly incompleteReasons?: readonly string[];
}
interface StructureReport {
  readonly run?: RunManifestView;
  readonly gates: readonly GateReport[];
  /** Optional: absent in pre-2026-08-03 artifacts. A gate that THREW (exit 2) — without rendering
   *  these, an ok:false report with zero violations displayed as inexplicably empty. */
  readonly toolErrors?: readonly { readonly gate: string; readonly phase: string; readonly message: string }[];
  /** Optional: absent in pre-2026-08-13 artifacts. Gates that ran and read NOTHING — rendered here for the
   *  same reason toolErrors are: this view is where the doctrine says to LOOK, so a signal missing here is
   *  a signal nobody sees. */
  readonly scanAlarms?: readonly string[];
  readonly total: number;
  readonly ok: boolean;
}

const tty = process.stdout.isTTY === true;
const identity = (s: string): string => s;
const ANSI = {
  bold: tty ? (s: string): string => `\x1b[1m${s}\x1b[0m` : identity,
  dim: tty ? (s: string): string => `\x1b[2m${s}\x1b[0m` : identity,
  green: tty ? (s: string): string => `\x1b[32m${s}\x1b[0m` : identity,
  red: tty ? (s: string): string => `\x1b[31m${s}\x1b[0m` : identity,
  cyan: tty ? (s: string): string => `\x1b[36m${s}\x1b[0m` : identity,
};

function print(s: string): void {
  process.stdout.write(`${s}\n`);
}

function readReport(root: string): StructureReport {
  const path = reportsPath(root, REPORT_NAME);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    // A missing report is MISUSE (3): run `pnpm check:structure` first to generate it.
    throw new UsageError(`check:show — couldn't read ${path}\n  Run \`pnpm check:structure\` first to generate it.`, { cause: err });
  }
  return JSON.parse(raw) as StructureReport;
}

interface Filter {
  readonly errorsOnly: boolean;
  readonly gate: string | null;
  readonly file: string | null;
  readonly limit: number;
}

function parseArgs(argv: readonly string[]): Filter | "help" {
  if (argv.includes("--help") || argv.includes("-h")) {
    print(
      "Usage: pnpm check:show [options]\n\n" +
        "  --errors-only     Failing gate names + counts only, no per-site detail.\n" +
        "  --gate <substr>   Filter to gates whose name contains <substr> (shows it even if clean).\n" +
        "  --file <substr>   Filter violations whose file path contains <substr>.\n" +
        '  --limit <N>       Sample violations per gate before an "…and N more" hint (default 10).\n' +
        "  --help, -h        Show this message.\n",
    );
    return "help";
  }
  let errorsOnly = false;
  let gate: string | null = null;
  let file: string | null = null;
  let limit = DEFAULT_LIMIT;
  const valueAfter = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new UsageError(`check:show — ${flag} requires a value`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    switch (arg) {
      case "--errors-only":
        errorsOnly = true;
        break;
      case "--gate":
        gate = valueAfter(i, arg);
        i += 1;
        break;
      case "--file":
        file = valueAfter(i, arg);
        i += 1;
        break;
      case "--limit": {
        const raw = valueAfter(i, arg);
        const parsed = Number(raw);
        const valid = POSITIVE_INTEGER.test(raw) && Number.isSafeInteger(parsed) && parsed >= 1;
        if (!valid) {
          throw new UsageError(`check:show — --limit must be a positive integer, got ${JSON.stringify(raw)}`);
        }
        limit = parsed;
        i += 1;
        break;
      }
      default:
        throw new UsageError(`check:show — unknown argument ${JSON.stringify(arg)}`);
    }
  }
  return { errorsOnly, gate, file, limit };
}

function matchesGate(g: GateReport, f: Filter): boolean {
  return f.gate === null || g.name.toLowerCase().includes(f.gate.toLowerCase());
}

function filteredViolations(g: GateReport, f: Filter): readonly Violation[] {
  if (f.file === null) {
    return g.violations;
  }
  const needle = f.file.toLowerCase();
  return g.violations.filter((v) => v.file.toLowerCase().includes(needle));
}

/** The scan denominator behind a gate's verdict, for the artifact view. Absent on a pre-2026-08-13
 *  artifact — printed as nothing rather than a fabricated zero. */
function scanNote(scan: GateScanView | undefined): string {
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
  return ANSI.dim(`  ·  ${parts.join(" · ")}`);
}

function printGate(g: GateReport, violations: readonly Violation[], f: Filter): void {
  const header = `${g.ok ? ANSI.green("✓") : ANSI.red("✗")} ${ANSI.bold(g.name)} (${violations.length} violation${violations.length === 1 ? "" : "s"})${scanNote(g.scan)}`;
  print(header);
  if (f.errorsOnly || violations.length === 0) {
    print("");
    return;
  }
  const sample = violations.slice(0, f.limit);
  for (const v of sample) {
    const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
    print(`  ${ANSI.cyan(loc)}  ${v.message}`);
  }
  if (violations.length > sample.length) {
    print(ANSI.dim(`  …and ${violations.length - sample.length} more (--limit N to widen)`));
  }
  print("");
}

/** #410: an artifact whose run did not finish (or did not reconcile) is NOT a verdict at any exit code —
 *  it is either the in-flight stub a killed run left behind, or a pass that ran fewer gates than the corpus
 *  holds. Returns the operator line to print, or null when the artifact is consumable. */
function refuseIncomplete(report: StructureReport): string | null {
  const run = report.run;
  if (run === undefined) {
    return null; // a pre-#410 artifact carries no manifest — readable, just older
  }
  if (run.complete && (run.incompleteReasons ?? []).length === 0) {
    return null;
  }
  const why = run.complete
    ? (run.incompleteReasons ?? []).map((r) => `      ‼ ${r}`).join("\n")
    : `      ‼ the run never finished — this is the IN-FLIGHT stub (ran ${run.ran}/${run.active}); it was killed, OOM-aborted or timed out`;
  return ANSI.red(
    `✗ reports/check-structure.json is NOT a verdict (run ${run.runId})\n${why}\n` +
      "      Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#410).",
  );
}

/** The failure header + the thrown-gate rows. A thrown gate is a broken CHECKER, not a violation —
 *  rendered before the gate list so an otherwise-empty failing report explains itself. */
function printVerdictAndToolErrors(report: StructureReport): void {
  const toolErrors = report.toolErrors ?? [];
  const blind = report.scanAlarms ?? [];
  const evidenceBroken = toolErrors.length + blind.length > 0;
  print(
    report.ok && !evidenceBroken
      ? ANSI.green("✓ check:structure passed (filter view)\n")
      : ANSI.red(
          `✗ check:structure FAILED — ${report.total} violation(s)${toolErrors.length > 0 ? ` + ${toolErrors.length} TOOL ERROR(S)` : ""}${blind.length > 0 ? ` + ${blind.length} BLIND GATE(S)` : ""} across its gates\n`,
        ),
  );
  for (const e of toolErrors) {
    print(`${ANSI.red("✗ TOOL ERROR")} ${ANSI.bold(e.gate)} [${e.phase}]  ${e.message}`);
  }
  for (const name of blind) {
    print(
      `${ANSI.red("✗ SCANNED ZERO FILES")} ${ANSI.bold(name)}  the gate ran and read nothing — its verdict is a placebo (tooling/src/verify/gates/GATE-AUTHORING.md §3).`,
    );
  }
  if (toolErrors.length + blind.length > 0) {
    print("");
  }
}

/** #644 — the near-cap ADVISORY, never a violation: a file a few lines under its component-size /
 *  component-size-ui / tooling-size cap is a fact a lane needs BEFORE it edits (a one-member tuple
 *  addition + biome's re-wrap turns "a few lines under" into a surprise RED naming a file the edit never
 *  meant to restructure). Computed fresh off disk every call — cheap, no ts-morph — so it can never go
 *  stale relative to the last `check:structure` run the way a report-embedded count would. */
function printNearCapAdvisories(root: string): void {
  const rows = nearCapAdvisories(root);
  if (rows.length === 0) {
    return;
  }
  print(ANSI.dim(`ℹ ${rows.length} file(s) inside their line-cap band — plan a split before your next edit there (tooling/src/verify/lib/near-cap.ts, #644):`));
  for (const r of rows) {
    print(ANSI.dim(`  ${r.file} — ${r.lines}/${r.cap} (headroom ${r.headroom}, ${r.gate})`));
  }
  print("");
}

/** The failing-report gate list — one row per gate that matches the filter and (unless the caller asked
 *  for this exact gate by name) carries a violation. Split out of `runShow` to keep it under the
 *  cognitive-complexity cap. */
function printGateList(report: StructureReport, filter: Filter): void {
  printVerdictAndToolErrors(report);
  for (const g of report.gates) {
    if (!matchesGate(g, filter)) {
      continue;
    }
    const violations = filteredViolations(g, filter);
    // A clean gate is noise unless the caller explicitly asked to inspect this exact gate.
    if (violations.length === 0 && filter.gate === null) {
      continue;
    }
    printGate(g, violations, filter);
  }
}

/** The `show` verb — the read-don't-rerun view of reports/check-structure.json. Returns the report's own
 *  verdict (0 clean / 1 dirty), or 0 when a filter makes this an inspection view. */
export function runShow(root: string, argv: readonly string[]): number {
  const filter = parseArgs(argv);
  if (filter === "help") {
    return EXIT.clean;
  }
  const report = readReport(root);
  const incomplete = refuseIncomplete(report);
  if (incomplete !== null) {
    print(incomplete);
    return EXIT.toolError;
  }
  const filtersActive = filter.gate !== null || filter.file !== null;
  const evidenceBroken = (report.toolErrors?.length ?? 0) + (report.scanAlarms?.length ?? 0) > 0;

  if (report.ok && !filtersActive && !evidenceBroken) {
    // The admitted total rides the PASS line: a ratchet baseline is declared debt a green run is still
    // carrying, and "green" was the only thing this line said until 2026-08-13 (Codex GA-H-02).
    const admitted = report.gates.reduce((n, g) => n + (g.scan?.admitted ?? 0), 0);
    const ratified = report.gates.reduce((n, g) => n + (g.scan?.admittedRatified ?? 0), 0);
    const debt = admitted > 0 ? ANSI.dim(` · ${admitted} finding(s) admitted by ratchet baselines ${formatSplit(admitted - ratified, ratified)}`) : "";
    print(`${ANSI.green(`✓ check:structure passed — ${report.gates.length} gates, 0 violations`)}${debt}`);
    printNearCapAdvisories(root);
    return EXIT.clean;
  }

  printGateList(report, filter);
  if (!filtersActive) {
    printNearCapAdvisories(root);
  }

  if (evidenceBroken) {
    return EXIT.toolError;
  }
  return filtersActive || report.ok ? EXIT.clean : EXIT.violations;
}
