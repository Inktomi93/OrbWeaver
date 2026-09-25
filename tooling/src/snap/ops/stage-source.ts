// POPULATING A STAGE DIR — the source and the data, one command family, split out of ops/stage.ts when the
// band table pushed it past the tooling line cap (docs/law/Core-Tooling-Law.md §4.3). Nothing here
// allocates, boots, probes or judges: it puts a tree (a `git worktree` for a ref, an rsync for `--dirty`),
// its node_modules, its own db and its assets on disk, and takes them away again.
//
// VERSION TRIPWIRE: a ref whose vite.config lacks VITE_API_TARGET would proxy /api to the DEV server —
// rejected up front via `git show`, before any worktree/install/boot work, so a bad ref costs nothing.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { localPath } from "@orb/db";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { DB_FILE_NAME, DEFAULT_DATA_DIR, resolveDataLayout, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execGit, runGit } from "../../_shared/git.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { StageDbProvenance, StagePaths, StageRow } from "../contract/stage.ts";
import { DIRTY_STAGE_KEY, ISOLATION_TRIPWIRE, shortSha } from "../lib/stage-plan.ts";
import { addWorktree, removeWorktree, worktreeExists } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Reject a ref whose vite.config predates the VITE_API_TARGET hook — read straight from git, BEFORE any
 *  worktree/install work, so a bad ref costs nothing and never boots a stage that proxies to the dev server. */
function assertRefSupportsIsolation(root: string, sha: string): void {
  const res = runGit(root, ["show", `${sha}:packages/client/vite.config.ts`]);
  if (res.status !== 0 || !res.stdout.includes(ISOLATION_TRIPWIRE)) {
    throw new Error(
      `stage ref ${shortSha(sha)} predates snap --isolated support — its packages/client/vite.config.ts lacks ` +
        `the ${ISOLATION_TRIPWIRE} env hook, so vite would proxy /api to the DEV server (isolation broken). ` +
        "Use a ref at or after the commit that added isolated serving.",
    );
  }
}

/** Reject a dirty stage when the WORKING TREE's vite.config predates the VITE_API_TARGET hook — read the
 *  file straight off disk (no git — that's the whole point of `--dirty`), mirroring
 *  `assertRefSupportsIsolation`'s ref-side check. */
function assertDirtyTreeSupportsIsolation(root: string): void {
  const p = join(root, "packages", "client", "vite.config.ts");
  const content = existsSync(p) ? readFileSync(p, "utf8") : "";
  if (!content.includes(ISOLATION_TRIPWIRE)) {
    throw new Error(
      `the working tree's packages/client/vite.config.ts lacks the ${ISOLATION_TRIPWIRE} env hook, so vite ` +
        "would proxy /api to the DEV server (isolation broken). Update to a tree at or after the commit that " +
        "added isolated serving.",
    );
  }
}

/** Reject an unsupported ref/tree before spending any sync/install/boot work. */
export function assertStageSourceSupportsIsolation(root: string, dirty: boolean, targetSha: string): void {
  if (dirty) {
    assertDirtyTreeSupportsIsolation(root);
  } else {
    assertRefSupportsIsolation(root, targetSha);
  }
}

/** rsync the CURRENT working tree (tracked + modified + untracked, `.gitignore`-filtered) into the dirty
 *  stage dir. The file LIST comes from `git ls-files` (not a naive rsync `.gitignore` filter merge — git's
 *  `!re-include` negation lines, a re-include under an otherwise-ignored directory, are NOT
 *  rsync filter syntax and get silently mis-parsed as excludes, which dropped real tracked source the first
 *  time this ran). `--delete-missing-args` removes a stage file whose source entry was deleted from the
 *  tree (a plain rename/delete); the stage's OWN gitignored node_modules/db/assets are never in the list, so
 *  they're never candidates for deletion either. Idempotent + cheap: safe to call on every `--dirty` call. */
export function syncDirtyTree(root: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const manifest = execGit(root, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  const manifestPath = join(dir, ".rsync-manifest.txt");
  writeFileSync(manifestPath, manifest);
  const res = runNicedSync("rsync", ["-a", "--delete-missing-args", "--files-from", manifestPath, `${root}/`, `${dir}/`], { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`rsync of the working tree into dirty stage ${dir} failed`);
  }
}

export function pnpmInstall(dir: string): void {
  const res = runNicedSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd: dir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`pnpm install failed in stage worktree ${dir}`);
  }
}

/** The dev checkout's data root: the server's default under the repo root. */
function devDataLayout(root: string): DataLayout {
  return resolveDataLayout({ ["DATA_DIR"]: join(root, DEFAULT_DATA_DIR) });
}

/** Give the stage its OWN db (best-effort copy of the dev db so real data renders — isolated), the two
 *  generated boot secrets the copied rows are bound to (a copy of the db without its keys refuses to boot
 *  or serves 503 forever), and assets (symlink to the content-addressed dev blob dir; a visual pass only
 *  reads). Idempotent: skips whatever already exists so a plain reboot keeps the stage's state.
 *
 *  A dev data dir still in the LEGACY flat shape (the db at its root) is copied from NOT AT ALL and said so:
 *  the dev stack's next boot moves it, and a stage built before that would boot empty and say nothing.
 *
 *  Returns the copy's PROVENANCE (§3.6's `dbProvenance` row field), or null when nothing was copied: the
 *  band table then answers "is this stage's data older than the dev db it came from?" from the row instead
 *  of a second probe, which is the question behind every "why does the stage show stale rows" round trip
 *  (memory `isolated-stage-db-is-a-fresh-dev-copy`). */
export function seedStageData(root: string, paths: StagePaths): StageDbProvenance | null {
  mkdirSync(paths.dir, { recursive: true });
  const dev = devDataLayout(root);
  const devDb = localPath(dev.databaseUrl) ?? "";
  const legacyDevDb = join(dev.root, DB_FILE_NAME);
  if (!existsSync(devDb) && existsSync(legacyDevDb)) {
    print(
      `[snap-stage] the dev data dir is in the legacy layout (${legacyDevDb} at the root) — copying nothing; boot the dev stack once to migrate it, then rebuild the stage`,
    );
    return null;
  }
  const provenance = copyStageDb(devDb, localPath(paths.databaseUrl) ?? "");
  copyStageSecrets(dev.secrets, paths.secretsDir);
  linkStageAssets(dev.assets, paths.assetsDir);
  return provenance;
}

function copyStageDb(devDb: string, stageDb: string): StageDbProvenance | null {
  if (!existsSync(devDb) || existsSync(stageDb)) {
    return null;
  }
  const provenance = { copiedFrom: devDb, copiedAt: new Date().toISOString(), devDbMtimeAtCopy: statSync(devDb).mtime.toISOString() };
  mkdirSync(dirname(stageDb), { recursive: true });
  // Copy the WAL/SHM sidecars too for a consistent-enough snapshot of in-flight writes.
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(devDb + suffix)) {
      cpSync(devDb + suffix, stageDb + suffix);
    }
  }
  return provenance;
}

function copyStageSecrets(devSecrets: string, stageSecrets: string): void {
  for (const name of Object.values(SECRET_FILE_NAMES)) {
    const devSecret = join(devSecrets, name);
    const stageSecret = join(stageSecrets, name);
    if (existsSync(devSecret) && !existsSync(stageSecret)) {
      mkdirSync(stageSecrets, { recursive: true });
      cpSync(devSecret, stageSecret);
    }
  }
}

function linkStageAssets(devAssets: string, stageAssets: string): void {
  if (!existsSync(devAssets) || existsSync(stageAssets)) {
    return;
  }
  mkdirSync(dirname(stageAssets), { recursive: true });
  // @orb-waive caught-failure-ownership(catch): documented degraded-but-non-fatal floor — the stage renders without avatars/cards rather than aborting the stage build, per the trailing comment. Ends if a caller starts requiring assetsDir to exist.
  try {
    symlinkSync(devAssets, stageAssets, "dir");
  } catch {
    // No symlink (e.g. permissions) ⇒ the stage renders without avatars/cards rather than aborting.
  }
}

/** Populate the stage dir's SOURCE (rsync for `--dirty`, `git worktree add` for a real ref) — the caller
 *  has already handled staleness teardown. */
export function prepareStageSource(
  root: string,
  paths: StagePaths,
  opts: { readonly targetSha: string; readonly dirty: boolean; readonly fresh: boolean },
): void {
  if (opts.dirty) {
    if (opts.fresh) {
      rmSync(paths.dir, { recursive: true, force: true });
    }
    print(`[snap-stage] syncing working tree → ${paths.dir}`);
    syncDirtyTree(root, paths.dir);
    return;
  }
  if (opts.fresh && worktreeExists(paths.dir)) {
    removeWorktree(root, paths.dir);
  }
  if (!worktreeExists(paths.dir)) {
    print(`[snap-stage] creating detached worktree ${shortSha(opts.targetSha)} → ${paths.dir}`);
    addWorktree(root, paths.dir, opts.targetSha);
  }
}

/** Remove a stage dir by its kind: a real ref is a `git worktree` (needs `git worktree remove`); the
 *  `--dirty` stage is a plain rsync'd directory (a bare `rmSync` suffices — no git bookkeeping to free). */
export function removeStageDir(root: string, stage: Pick<StageRow, "sha" | "dir">): void {
  if (stage.sha === DIRTY_STAGE_KEY) {
    rmSync(stage.dir, { recursive: true, force: true });
  } else {
    removeWorktree(root, stage.dir);
  }
}
