// THE WorktreeRemove HOOK'S PROOF (.claude/hooks/worktree-remove.sh) — a removed worktree may not leave a
// STAGE running behind it (#1848).
//
// THE DEFECT. A `snap --isolated` stage is a ~7-process stack (the stack leader, the node server, vite, the idle
// keeper) that lives INSIDE the worktree, and the shared band table records the owning checkout. The hook
// removed the tree without ever reading that table, so a lane torn down with a live stage kept running
// against a DELETED cwd — holding a band, a port pair and real CPU — until the 60-minute idle keeper got
// to it. Seen on 2026-09-06: two bands owned by worktrees that no longer existed.
//
// THE PROOF RUNS THE REAL HOOK against a THROWAWAY repo (never main, never a real stage) with a `pnpm`
// SHIM first on PATH, so the assertion is the exact door the hook must use — `snap --stage-down
// --stage-owner <checkout> --force`, snap's own teardown, never a raw kill. Three arms, because all three
// are ways this can be wrong: it must fire for a row THIS worktree owns; it must NOT fire for a row a
// SIBLING owns (tearing down a live sibling's stage is worse than the leak); and a teardown that FAILS
// must still leave the worktree removed, or a broken stage door would strand every lane.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";

const HOOK = fileURLToPath(new URL("../../.claude/hooks/worktree-remove.sh", import.meta.url));

/** A throwaway git repo with the layout the hook expects, plus a `pnpm` shim that records its argv instead
 *  of running anything. Returns the repo root and where the shim writes. */
function plantRepo(scratch: string): { readonly repo: string; readonly shimLog: string; readonly bin: string } {
  const repo = join(scratch, "repo");
  const bin = join(scratch, "bin");
  const shimLog = join(scratch, "pnpm-argv.txt");
  mkdirSync(join(repo, ".claude", "worktrees"), { recursive: true });
  mkdirSync(join(repo, ".cache", "snap-stage"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  // The shim FAILS (exit 1) on purpose: a stage door that errors must not stop the removal.
  writeFileSync(join(bin, "pnpm"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${shimLog}\nexit 1\n`, { mode: 0o755 });
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
  // The teardown shim exited 1 — the removal must have happened anyway.
  expect(existsSync(worktree), "a failing stage teardown must never strand the worktree").toBe(false);
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
