// agent-sync — regenerate (or verify) the Codex mirror of the Claude role fleet. Argv parse + dispatch
// ONLY (the five-slot cap); the programmatic surface is ./index.ts.
//
//   pnpm agents:sync            rewrite .codex/agents/*.toml + AGENTS.md's rule-guidance block
//   pnpm check:agents           (--check) report staleness, write nothing
//
// Exit: 0 clean · 1 the mirror is stale (--check) · 2 the tool broke · 3 misuse.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { warn } from "../_shared/log.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { codexAgentSyncProblems, codexRoleCount, syncCodexAgents } from "./index.ts";

const USAGE = "usage: pnpm agents:sync [--check]";

function main(): number {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) {
    throw new UsageError(USAGE);
  }
  if (args[0] === "--check") {
    const problems = codexAgentSyncProblems();
    if (problems.length > 0) {
      for (const problem of problems) {
        warn(problem);
      }
      return EXIT.violations;
    }
    print(`checked ${codexRoleCount()} Codex agent manifests: current`);
    return EXIT.clean;
  }
  const counts = syncCodexAgents();
  print(`synced ${counts.roles} Claude roles, ${counts.rules} rule guidance entries, and the shared skill tree`);
  return EXIT.clean;
}

await runTool(main);
