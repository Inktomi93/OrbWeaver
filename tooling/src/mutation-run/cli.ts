// mutation-run: one lane's Stryker run over named files. Exit 0 some mutant died, 1 none died, 2 no verdict, 3 bad arguments.
// `--targets` runs the hand-maintained target list instead, one run per target, with the same exits over the whole pass.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { runMutation, runMutationTargets } from "./index.ts";

const TARGETS_FLAG = "--targets";

async function main(): Promise<number> {
  const [first, ...rest] = process.argv.slice(2);
  return first === TARGETS_FLAG ? await runMutationTargets(rest) : await runMutation(process.argv.slice(2));
}

await runTool(main);
