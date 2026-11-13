// label-census — argv parse and print only; the census is ./index.ts.
//
//   pnpm label-census [--feature=<prefix>] [--json=<path>]
//
// Prints the per-feature, per-class site table, then the per-feature count of oracle candidates by kind: label
// functions whose name varies, called where an assertion reads a name. Then each branching candidate no row of
// `judged-oracles.ts` covers, and each row there that matches no candidate. `--feature` keeps rows whose feature starts
// with the prefix, such as `client/src/features/chat` or `client/components`. `--json` also writes `{ sites, oracleCalls }`,
// each sorted, to that path.
// Exit: 0 answered · 2 the tool broke · 3 misuse.
import { writeFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";
import { print } from "../floor/artifacts/artifacts.ts";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { runTool } from "../floor/cli/run-tool.ts";
import { formatCensus, formatJudgements, formatOracles, inFeature, runCensus } from "./index.ts";

function main(): number {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { feature: { type: "string" }, json: { type: "string" } } });
  // The pnpm script runs at the workspace root, so the census reads the checkout it was run in.
  const census = runCensus(process.cwd());
  const sites = inFeature(census.rows, values.feature);
  const oracleCalls = inFeature(census.oracles, values.feature);
  if (values.json !== undefined) {
    writeFileSync(values.json, `${JSON.stringify({ sites, oracleCalls }, null, 1)}\n`);
  }
  print(`${formatCensus(sites)}\n\n${formatOracles(oracleCalls)}\n\n${formatJudgements(oracleCalls, census.staleJudgements)}`);
  return EXIT.clean;
}

await runTool(main);
