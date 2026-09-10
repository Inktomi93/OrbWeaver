// mutation-arid — report what the ARID ignorer dropped from a Stryker report's denominator.
// The ignorer itself is a plugin Stryker imports (see index.ts); this is the operator's read on it, and
// the evidence a `break` recalibration rests on when its rules change.
// Exit: 0 census printed · 2 the report could not be read · 3 bad arguments.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { printVerdict } from "../_shared/evidence.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { aridCensus } from "./index.ts";

/** Right-aligns counts under a 5-wide column. */
const COUNT_COLUMN = 5;

const HELP = [
  "usage: pnpm mutation:arid <report.json>",
  "",
  "Counts the mutants the ARID ignorer removed from the scored denominator, grouped by reason.",
  "Run it before and after changing the ignorer's rules: the delta IS the calibration change, and",
  "`break` in stryker.gate.config.js must be re-measured whenever it moves.",
].join("\n");

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    print(HELP);
    return EXIT.clean;
  }
  const [reportPath] = args;
  if (reportPath === undefined || args.length > 1) {
    throw new UsageError(HELP);
  }
  const census = aridCensus(reportPath);
  for (const row of census.byReason) {
    print(`${String(row.count).padStart(COUNT_COLUMN)}  ${row.reason}`);
  }
  return printVerdict("mutation-arid", {
    verdict: EXIT.clean,
    denominators: { scoredDenominator: { value: census.scoredDenominator, refuseWhen: "zero" } },
    pairs: [
      ["report", census.reportPath],
      ["ignored", census.ignored],
      ["scoredDenominator", census.scoredDenominator],
      ["reasons", census.byReason.length],
    ],
  });
}

await runTool(main);
