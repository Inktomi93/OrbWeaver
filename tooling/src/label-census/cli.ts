// label-census — argv parse and print only; the census is ./index.ts.
//
//   pnpm label-census [--feature=<prefix>] [--json=<path>]
//
// Prints the per-feature, per-class table. `--feature` keeps rows whose feature starts with the prefix, such as
// `client/src/features/chat` or `client/components`. `--json` also writes every row, sorted, to that path.
// Exit: 0 answered · 2 the tool broke · 3 misuse.
import { writeFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";
import { print } from "../floor/artifacts/artifacts.ts";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { runTool } from "../floor/cli/run-tool.ts";
import { formatCensus, inFeature, runCensus } from "./index.ts";

function main(): number {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { feature: { type: "string" }, json: { type: "string" } } });
  // The pnpm script runs at the workspace root, so the census reads the checkout it was run in.
  const rows = inFeature(runCensus(process.cwd()), values.feature);
  if (values.json !== undefined) {
    writeFileSync(values.json, `${JSON.stringify(rows, null, 1)}\n`);
  }
  print(formatCensus(rows));
  return EXIT.clean;
}

await runTool(main);
