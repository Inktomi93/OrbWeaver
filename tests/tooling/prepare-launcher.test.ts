// The root `prepare` lifecycle script (scripts/prepare.ts): a source archive with no .git must install
// cleanly, and a checkout whose hook install fails must still fail the install.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { runGit } from "@orb/tooling/_shared/git";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../support/tool-fixtures.ts";

const PREPARE = join(process.cwd(), "scripts/prepare.ts");

/** The ambient env minus every GIT_* variable. Under a lefthook pre-commit run, GIT_DIR/GIT_INDEX_FILE point
 *  at THIS repository, and a child git that inherits them would treat the scratch dir as this repo and
 *  force-install hooks into it. */
function envWithoutGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(inheritedProcessEnv()).filter(([key]) => !key.startsWith("GIT_")));
}

function runPrepareIn(dir: string): number | null {
  return spawnSync(process.execPath, [PREPARE], { cwd: dir, env: envWithoutGit(), encoding: "utf8" }).status;
}

test("a source archive with no .git skips the hook install and exits 0", () => {
  const archive = mkdtempSync(join(tmpdir(), "orb-prepare-archive-"));
  try {
    expect(runPrepareIn(archive)).toBe(0);
    expect(existsSync(join(archive, ".git"))).toBe(false);
  } finally {
    rmSync(archive, { recursive: true, force: true });
  }
});

test("a .git that git cannot read is a real lefthook failure and stays non-zero", () => {
  // An empty .git directory is present (so the skip does not apply) but is not a repository, so
  // `lefthook install` fails exactly as it does in any broken checkout.
  const broken = mkdtempSync(join(tmpdir(), "orb-prepare-broken-"));
  try {
    mkdirSync(join(broken, ".git"));
    expect(runPrepareIn(broken)).not.toBe(0);
  } finally {
    rmSync(broken, { recursive: true, force: true });
  }
});

test("a linked worktree leaves the main checkout's shared hooks untouched", ({ scratch }) => {
  const main = join(scratch, "main");
  const lane = join(scratch, "lane");
  mkdirSync(main);
  const init = runGit(main, ["init"]);
  expect(init.status, init.stderr).toBe(0);
  const commit = runGit(main, ["-c", "user.name=Prepare test", "-c", "user.email=prepare@example.invalid", "commit", "--allow-empty", "-m", "fixture"]);
  expect(commit.status, commit.stderr).toBe(0);
  const add = runGit(main, ["worktree", "add", "--detach", lane]);
  expect(add.status, add.stderr).toBe(0);
  const hook = join(main, ".git", "hooks", "pre-commit");
  const sentinel = "#!/bin/sh\nexit 0\n";
  writeFileSync(hook, sentinel);

  expect(runPrepareIn(lane)).toBe(0);
  expect(readFileSync(hook, "utf8")).toBe(sentinel);
});
