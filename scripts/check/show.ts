#!/usr/bin/env tsx
/**
 * pnpm check:show [--errors-only|--gate <name>|--file <path>|--limit <N>]
 *
 * Human-readable, READ-DON'T-RERUN view of `reports/check-structure.json` — the JSON
 * `scripts/check/report.ts` writes UNCONDITIONALLY (clean or dirty) right after
 * `pnpm check:structure` prints its own console report. Re-running `pnpm check:structure`
 * just to see what failed re-pays the whole-repo ts-morph load (the dominant fixed cost of
 * every one of the four global gates); this tool reads the JSON that run already produced.
 *
 * Flags:
 *   --errors-only     terse view — failing gate names + violation counts only, no per-site detail.
 *   --gate <substr>   filter to gates whose name contains <substr> (case-insensitive; an
 *                     INSPECTION filter — shows the gate even if it currently passes, e.g.
 *                     `pnpm check:show --gate test-layout` to see it's clean).
 *   --file <substr>   filter violations whose file path contains <substr> (case-insensitive).
 *   --limit <N>       sample violations per gate before an "…and N more" hint (default 10).
 *   --help, -h        usage.
 *
 * Exit code: mirrors the report's overall `ok` (0 clean / 1 dirty) — UNLESS a filter is active,
 * in which case this is an inspection view and always exits 0 (same convention as neo's
 * check:show: "filters-on-passing-report" is a look, not an assertion).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const DEFAULT_LIMIT = 10;
const REPORT_PATH = join(import.meta.dirname, "..", "..", "reports", "check-structure.json");
// The 0/1/2/3 exit scheme (TSMORPH-SINGLE-PASS-AUDIT.md §9.4): a missing report is MISUSE (3) — you
// invoked the viewer without generating the report first (run `pnpm check:structure`). Not a tool error
// (2 = the viewer itself broke) and not a violation (1 = the report says dirty).
const EXIT_MISSING_REPORT = 3;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}
interface GateReport {
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
}
interface StructureReport {
  readonly gates: readonly GateReport[];
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

function readReport(): StructureReport {
  let raw: string;
  try {
    raw = readFileSync(REPORT_PATH, "utf-8");
  } catch {
    print(
      ANSI.red(
        `check:show — couldn't read ${REPORT_PATH}\n` +
          "  Run `pnpm check:structure` first to generate it.",
      ),
    );
    process.exit(EXIT_MISSING_REPORT);
  }
  return JSON.parse(raw) as StructureReport;
}

interface Filter {
  readonly errorsOnly: boolean;
  readonly gate: string | null;
  readonly file: string | null;
  readonly limit: number;
}

function flagValue(args: readonly string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) {
    return null;
  }
  return args[i + 1] ?? null;
}

function parseArgs(argv: readonly string[]): Filter {
  if (argv.includes("--help") || argv.includes("-h")) {
    print(
      "Usage: pnpm check:show [options]\n\n" +
        "  --errors-only     Failing gate names + counts only, no per-site detail.\n" +
        "  --gate <substr>   Filter to gates whose name contains <substr> (shows it even if clean).\n" +
        "  --file <substr>   Filter violations whose file path contains <substr>.\n" +
        '  --limit <N>       Sample violations per gate before an "…and N more" hint (default 10).\n' +
        "  --help, -h        Show this message.\n",
    );
    process.exit(0);
  }
  const limitArg = flagValue(argv, "--limit");
  return {
    errorsOnly: argv.includes("--errors-only"),
    gate: flagValue(argv, "--gate"),
    file: flagValue(argv, "--file"),
    limit: limitArg === null ? DEFAULT_LIMIT : Number(limitArg) || DEFAULT_LIMIT,
  };
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

function printGate(g: GateReport, violations: readonly Violation[], f: Filter): void {
  const header = `${g.ok ? ANSI.green("✓") : ANSI.red("✗")} ${ANSI.bold(g.name)} (${violations.length} violation${violations.length === 1 ? "" : "s"})`;
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

function main(): void {
  const filter = parseArgs(process.argv.slice(2));
  const report = readReport();
  const filtersActive = filter.gate !== null || filter.file !== null;

  if (report.ok && !filtersActive) {
    print(ANSI.green(`✓ check:structure passed — ${report.gates.length} gates, 0 violations`));
    process.exit(0);
  }

  print(
    report.ok
      ? ANSI.green("✓ check:structure passed (filter view)\n")
      : ANSI.red(`✗ check:structure FAILED — ${report.total} violation(s) across its gates\n`),
  );

  for (const g of report.gates) {
    if (!matchesGate(g, filter)) {
      continue;
    }
    const violations = filteredViolations(g, filter);
    // A clean gate is noise UNLESS the caller explicitly asked to inspect this exact gate
    // (`--gate`, e.g. "prove test-layout is clean") — `--file` alone narrows violations, it
    // doesn't ask to see every otherwise-uninvolved gate's ✓ line (report.ts's console output
    // already shows that list).
    if (violations.length === 0 && filter.gate === null) {
      continue;
    }
    printGate(g, violations, filter);
  }

  const exitCode = filtersActive || report.ok ? 0 : 1;
  process.exit(exitCode);
}

main();
