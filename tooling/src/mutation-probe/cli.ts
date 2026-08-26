// mutation-probe — adjudicate a Stryker report's Survived rows by PLANTING each one and running the
// source's mirror suite. Stryker's own survivor list is not ground truth: measured 2026-08-22, 184 of 230
// reported assemble.ts survivors were already killed by tests on the tree. This is the per-mutant truth,
// and it names the killing tests.
//
// Exit: 0 no real survivors in range · 1 real survivors confirmed · 2 the probe could not measure
// (report drift, uncovered path, zero reported survivors, no mirror suite) · 3 bad arguments.
import process from "node:process";
import { print, printResult } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { probeMutants } from "./index.ts";

const HELP = [
  "usage: pnpm mutation:probe <report.json> <source-rel> [start:end]",
  "",
  "Plants every Survived mutant the report lists for <source-rel>, runs that source's mirror suite,",
  "and records per-mutant whether the suite went RED and which tests failed. The pristine source is",
  "always restored. Receipts land under reports/mutation-probe/.",
  "",
  '  <report.json>  a Stryker JSON report (add "json" to the config\'s reporters)',
  "  <source-rel>   repo-relative source path, e.g. packages/server/src/domain/admin/guard.ts",
  "  [start:end]    optional half-open survivor-index window, e.g. 0:20",
].join("\n");

const RANGE_RE = /^(\d+):(\d+)$/u;

/** report + source, plus the optional window. */
const MAX_ARGS = 3;

function parseRange(arg: string | undefined): { readonly start: number; readonly end: number } | undefined {
  if (arg === undefined) {
    return;
  }
  const m = RANGE_RE.exec(arg);
  if (m === null) {
    throw new UsageError(HELP);
  }
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (end <= start) {
    throw new UsageError(`${HELP}\n\nan empty window (${arg}) measures nothing`);
  }
  return { start, end };
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    print(HELP);
    return EXIT.clean;
  }
  const [reportPath, sourceRel, rangeArg] = args;
  if (reportPath === undefined || sourceRel === undefined || args.length > MAX_ARGS) {
    throw new UsageError(HELP);
  }
  const range = parseRange(rangeArg);
  const summary = probeMutants({ reportPath, sourceRel, ...(range === undefined ? {} : { range }) });
  for (const r of summary.receipts.filter((x) => x.timedOut)) {
    print(`UNMEASURED  ${summary.sourceRel}:${r.line}:${r.column}  ${r.mutator}  (suite hit the wall-clock ceiling)`);
  }
  for (const r of summary.receipts.filter((x) => !(x.killed || x.timedOut))) {
    print(`SURVIVED  ${summary.sourceRel}:${r.line}:${r.column}  ${r.mutator}${r.noop ? "  (NOOP-REPLACEMENT)" : ""}`);
  }
  printResult("mutation-probe", [
    ["source", summary.sourceRel],
    ["specs", summary.specs.join(" ")],
    ["reported", summary.reportedSurvivors],
    ["measured", summary.measured],
    ["killed", summary.killed],
    ["survived", summary.stillSurvived],
    ["timedOut", summary.timedOut],
    ["noop", summary.noopReplacements],
    ["reportedNoCoverage", summary.reportedNoCoverage],
    ["falselyUncovered", summary.falselyUncovered],
    ["receipts", summary.receiptsPath],
  ]);
  // A timed-out mutant was never measured — reporting clean over it would be exactly the absent-evidence
  // lie this tool exists to catch, so an unmeasured run is a tool error, never a pass.
  if (summary.timedOut > 0) {
    return EXIT.toolError;
  }
  return summary.stillSurvived === 0 && summary.falselyUncovered === 0 ? EXIT.clean : EXIT.violations;
}

await runTool(main);
