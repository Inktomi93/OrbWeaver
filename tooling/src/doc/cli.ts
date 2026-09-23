// doc — the docs system's structural writer (`pnpm doc`). Argv parse + dispatch ONLY (the five-slot
// cap); the programmatic surface is ./index.ts. Verbs: `pnpm doc help`.
//
// Exit: 0 clean · 1 a refusal (nothing written) · 2 the tool broke · 3 misuse.
import process from "node:process";
import { runTool } from "../_shared/run-tool.ts";
import { parseDocCommand, runDocCommand } from "./index.ts";

function main(): number {
  return runDocCommand(parseDocCommand(process.argv.slice(2)));
}

await runTool(main);
