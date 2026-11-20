// `pnpm lint:eslint:changed` hands ESLint exactly the files the checkout changed against its merge base with main.
// Each case runs scripts/lint-changed.ts in a planted repository; `npm_execpath` points the script's own pnpm door at
// a recorder, so the case reads the argv `pnpm lint:eslint` would have received.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { PNPM_EXECPATH_ENV } from "@orb/tooling/floor/host/platform";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

const SCRIPT = fileURLToPath(new URL("../../scripts/lint-changed.ts", import.meta.url));
const RECORDER_EXIT_ENV = "LINT_CHANGED_RECORDER_EXIT";

interface Planted {
  readonly repo: string;
  readonly recorder: string;
  readonly argvLog: string;
}

function write(repo: string, path: string, text: string): void {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function commitAll(repo: string, message: string): void {
  execFixtureGit(repo, ["add", "-A"]);
  execFixtureGit(repo, ["commit", "-qm", message]);
}

// A main branch with tracked sources, and a pnpm recorder that writes its argv as JSON and exits as told.
function plant(scratch: string): Planted {
  const repo = join(scratch, "repo");
  const argvLog = join(scratch, "argv.json");
  const recorder = join(scratch, "pnpm-recorder.cjs");
  writeFileSync(
    recorder,
    `require("node:fs").writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)));\nprocess.exitCode = Number(process.env.${RECORDER_EXIT_ENV} ?? "0");\n`,
  );
  mkdirSync(repo, { recursive: true });
  execFixtureGit(repo, ["init", "-q", "-b", "main"]);
  execFixtureGit(repo, ["config", "user.email", "probe@example.com"]);
  execFixtureGit(repo, ["config", "user.name", "probe"]);
  write(repo, ".gitignore", "ignored/\n");
  for (const path of ["src/kept.ts", "src/edited.ts", "src/removed.ts", "src/moved.ts", "src/staged.ts", "src/dirty.ts", "src/main-only.ts"]) {
    write(repo, path, `export const value = "${path}";\n`);
  }
  commitAll(repo, "base");
  return { repo, recorder, argvLog };
}

function runScript(planted: Planted, recorderExit = 0): { readonly status: number | null; readonly stdout: string } {
  const result = runNicedSync(process.execPath, [SCRIPT], {
    cwd: planted.repo,
    env: { ...inheritedProcessEnv(), [PNPM_EXECPATH_ENV]: planted.recorder, [RECORDER_EXIT_ENV]: String(recorderExit) },
  });
  return { status: result.status, stdout: result.stdout };
}

function recordedArgv(planted: Planted): readonly string[] {
  return JSON.parse(readFileSync(planted.argvLog, "utf8")) as string[];
}

test("committed, staged, unstaged and untracked changes since the merge base reach ESLint, and nothing else does", ({ scratch }) => {
  const planted = plant(scratch);
  const { repo } = planted;
  execFixtureGit(repo, ["checkout", "-q", "-b", "lane"]);
  write(repo, "src/edited.ts", 'export const value = "edited on the lane";\n');
  write(repo, "src/added.ts", 'export const value = "added";\n');
  write(repo, "docs/note.md", "a changed doc ESLint decides about\n");
  rmSync(join(repo, "src/removed.ts"));
  execFixtureGit(repo, ["mv", "src/moved.ts", "src/renamed.ts"]);
  commitAll(repo, "lane work");
  // Main moves on after the lane is cut; its change is not the lane's.
  execFixtureGit(repo, ["checkout", "-q", "main"]);
  write(repo, "src/main-only.ts", 'export const value = "main moved";\n');
  commitAll(repo, "main moves");
  execFixtureGit(repo, ["checkout", "-q", "lane"]);
  write(repo, "src/staged.ts", 'export const value = "staged";\n');
  execFixtureGit(repo, ["add", "src/staged.ts"]);
  write(repo, "src/dirty.ts", 'export const value = "unstaged";\n');
  write(repo, "src/untracked.ts", 'export const value = "untracked";\n');
  write(repo, "ignored/generated.ts", 'export const value = "ignored";\n');

  const run = runScript(planted);

  expect(run.status).toBe(0);
  expect(run.stdout).toContain("lint-changed: 7 files changed against main");
  expect(recordedArgv(planted)).toEqual([
    "lint:eslint",
    "--no-warn-ignored",
    "docs/note.md",
    "src/added.ts",
    "src/dirty.ts",
    "src/edited.ts",
    "src/renamed.ts",
    "src/staged.ts",
    "src/untracked.ts",
  ]);
});

test("an ESLint failure fails the run", ({ scratch }) => {
  const planted = plant(scratch);
  execFixtureGit(planted.repo, ["checkout", "-q", "-b", "lane"]);
  write(planted.repo, "src/edited.ts", 'export const value = "edited";\n');

  const run = runScript(planted, 1);

  expect(recordedArgv(planted)).toEqual(["lint:eslint", "--no-warn-ignored", "src/edited.ts"]);
  expect(run.status).toBe(1);
});

test("a branch with no change runs no ESLint, which would otherwise lint the whole tree", ({ scratch }) => {
  const planted = plant(scratch);
  execFixtureGit(planted.repo, ["checkout", "-q", "-b", "lane"]);

  const run = runScript(planted);

  expect(run.status).toBe(0);
  expect(run.stdout).toContain("lint-changed: 0 files changed against main");
  expect(() => readFileSync(planted.argvLog, "utf8")).toThrow(/ENOENT/u);
});
