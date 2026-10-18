// The process boundary the edit-hook suites drive: a real temporary repository, the hook spawned with a
// stub `pnpm` on PATH, and the reader for the advisory context it prints.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/floor/host/host-slots";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

export const HOOK_REL = ".claude/hooks/biome-check.mjs";
export const CODEX_HOOK_REL = ".claude/hooks/codex-edit-advisory.mjs";

export function git(cwd: string, ...args: string[]): void {
  execFixtureGit(cwd, ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args]);
}

export function plantCheckout(scratch: string): { readonly main: string; readonly worktree: string } {
  const main = join(scratch, "main checkout");
  const worktree = join(scratch, "linked worktree");
  mkdirSync(join(main, "tests", "client"), { recursive: true });
  writeFileSync(join(main, "package.json"), '{"name":"fixture","private":true}\n');
  writeFileSync(join(main, ".dependency-cruiser.cjs"), "module.exports = {};\n");
  writeFileSync(join(main, "tests", "client", "subject.dom.test.ts"), "export const subject = true;\n");
  git(main, "init", "--quiet");
  git(main, "config", "user.email", "test@orb.local");
  git(main, "config", "user.name", "orb test");
  git(main, "add", ".");
  git(main, "commit", "--quiet", "-m", "fixture");
  git(main, "worktree", "add", "--quiet", "-b", "fixture-worktree", worktree);
  return { main, worktree };
}

export interface HookRun {
  readonly hook: string;
  readonly project: string;
  readonly cwd: string;
  readonly file: string;
  readonly bin: string;
  readonly log: string;
  readonly runtime: string;
  readonly mode?: string;
  readonly tsFile?: string;
  readonly path?: string;
  readonly rawInput?: string;
}

export function runHook(input: HookRun): ReturnType<typeof spawnSync> {
  mkdirSync(input.runtime, { recursive: true, mode: 0o700 });
  chmodSync(input.runtime, 0o700);
  const payload = JSON.stringify(
    Object.fromEntries([
      ["hook_event_name", "PostToolUse"],
      ["tool_name", "Edit"],
      ["cwd", input.cwd],
      ["tool_input", Object.fromEntries([["file_path", input.file]])],
    ]),
  );
  return spawnSync(process.execPath, [input.hook], {
    encoding: "utf8",
    input: input.rawInput ?? payload,
    env: {
      ...inheritedProcessEnv({}),
      ...Object.fromEntries([
        ["PATH", input.path ?? `${input.bin}:/usr/bin:/bin`],
        ["CLAUDE_PROJECT_DIR", input.project],
        [HOST_POOL_ROOT_ENV, input.runtime],
        ["HOOK_TEST_LOG", input.log],
        ["HOOK_TEST_MODE", input.mode ?? ""],
        ["HOOK_TEST_TS_FILE", input.tsFile ?? ""],
      ]),
    },
  });
}

export function hookPayload(entries: readonly (readonly [string, unknown])[]): string {
  return JSON.stringify(Object.fromEntries(entries));
}

/** The advisory hook's whole report: exit 0, nothing on stderr, and one PostToolUse context led by the
 *  `edit-check:` warning line. */
export function findings(result: ReturnType<typeof spawnSync>): string {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const output = JSON.parse(String(result.stdout)) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(output.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  expect(output.hookSpecificOutput.additionalContext).toMatch(/^edit-check: /u);
  return output.hookSpecificOutput.additionalContext;
}

export function installCodexAdapter(worktree: string, repoRoot: string): string {
  const hooks = join(worktree, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  const adapter = join(hooks, "codex-edit-advisory.mjs");
  writeFileSync(adapter, readFileSync(join(repoRoot, CODEX_HOOK_REL)));
  symlinkSync(join(repoRoot, HOOK_REL), join(hooks, "biome-check.mjs"));
  return adapter;
}

export function codexPayload(cwd: string, command: string, toolResponse: unknown = "Success. Updated the following files:"): string {
  return hookPayload([
    ["hook_event_name", "PostToolUse"],
    ["tool_name", "apply_patch"],
    ["cwd", cwd],
    ["tool_input", { command }],
    ["tool_response", toolResponse],
  ]);
}

export function codexContext(result: ReturnType<typeof spawnSync>): string {
  const output = JSON.parse(String(result.stdout)) as { hookSpecificOutput: { additionalContext: string } };
  return output.hookSpecificOutput.additionalContext;
}
