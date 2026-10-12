// POPULATING A STAGE DIR — the source and the data, one command family, split out of ops/stage.ts when the
// band table pushed it past the tooling line cap (docs/law/Core-Tooling-Law.md §4.3). Nothing here
// allocates, boots, probes or judges: it puts a tree (a `git worktree` for a ref, an rsync for `--dirty`),
// its node_modules, its own db and its assets on disk, and takes them away again.
//
// VERSION TRIPWIRE: a ref whose vite.config lacks VITE_API_TARGET would proxy /api to the DEV server —
// rejected up front via `git show`, before any worktree/install/boot work, so a bad ref costs nothing.
import { constants, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { localPath } from "@orb/db";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { DATA_LAYOUT_DIRS, DB_FILE_NAME, DEFAULT_DATA_DIR, resolveDataLayout, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { execGit, runGit } from "../../floor/git/git.ts";
import { runNicedSync } from "../../floor/process/proc.ts";
import type { StageAuthMode, StageDbProvenance, StagePaths, StageRow } from "../contract/stage.ts";
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
 *  With `stageDb` (`--stage-db`) the stage gets a clone of that db instead (`cloneStageDb`), whatever the auth
 *  mode: a local stage's own data root is otherwise empty, and the fixture humans are seeded after its boot.
 *
 *  A dev data dir still in the LEGACY flat shape (the db at its root) is copied from NOT AT ALL and said so:
 *  the dev stack's next boot moves it, and a stage built before that would boot empty and say nothing.
 *
 *  Returns the copy's PROVENANCE (§3.6's `dbProvenance` row field), or null when nothing was copied: the
 *  band table then answers "is this stage's data older than the dev db it came from?" from the row instead
 *  of a second probe, which is the question behind every "why does the stage show stale rows" round trip
 *  (memory `isolated-stage-db-is-a-fresh-dev-copy`). */
export function seedStageData(root: string, paths: StagePaths, stageDb?: string, auth: StageAuthMode = "single-user"): StageDbProvenance | null {
  if (stageDb !== undefined) {
    return cloneStageDb(stageDb, paths);
  }
  if (auth === "local") {
    return null;
  }
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

/** Rows sealed or peppered under the SOURCE box's boot secrets. The stage boots under the stack cli's fixed dev
 *  keys, so a foreign `user_credentials` row fails the boot decrypt check and `/healthz` answers 503
 *  `credentials_key_mismatch`; that delete is the required one. The sessions, password hashes and pending
 *  invites could never be used under the dev pepper, so dropping them is cleanup. */
const SECRET_BOUND_ROWS = [
  "DELETE FROM user_credentials",
  "DELETE FROM sessions",
  "UPDATE users SET password_hash = NULL WHERE password_hash IS NOT NULL",
  "DELETE FROM chat_invites WHERE status = 'pending'",
] as const;

/** `--stage-db`: give the stage a CLONE of another box's db (the container's, say) instead of the dev db.
 *  The source and its `-wal`/`-shm` are only read. The owner row keeps its id, so every owned row still
 *  resolves; the stage's own boot renames that row onto the stage's `OWNER_HANDLES` key
 *  (`entry/boot/seed-owner.ts`), which is how the stage signs in as the owner of the copied rows.
 *  The caller has removed any older stage dir, so an existing stage db is a bug, not a cache. */
export function cloneStageDb(sourceDb: string, paths: StagePaths): StageDbProvenance {
  const source = resolve(sourceDb);
  const stageDb = localPath(paths.databaseUrl) ?? "";
  if (!(existsSync(source) && statSync(source).isFile())) {
    throw new Error(`--stage-db ${sourceDb}: no database file there`);
  }
  if (existsSync(stageDb)) {
    throw new Error(`stage db ${stageDb} already exists; --stage-db clones into a rebuilt stage only`);
  }
  mkdirSync(dirname(stageDb), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(source + suffix)) {
      cpSync(source + suffix, stageDb + suffix);
    }
  }
  const clone = new DatabaseSync(stageDb);
  try {
    for (const statement of SECRET_BOUND_ROWS) {
      clone.exec(statement);
    }
    // Fold the copied WAL into the main file so the stage opens one self-contained db.
    clone.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    clone.close();
  }
  cloneStageAssets(source, paths.assetsDir);
  return { copiedFrom: source, cloned: true, copiedAt: new Date().toISOString(), devDbMtimeAtCopy: statSync(source).mtime.toISOString() };
}

/** The owner's art lives beside the db in the server's own layout (`<root>/db/<db>` and `<root>/assets`), so a
 *  db copied out of a container with its siblings brings it along. A COPY, reflinked where the filesystem
 *  allows: the stage server writes uploads into its assets dir, and that must never reach the source. A db
 *  with no assets beside it clones without art and says so, since every avatar then answers 404. */
function cloneStageAssets(sourceDb: string, stageAssets: string): void {
  const sourceRoot = dirname(dirname(sourceDb));
  const sourceAssets = resolveDataLayout({ ["DATA_DIR"]: sourceRoot }).assets;
  if (dirname(sourceDb) !== join(sourceRoot, DATA_LAYOUT_DIRS.db) || !existsSync(sourceAssets)) {
    print(
      `[snap-stage] --stage-db: no ${DATA_LAYOUT_DIRS.assets}/ beside ${sourceDb} — the clone serves no avatars or art; copy ${DATA_LAYOUT_DIRS.assets}/ next to ${DATA_LAYOUT_DIRS.db}/`,
    );
    return;
  }
  mkdirSync(dirname(stageAssets), { recursive: true });
  cpSync(sourceAssets, stageAssets, { recursive: true, mode: constants.COPYFILE_FICLONE });
}

/** The loud line for a reused stage whose db is a `--stage-db` clone, or null for any other stage. A plain
 *  `--isolated` run on the same sha, or a sibling checkout's, otherwise reuses the clone without a word. */
export function clonedStageWarning(row: Pick<StageRow, "dbProvenance">): string | null {
  const provenance = row.dbProvenance;
  if (provenance?.cloned !== true) {
    return null;
  }
  return `[snap-stage] WARNING this stage serves a CLONE of ${provenance.copiedFrom} (--stage-db, ${provenance.copiedAt}), not the dev db; rebuild with --fresh for a dev-db stage`;
}

export function printClonedStageWarning(row: Pick<StageRow, "dbProvenance">): void {
  const warning = clonedStageWarning(row);
  if (warning !== null) {
    print(warning);
  }
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
