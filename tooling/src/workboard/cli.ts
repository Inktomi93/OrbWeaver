// workboard — the Project 1 operator CLI (`pnpm work:item`). Argv parse + dispatch ONLY (the five-slot
// cap); the programmatic surface is ./index.ts.
//
// Exit: 0 clean · 2 the operation could not be performed (a guard refusal, a GitHub failure, a rate
// limit) · 3 misuse (a malformed command). A refusal is reported as ONE operator-readable line, never a
// stack: the message IS the instruction ("wait for the reset and rerun", "set Area before Ready").
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { warn } from "../_shared/log.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { parseWorkCommand, runWorkCommand } from "./index.ts";

function main(): number {
  const command = parseWorkCommand(process.argv.slice(2));
  try {
    runWorkCommand(command);
  } catch (error) {
    if (error instanceof UsageError) {
      throw error;
    }
    warn(error instanceof Error ? error.message : String(error));
    return EXIT.toolError;
  }
  return EXIT.clean;
}

await runTool(main);
