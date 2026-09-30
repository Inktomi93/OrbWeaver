// Worktree cleanup releases only its own Snap stage before the caller removes its checkout.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";

const HOOK = fileURLToPath(new URL("../../.claude/hooks/worktree-remove.sh", import.meta.url));

/** A throwaway git repo with the layout the hook expects, plus a `pnpm` shim that records its argv instead
 *  of running anything. Returns the repo root and where the shim writes. */
function plantRepo(scratch: string, teardownExit = 0): { readonly repo: string; readonly shimLog: string; readonly bin: string } {
  const repo = join(scratch, "repo");
  const bin = join(scratch, "bin");
  const shimLog = join(scratch, "pnpm-argv.txt");
  mkdirSync(join(repo, ".claude", "worktrees"), { recursive: true });
  mkdirSync(join(repo, ".cache", "snap-stage"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  copyFileSync(fileURLToPath(new URL("../../scripts/worktree-cleanup.sh", import.meta.url)), join(repo, "scripts/worktree-cleanup.sh"));
  writeFileSync(join(bin, "pnpm"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${shimLog}'\nexit ${String(teardownExit)}\n`, { mode: 0o755 });
  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "probe@example.com"],
    ["config", "user.name", "probe"],
  ]) {
    execFixtureGit(repo, args);
  }
  writeFileSync(join(repo, "README.md"), "probe\n");
  execFixtureGit(repo, ["add", "README.md"]);
  execFixtureGit(repo, ["commit", "-qm", "probe base"]);
  return { repo, shimLog, bin };
}

/** The harness's WorktreeRemove stdin. Computed keys because the wire vocabulary is the HARNESS's
 *  snake_case, not ours — spelling them as identifiers would just buy a naming suppression. */
function hookPayload(worktree: string): string {
  return JSON.stringify({ ["worktree_path"]: worktree, cwd: worktree, ["hook_event_name"]: "WorktreeRemove" });
}

/** Add a worktree, write a band row owned by `owner`, run the hook over that worktree. */
function removeWorktree(planted: { readonly repo: string; readonly bin: string }, name: string, owner: (worktree: string) => string): string {
  const worktree = join(planted.repo, ".claude", "worktrees", name);
  execFixtureGit(planted.repo, ["worktree", "add", "-q", "-b", `wt/${name}`, worktree]);
  const row = { band: 0, checkout: owner(worktree), dir: join(owner(worktree), ".cache", "snap-stage", "x") };
  writeFileSync(join(planted.repo, ".cache", "snap-stage", "bands.json"), `${JSON.stringify({ v: 1, rows: [row] })}\n`);
  const payload = hookPayload(worktree);
  runNicedSync("bash", ["-c", `printf '%s' '${payload}' | PATH="${planted.bin}:$PATH" bash ${HOOK}`]);
  return worktree;
}

test("removing a worktree that OWNS a stage band tears the stage down through snap's own door first", ({ scratch }) => {
  const planted = plantRepo(scratch);
  const worktree = removeWorktree(planted, "owned", (wt) => wt);

  const invocations = existsSync(planted.shimLog) ? readFileSync(planted.shimLog, "utf8").trim().split("\n") : [];
  expect(invocations, "the hook must invoke exactly one stage teardown for the worktree it is removing").toHaveLength(1);
  expect(invocations[0], "snap's OWN teardown door, scoped to this checkout, never a raw kill").toBe(`snap --stage-down --stage-owner ${worktree} --force`);
  expect(existsSync(worktree)).toBe(false);
});

test("failed stage teardown preserves the checkout and its branch", ({ scratch }) => {
  const planted = plantRepo(scratch, 1);
  const worktree = removeWorktree(planted, "failed", (wt) => wt);
  expect(existsSync(worktree)).toBe(true);
  expect(execFixtureGit(planted.repo, ["rev-parse", "--verify", "refs/heads/wt/failed"]).trim()).not.toBe("");
});

test("Codex cleanup releases an external detached worktree without removing it", ({ scratch }) => {
  const planted = plantRepo(scratch);
  const worktree = join(scratch, "codex worktree");
  execFixtureGit(planted.repo, ["worktree", "add", "-q", "--detach", worktree]);
  writeFileSync(join(planted.repo, ".cache", "snap-stage", "bands.json"), JSON.stringify({ rows: [{ checkout: worktree }] }));
  runNicedSync("bash", ["-c", `PATH='${planted.bin}':"$PATH" bash '${planted.repo}/scripts/worktree-cleanup.sh'`], { cwd: worktree });
  expect(readFileSync(planted.shimLog, "utf8").trim()).toBe(`snap --stage-down --stage-owner ${worktree} --force`);
  expect(existsSync(join(worktree, ".git"))).toBe(true);
});

test("a band owned by a SIBLING checkout is left completely alone", ({ scratch }) => {
  const planted = plantRepo(scratch);
  const worktree = removeWorktree(planted, "foreign", () => "/some/other/checkout");

  expect(existsSync(planted.shimLog), "no row names this worktree, so nothing may be torn down").toBe(false);
  expect(existsSync(worktree)).toBe(false);
});

test("no band table at all is an ordinary state, not a failure", ({ scratch }) => {
  const planted = plantRepo(scratch);
  const worktree = join(planted.repo, ".claude", "worktrees", "no-table");
  execFixtureGit(planted.repo, ["worktree", "add", "-q", "-b", "wt/no-table", worktree]);
  rmSync(join(planted.repo, ".cache", "snap-stage", "bands.json"), { force: true });
  const payload = hookPayload(worktree);
  runNicedSync("bash", ["-c", `printf '%s' '${payload}' | PATH="${planted.bin}:$PATH" bash ${HOOK}`]);

  expect(existsSync(planted.shimLog), "a box that has never staged anything spawns nothing").toBe(false);
  expect(existsSync(worktree)).toBe(false);
});

test("teardown preserves commits that have not reached the main checkout", ({ scratch }) => {
  const planted = plantRepo(scratch);
  const worktree = join(planted.repo, ".claude/worktrees/unmerged");
  execFixtureGit(planted.repo, ["worktree", "add", "-q", "-b", "wt/unmerged", worktree]);
  writeFileSync(join(worktree, "README.md"), "unmerged work\n");
  execFixtureGit(worktree, ["add", "README.md"]);
  execFixtureGit(worktree, ["commit", "-qm", "unmerged work"]);
  const tip = execFixtureGit(worktree, ["rev-parse", "HEAD"]).trim();
  runNicedSync("bash", ["-c", `printf '%s' '${hookPayload(worktree)}' | bash '${HOOK}'`]);
  expect(existsSync(worktree)).toBe(false);
  expect(execFixtureGit(planted.repo, ["rev-parse", "--verify", "refs/heads/wt/unmerged"]).trim()).toBe(tip);
});
