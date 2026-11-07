// mutation-run: one lane's Stryker run over named files. Exit 0 some mutant died, 1 none died, 2 no verdict, 3 bad arguments.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { runMutation } from "./index.ts";

async function main(): Promise<number> {
  return await runMutation(process.argv.slice(2));
}

await runTool(main);
