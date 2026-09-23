// agent-sync — regenerate (or verify) the Codex mirror of the Claude role fleet. Argv parse + dispatch
// ONLY (the five-slot cap); the programmatic surface is ./index.ts.
//
//   pnpm agents:sync            rewrite .codex/agents/*.toml
//   pnpm check:agents           (--check) report staleness and instruction-layer problems, write nothing
//
// Exit: 0 clean · 1 the mirror is stale (--check) · 2 the tool broke · 3 misuse.
import process from "node:process";
import { print, REPO_ROOT } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { warn } from "../_shared/log.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import {
  ALWAYS_ON_LINE_BUDGET,
  alwaysOnLines,
  codexAgentSyncProblems,
  codexRoleCount,
  instructionFileCount,
  instructionLayerProblems,
  syncCodexAgents,
} from "./index.ts";

const USAGE = "usage: pnpm agents:sync [--check]";

function main(): number {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) {
    throw new UsageError(USAGE);
  }
  if (args[0] === "--check") {
    const fileCount = instructionFileCount(REPO_ROOT);
    if (fileCount === 0) {
      throw new Error("the instruction-layer walk found no files; the check cannot measure");
    }
    const problems = [...codexAgentSyncProblems(), ...instructionLayerProblems(REPO_ROOT)];
    if (problems.length > 0) {
      for (const problem of problems) {
        warn(problem);
      }
      return EXIT.violations;
    }
    print(`checked ${codexRoleCount()} Codex agent manifests: current`);
    print(`checked ${fileCount} instruction files; always-on text is ${alwaysOnLines(REPO_ROOT).total} lines (budget: under ${ALWAYS_ON_LINE_BUDGET})`);
    return EXIT.clean;
  }
  const roles = syncCodexAgents();
  print(`synced ${roles} Claude roles and the shared skill tree`);
  return EXIT.clean;
}

await runTool(main);
