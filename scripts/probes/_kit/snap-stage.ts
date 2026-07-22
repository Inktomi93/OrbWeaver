// ── snap-stage: the ISOLATED serving mode behind `snap --isolated` ───────────────────────────────────
//
// WHY THIS EXISTS (the one-liner recovery story): a visual pass (side-eye) run against the LIVE dev stack
// fights that stack's HMR — a concurrent lane saving mid-edit source crash-loops tsx-watch/vite under the
// reviewer, who then has to hand-build a worktree at HEAD to finish. `snap --isolated` makes that recovery
// ONE flag: it serves snaps from a DETACHED git worktree pinned at local HEAD (or `--ref <sha>`), booting a
// SECOND, fully isolated dev stack on OFFSET ports with its OWN db/data — zero collision with the dev stack,
// both run at once. The worktree is never edited, so its watchers never fire: crash-loop-immune by
// construction while keeping the dev bundle's `window.__orb` (side-eye's eval machinery) intact.
//
// LIFECYCLE (single active stage, keyed by sha — one fixed offset port pair, so it never self-collides):
//   • Stage worktree cached at .cache/snap-stage/<short-sha>/ (`.cache/` is gitignored wholesale).
//   • `pnpm install` there once — the shared pnpm store makes it cheap (hardlinks, no re-download).
//   • The stage's OWN db (a best-effort copy of the dev db, so real data renders — ISOLATED, stage writes
//     never touch dev's) + assets (symlink to the content-addressed dev blob dir; reads are safe).
//   • Boots the WORKTREE's stack.sh with offset PORT/VITE_PORT/VITE_API_TARGET/DATABASE_URL/ASSETS_DIR, and
//     stays WARM (setsid-detached) for reuse across snap calls.
//   • A new HEAD sha ⇒ the active stage is stale ⇒ rebuild (the stale one is torn down first). `--fresh`
//     forces a rebuild of the same sha. `--stage-down` stops the stack + removes the worktree.
//
// READ-ONLY BY CONVENTION: nothing edits the worktree source — it is a frozen snapshot of a commit. Only its
// gitignored node_modules/db/assets are written (install + runtime), never tracked files.
//
// VERSION TRIPWIRE: isolation depends on packages/client/vite.config.ts reading VITE_API_TARGET (added with
// this feature). A stage ref that predates it would silently proxy /api to the DEV server — so a ref lacking
// that env hook is REJECTED up front (`git show <sha>:…`), before any worktree/install/boot work.
//
// This module owns path/port/staleness DERIVATION (pure, unit-tested — tests/tooling/snap-stage.test.ts)
// plus the imperative worktree/install/boot orchestration. snap.ts wires the flags and points its base URL
// at the stage.
//
// `--dirty` (stages the WORKING TREE, not a commit): the frozen-worktree design above trades
// reviewability of uncommitted work for crash-loop immunity — a detached worktree can only ever pin a
// real commit. `--dirty` restores that reviewability WITHOUT reopening the crash-loop hole: instead of
// `git worktree add`, it rsyncs the CURRENT tracked+modified+untracked source (the file LIST comes from
// `git ls-files --cached --others --exclude-standard`, not a naive rsync `.gitignore` filter merge — git's
// `!re-include` negation lines aren't rsync filter syntax and get mis-parsed as excludes) into a FIXED stage dir
// (`.cache/snap-stage/dirty` — sha "dirty" is not a real ref, so it never collides with a commit-pinned
// stage's key) and boots the exact same `stack.sh`-driven stack. That stack still runs `tsx watch`
// (dev.sh) — but only OUR rsync ever touches those files, never a concurrent lane's live edits, so the
// watcher only restarts on a call WE made, by design. REFRESHABLE: a warm dirty stage re-syncs on every
// `--dirty` call (rsync is cheap/idempotent) without a full re-stage (worktree/install/boot skipped) —
// `tsx watch` on the stage picks up the synced diff itself. `--fresh` still forces the full rebuild.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { print } from "./result.ts";

// The canonical dev ports (mirrors stack.sh BACKEND_PORT + vite.config strictPort). The stage offsets both.
export const DEV_SERVER_PORT = 8788;
export const DEV_VITE_PORT = 5173;
// Offset both dev ports into a free band (8788→8888, 5173→5273): dodges the vLLM loopback engines
// (8701-8703, disabled in-stack) and the live dev pair. One stage runs at a time, so a single fixed offset
// never self-collides.
export const STAGE_PORT_OFFSET = 100;
// 12 hex — collision-safe for a dir name while staying human-scannable in logs.
export const SHORT_SHA_LEN = 12;
// vite.config.ts must READ this env var for the stage to isolate its /api proxy — its presence is the
// ref-supports-isolation tripwire (see the header VERSION TRIPWIRE note).
export const ISOLATION_TRIPWIRE = "VITE_API_TARGET";
// The `--dirty` stage's fixed key (stands in for a sha in stagePaths/ActiveStage) — never a real commit
// hash (all-lowercase, 5 chars, shorter than a sha's 40), so it can't collide with `shortSha` of a real ref.
export const DIRTY_STAGE_KEY = "dirty";

const STAGE_ROOT_REL = join(".cache", "snap-stage");
const ACTIVE_REL = join(STAGE_ROOT_REL, "active.json");

// ── Pure derivation (unit-tested) ────────────────────────────────────────────────────────────────────

export function shortSha(sha: string): string {
  return sha.trim().slice(0, SHORT_SHA_LEN);
}

export type StagePorts = { readonly server: number; readonly vite: number };

export function stagePorts(offset: number = STAGE_PORT_OFFSET): StagePorts {
  return { server: DEV_SERVER_PORT + offset, vite: DEV_VITE_PORT + offset };
}

/** `localhost`, NOT 127.0.0.1 — vite v8 binds [::1] only (see stack.sh vite_ok()); the IPv4 loopback
 *  never answers the dev server's vite port. */
export function stageBaseUrl(vitePort: number): string {
  return `http://localhost:${vitePort}`;
}

export type StagePaths = {
  readonly dir: string;
  readonly databaseUrl: string;
  readonly assetsDir: string;
};

export function stagePaths(root: string, sha: string): StagePaths {
  const dir = join(root, STAGE_ROOT_REL, shortSha(sha));
  return {
    dir,
    // Absolute file: URL so the stage db lives under the stage dir regardless of the server's cwd — and is
    // trivially removed on teardown with the whole dir.
    databaseUrl: `file:${join(dir, "orbweaver.db")}`,
    assetsDir: join(dir, "assets"),
  };
}

export type ActiveStage = {
  readonly sha: string;
  readonly shortSha: string;
  readonly dir: string;
  readonly serverPort: number;
  readonly vitePort: number;
  readonly baseUrl: string;
};

export type StageDecision = "reuse" | "rebuild";

/** The staleness rule: reuse a warm stage ONLY when it is the requested sha, healthy, and not forced fresh;
 *  otherwise rebuild. Pure — the imperative caller supplies `healthy`. */
export function stageDecision(opts: {
  readonly targetSha: string;
  readonly active: ActiveStage | null;
  readonly fresh: boolean;
  readonly healthy: boolean;
}): StageDecision {
  if (opts.fresh || opts.active === null || opts.active.sha !== opts.targetSha || !opts.healthy) {
    return "rebuild";
  }
  return "reuse";
}

// ── git / repo helpers ───────────────────────────────────────────────────────────────────────────────

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

/** Resolve a ref (branch/tag/sha/HEAD) to a full commit sha. Throws (git non-zero) on an unknown ref. */
export function resolveRef(root: string, ref: string): string {
  return execFileSync("git", ["rev-parse", ref], { cwd: root, encoding: "utf8" }).trim();
}

// ── active-stage state (.cache/snap-stage/active.json) ─────────────────────────────────────────────────

function activePath(root: string): string {
  return join(root, ACTIVE_REL);
}

export function readActive(root: string): ActiveStage | null {
  const p = activePath(root);
  if (!existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ActiveStage;
  } catch {
    // A truncated/garbage marker (a killed mid-write) is treated as "no active stage" → a clean rebuild.
    return null;
  }
}

function writeActive(root: string, a: ActiveStage): void {
  mkdirSync(join(root, STAGE_ROOT_REL), { recursive: true });
  writeFileSync(activePath(root), `${JSON.stringify(a, null, 2)}\n`);
}

function clearActive(root: string): void {
  rmSync(activePath(root), { force: true });
}

// ── health / version / worktree primitives ─────────────────────────────────────────────────────────────

function curlOk(url: string): boolean {
  return spawnSync("curl", ["-sf", "-m", "2", url], { stdio: "ignore" }).status === 0;
}

/** Both halves must answer: the server (healthz) AND vite (the origin snap navigates to). */
function stageHealthy(ports: StagePorts): boolean {
  return curlOk(`http://127.0.0.1:${ports.server}/healthz`) && curlOk(`${stageBaseUrl(ports.vite)}/`);
}

/** Reject a ref whose vite.config predates the VITE_API_TARGET hook — read straight from git, BEFORE any
 *  worktree/install work, so a bad ref costs nothing and never boots a stage that proxies to the dev server. */
function assertRefSupportsIsolation(root: string, sha: string): void {
  const res = spawnSync("git", ["show", `${sha}:packages/client/vite.config.ts`], { encoding: "utf8", cwd: root });
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

/** rsync the CURRENT working tree (tracked + modified + untracked, `.gitignore`-filtered) into the dirty
 *  stage dir. The file LIST comes from `git ls-files` (not a naive rsync `.gitignore` filter merge — git's
 *  `!re-include` negation lines, e.g. the memory/build re-includes on an otherwise-ignored `build/`, are NOT
 *  rsync filter syntax and get silently mis-parsed as excludes, which dropped real tracked source the first
 *  time this ran). `--delete-missing-args` removes a stage file whose source entry was deleted from the
 *  tree (a plain rename/delete); the stage's OWN gitignored node_modules/db/assets are never in the list, so
 *  they're never candidates for deletion either. Idempotent + cheap: safe to call on every `--dirty` call. */
function syncDirtyTree(root: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const manifest = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  const manifestPath = join(dir, ".rsync-manifest.txt");
  writeFileSync(manifestPath, manifest);
  const res = spawnSync("rsync", ["-a", "--delete-missing-args", "--files-from", manifestPath, `${root}/`, `${dir}/`], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    throw new Error(`rsync of the working tree into dirty stage ${dir} failed`);
  }
}

function worktreeExists(dir: string): boolean {
  // A linked worktree carries a `.git` FILE (a gitdir pointer), not a directory.
  return existsSync(join(dir, ".git"));
}

function addWorktree(root: string, dir: string, sha: string): void {
  // A crashed run can leave a bare dir; `git worktree add` needs the path empty/absent.
  rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["worktree", "add", "--detach", dir, sha], { cwd: root, stdio: "inherit" });
}

function removeWorktree(root: string, dir: string): void {
  // --force: the worktree carries gitignored node_modules/db — git refuses a "dirty" remove otherwise.
  spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: root, stdio: "inherit" });
  spawnSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}

function pnpmInstall(dir: string): void {
  const res = spawnSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd: dir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`pnpm install failed in stage worktree ${dir}`);
  }
}

/** Give the stage its OWN db (best-effort copy of the dev db so real data renders — isolated) + assets
 *  (symlink to the content-addressed dev blob dir; a visual pass only reads). Idempotent: skips whatever
 *  already exists so a plain reboot keeps the stage's state. */
function seedStageData(root: string, paths: StagePaths): void {
  mkdirSync(paths.dir, { recursive: true });
  const devDb = join(root, "data", "orbweaver.db");
  const stageDb = join(paths.dir, "orbweaver.db");
  if (existsSync(devDb) && !existsSync(stageDb)) {
    // Copy the WAL/SHM sidecars too for a consistent-enough snapshot of in-flight writes.
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(devDb + suffix)) {
        cpSync(devDb + suffix, stageDb + suffix);
      }
    }
  }
  const devAssets = join(root, "data", "assets");
  if (existsSync(devAssets) && !existsSync(paths.assetsDir)) {
    try {
      symlinkSync(devAssets, paths.assetsDir, "dir");
    } catch {
      // No symlink (e.g. permissions) ⇒ the stage renders without avatars/cards rather than aborting.
    }
  }
}

function stopStage(dir: string): void {
  const stackSh = join(dir, "scripts", "dev", "stack.sh");
  if (existsSync(stackSh)) {
    spawnSync("bash", [stackSh, "stop"], { cwd: dir, stdio: "inherit" });
  }
}

function bootStage(paths: StagePaths, ports: StagePorts): void {
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: the stage stack inherits the operator's ambient env (PATH, VLLM pins) — harness plumbing, not app config.
    ...process.env,
    PORT: String(ports.server),
    VITE_PORT: String(ports.vite),
    VITE_API_TARGET: `http://127.0.0.1:${ports.server}`,
    DATABASE_URL: paths.databaseUrl,
    ASSETS_DIR: paths.assetsDir,
    // A stray .env in the worktree must never clobber these explicit stage knobs (dotenv override:true).
    ORB_ENV_NO_OVERRIDE: "1",
  };
  const stackSh = join(paths.dir, "scripts", "dev", "stack.sh");
  const res = spawnSync("bash", [stackSh, "start"], { cwd: paths.dir, env, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`stage stack failed to boot — inspect ${join(paths.dir, ".cache", "stack")}/*.log`);
  }
}

// ── Orchestration ──────────────────────────────────────────────────────────────────────────────────────

export type EnsureStageOpts = { readonly ref?: string; readonly fresh: boolean; readonly dirty?: boolean };

/** Remove a stage dir by its kind: a real ref is a `git worktree` (needs `git worktree remove`); the
 *  `--dirty` stage is a plain rsync'd directory (a bare `rmSync` suffices — no git bookkeeping to free). */
function removeStageDir(root: string, stage: Pick<ActiveStage, "sha" | "dir">): void {
  if (stage.sha === DIRTY_STAGE_KEY) {
    rmSync(stage.dir, { recursive: true, force: true });
  } else {
    removeWorktree(root, stage.dir);
  }
}

/** Reject an unsupported ref/tree before spending any sync/install/boot work. */
function assertStageSourceSupportsIsolation(root: string, dirty: boolean, targetSha: string): void {
  if (dirty) {
    assertDirtyTreeSupportsIsolation(root);
  } else {
    assertRefSupportsIsolation(root, targetSha);
  }
}

/** Free the fixed offset ports: tear down a DIFFERENT active stage, or a --fresh rebuild of the same one. */
function teardownIfStale(root: string, active: ActiveStage | null, targetSha: string, fresh: boolean): void {
  if (active !== null && (active.sha !== targetSha || fresh)) {
    print(`[snap-stage] tearing down stale stage ${active.shortSha}`);
    stopStage(active.dir);
    removeStageDir(root, active);
    clearActive(root);
  }
}

/** Populate the stage dir's SOURCE (rsync for `--dirty`, `git worktree add` for a real ref) — the caller
 *  has already handled staleness teardown. */
function prepareStageSource(root: string, paths: StagePaths, opts: { readonly targetSha: string; readonly dirty: boolean; readonly fresh: boolean }): void {
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

/** Reuse a healthy warm stage as-is, EXCEPT a dirty one still re-syncs the working tree first (cheap,
 *  idempotent — the point of `--dirty` being refreshable); its own tsx watch picks up the diff. */
function reuseWarmStage(root: string, active: ActiveStage, dirty: boolean): ActiveStage {
  if (dirty) {
    print(`[snap-stage] re-syncing working tree → warm dirty stage ${active.dir}`);
    syncDirtyTree(root, active.dir);
  } else {
    print(`[snap-stage] reusing warm stage ${active.shortSha} → ${active.baseUrl}`);
  }
  return active;
}

/** Boot-or-reuse the isolated stage and return the active handle (its base URL is where snap navigates).
 *  `--dirty` stages the WORKING TREE (keyed by the fixed `DIRTY_STAGE_KEY`, never a real sha) instead of a
 *  git ref — see the module header. */
export function ensureStage(opts: EnsureStageOpts): ActiveStage {
  const root = repoRoot();
  const dirty = opts.dirty ?? false;
  const targetSha = dirty ? DIRTY_STAGE_KEY : resolveRef(root, opts.ref ?? "HEAD");
  const ports = stagePorts();
  const paths = stagePaths(root, targetSha);
  const active = readActive(root);
  const healthy = active !== null && active.sha === targetSha && stageHealthy(ports);

  if (stageDecision({ targetSha, active, fresh: opts.fresh, healthy }) === "reuse" && active !== null) {
    return reuseWarmStage(root, active, dirty);
  }

  assertStageSourceSupportsIsolation(root, dirty, targetSha);
  teardownIfStale(root, active, targetSha, opts.fresh);
  prepareStageSource(root, paths, { targetSha, dirty, fresh: opts.fresh });

  if (!existsSync(join(paths.dir, "node_modules"))) {
    print(`[snap-stage] pnpm install (shared store) in ${paths.dir}`);
    pnpmInstall(paths.dir);
  }
  seedStageData(root, paths);

  print(`[snap-stage] booting isolated stack — server:${ports.server} vite:${ports.vite}`);
  bootStage(paths, ports);

  const built: ActiveStage = {
    sha: targetSha,
    shortSha: shortSha(targetSha),
    dir: paths.dir,
    serverPort: ports.server,
    vitePort: ports.vite,
    baseUrl: stageBaseUrl(ports.vite),
  };
  writeActive(root, built);
  print(`[snap-stage] stage ready → ${built.baseUrl}`);
  return built;
}

/** `--stage-down`: stop the active stage's stack and remove its worktree/dir. Returns a one-line status. */
export function teardownStage(): string {
  const root = repoRoot();
  const active = readActive(root);
  if (active === null) {
    return "no active stage to tear down";
  }
  try {
    stopStage(active.dir);
    removeStageDir(root, active);
  } catch (e) {
    return `partial teardown of ${active.shortSha}: ${errorMessage(e)}`;
  }
  clearActive(root);
  return `tore down stage ${active.shortSha} (stack stopped, ${active.sha === DIRTY_STAGE_KEY ? "dir" : "worktree"} removed)`;
}
