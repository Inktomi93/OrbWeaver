// The stage's GIT primitives: repo root, ref resolution, and the detached-worktree lifecycle. Split out of
// ops/stage.ts when the ref pre-check for design-audit's `--ref` (#678) pushed that file past the tooling
// line cap — the same decomposition ops/stage-marker.ts (marker I/O) and ops/stage-probe.ts (process
// probes) already follow: ops/stage.ts keeps the ORCHESTRATION, its I/O primitives sit beside it by nature.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execGit, runGit } from "../../_shared/git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export function repoRoot(): string {
  return execGit(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
}

/** Resolve a ref (branch/tag/sha/HEAD) to a full COMMIT sha, or null when git cannot name one from this
 *  checkout. The caller-facing pre-check (exported through snap's front door, #678): a sibling tool that
 *  takes a `--ref` from an operator can refuse a typo as CLI MISUSE — before any worktree/install/boot
 *  work — instead of meeting it as a mid-boot stage error or, worse, silently serving the dev stack.
 *  The `^{commit}` peel is deliberate: a stage is a worktree AT A COMMIT, so a ref that names some other
 *  object (a tree, a blob) is no more usable than one that names nothing. */
export function tryResolveRef(ref: string, root: string = repoRoot()): string | null {
  const res = runGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  const sha = res.stdout.trim();
  return res.status === 0 && sha !== "" ? sha : null;
}

/** Resolve a ref to a full commit sha. Throws (by name) on a ref this checkout cannot resolve. */
export function resolveRef(root: string, ref: string): string {
  const sha = tryResolveRef(ref, root);
  if (sha === null) {
    throw new Error(`git cannot resolve "${ref}" to a commit in ${root} — pass a sha/branch/tag this checkout knows`);
  }
  return sha;
}

export function worktreeExists(dir: string): boolean {
  // A linked worktree carries a `.git` FILE (a gitdir pointer), not a directory.
  return existsSync(join(dir, ".git"));
}

export function addWorktree(root: string, dir: string, sha: string): void {
  // A crashed run can leave a bare dir; `git worktree add` needs the path empty/absent.
  rmSync(dir, { recursive: true, force: true });
  runGit(root, ["worktree", "add", "--detach", dir, sha], { stdio: "inherit" });
}

export function removeWorktree(root: string, dir: string): void {
  // --force: the worktree carries gitignored node_modules/db — git refuses a "dirty" remove otherwise.
  runGit(root, ["worktree", "remove", "--force", dir], { stdio: "inherit" });
  runGit(root, ["worktree", "prune"], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}
