import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { expect, test } from "../support/tool-fixtures.ts";

const HOOK_REL = ".claude/hooks/codegraph-project.mjs";

function git(cwd: string, ...args: string[]): void {
  execFixtureGit(cwd, ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args]);
}

function plantRepo(scratch: string, repoRoot: string): { main: string; worktree: string; hook: string } {
  const main = join(scratch, "project main");
  const worktree = join(scratch, "external worktree");
  const hooks = join(main, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  copyFileSync(join(repoRoot, HOOK_REL), join(hooks, "codegraph-project.mjs"));
  mkdirSync(join(main, ".codegraph"));
  writeFileSync(join(main, ".codegraph", "codegraph.db"), "index");
  writeFileSync(join(main, "package.json"), "{}\n");
  git(main, "init", "--quiet");
  git(main, "config", "user.email", "test@orb.local");
  git(main, "config", "user.name", "orb test");
  git(main, "add", ".");
  git(main, "commit", "--quiet", "-m", "fixture");
  git(main, "worktree", "add", "--quiet", "-b", "external", worktree);
  return { main, worktree, hook: join(hooks, "codegraph-project.mjs") };
}

function runHook(hook: string, cwd: string, toolInput: object = {}, toolName = "mcp__codegraph__codegraph_explore"): string {
  const payload = Object.fromEntries([
    ["hook_event_name", "PreToolUse"],
    ["tool_name", toolName],
    ["cwd", cwd],
    ["tool_input", toolInput],
  ]);
  const run = spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  return String(run.stdout);
}

function updatedPath(output: string): string {
  const result = JSON.parse(output) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; updatedInput: { projectPath: string } } };
  expect(result.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(result.hookSpecificOutput.permissionDecision).toBe("allow");
  return result.hookSpecificOutput.updatedInput.projectPath;
}

function deniedReason(output: string): string {
  const result = JSON.parse(output) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
  expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
  return result.hookSpecificOutput.permissionDecisionReason;
}

test("registered external worktree and nested cwd receive their own indexed projectPath", ({ scratch, repoRoot }) => {
  const repo = plantRepo(scratch, repoRoot);
  const nested = join(repo.worktree, "nested", "dir");
  mkdirSync(nested, { recursive: true });
  expect(updatedPath(runHook(repo.hook, repo.worktree, { query: "subject" }))).toBe(realpathSync(repo.worktree));
  expect(updatedPath(runHook(repo.hook, nested, { query: "subject" }))).toBe(realpathSync(repo.worktree));
  expect(updatedPath(runHook(join(repo.worktree, HOOK_REL), nested, { query: "subject" }))).toBe(realpathSync(repo.worktree));
});

test("main checkout and explicitly supplied projectPath remain untouched", ({ scratch, repoRoot }) => {
  const repo = plantRepo(scratch, repoRoot);
  expect(runHook(repo.hook, repo.main)).toBe("");
  expect(runHook(repo.hook, repo.worktree, { projectPath: repo.main })).toBe("");
  expect(runHook(repo.hook, repo.worktree, { projectPath: null })).toBe("");
});

test("missing index is refused, while foreign repo and unrelated tools receive no blanket allow", ({ scratch, repoRoot }) => {
  const trusted = plantRepo(join(scratch, "trusted"), repoRoot);
  const foreign = plantRepo(join(scratch, "foreign"), repoRoot);
  expect(runHook(trusted.hook, foreign.worktree)).toBe("");
  const disguised = join(trusted.main, ".claude", "worktrees", "rogue");
  mkdirSync(join(disguised, ".codegraph"), { recursive: true });
  writeFileSync(join(disguised, ".codegraph", "codegraph.db"), "foreign index");
  git(disguised, "init", "--quiet");
  expect(runHook(trusted.hook, disguised), "an independent repo beneath the old path prefix is foreign").toBe("");
  expect(runHook(trusted.hook, trusted.worktree, {}, "mcp__other__read")).toBe("");
  expect(runHook(trusted.hook, trusted.worktree, {}, "mcp__codegraph__control")).toBe("");
  unlinkSync(join(trusted.worktree, ".codegraph", "codegraph.db"));
  expect(deniedReason(runHook(trusted.hook, trusted.worktree))).toContain("CodeGraph index is unavailable");
});

test("canonical worktree path is emitted and an index symlink escaping the checkout is refused", ({ scratch, repoRoot }) => {
  const repo = plantRepo(scratch, repoRoot);
  const alias = join(scratch, "worktree alias");
  symlinkSync(repo.worktree, alias);
  expect(updatedPath(runHook(repo.hook, alias))).toBe(realpathSync(repo.worktree));

  const outside = join(scratch, "outside.db");
  writeFileSync(outside, "foreign index");
  unlinkSync(join(repo.worktree, ".codegraph", "codegraph.db"));
  symlinkSync(outside, join(repo.worktree, ".codegraph", "codegraph.db"));
  expect(deniedReason(runHook(repo.hook, repo.worktree))).toContain("CodeGraph index is unavailable");
});
