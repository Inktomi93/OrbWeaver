// agent-sync — regenerate (or verify) the Codex mirror of the Claude role fleet. Argv parse + dispatch
// ONLY (the five-slot cap); the programmatic surface is ./index.ts.
//
//   pnpm agents:sync            rewrite .codex/agents/*.toml
//   pnpm check:agents           (--check) report staleness, instruction-layer and docs-tree problems, write nothing
//
// Exit: 0 clean · 1 the mirror is stale or a layer has problems (--check) · 2 the tool broke · 3 misuse.
import process from "node:process";
import { print, REPO_ROOT } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { warn } from "../_shared/log.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import {
  ALWAYS_ON_LINE_BUDGET,
  alwaysOnLines,
  checkedDocCount,
  checkedLayerProblems,
  codexAgentSyncProblems,
  codexRoleCount,
  instructionFileCount,
  modelCatalogPath,
  syncCodexAgents,
} from "./index.ts";

const USAGE = "usage: pnpm agents:sync [--models <catalog-path>] | pnpm check:agents";

function syncCatalogPath(args: readonly string[]): string {
  if (args.length === 0) {
    return modelCatalogPath();
  }
  if (args.length === 2 && args[0] === "--models" && args[1]) {
    return args[1];
  }
  throw new UsageError(USAGE);
}

function main(): number {
  const args = process.argv.slice(2);
  const check = args.length === 1 && args[0] === "--check";
  if (check) {
    const fileCount = instructionFileCount(REPO_ROOT);
    if (fileCount === 0) {
      throw new Error("the instruction-layer walk found no files; the check cannot measure");
    }
    const docCount = checkedDocCount(REPO_ROOT);
    if (docCount === 0) {
      throw new Error("the docs-tree walk found no governed document; the check cannot measure");
    }
    const problems = [...codexAgentSyncProblems(), ...checkedLayerProblems(REPO_ROOT)];
    if (problems.length > 0) {
      for (const problem of problems) {
        warn(problem);
      }
      return EXIT.violations;
    }
    print(`checked ${codexRoleCount()} Codex agent manifests: current`);
    print(`checked ${fileCount} instruction files; always-on text is ${alwaysOnLines(REPO_ROOT).total} lines (budget: under ${ALWAYS_ON_LINE_BUDGET})`);
    print(`checked ${docCount} governed docs under docs/`);
    return EXIT.clean;
  }
  const catalogPath = syncCatalogPath(args);
  const result = syncCodexAgents(catalogPath);
  print(`synced ${result.roles} Claude roles and the shared skill tree`);
  print(`Codex model catalog: ${catalogPath} (fetched ${result.fetchedAt})`);
  return EXIT.clean;
}

await runTool(main);
