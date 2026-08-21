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
// THE MARKER IS REPO-KEYED, NOT CHECKOUT-KEYED (issue #108, 2026-08-16). The band is ONE fixed port pair
// for the whole BOX, so its owner marker must be one file every checkout agrees on. It used to be written
// into whichever checkout snap ran from, so a lane's stage left main's marker dir empty and a sibling's
// only tell was `ss -tlnp` plus ps spelunking — two coordination rounds in one afternoon. The marker now
// lives beside the MAIN checkout (`git rev-parse --git-common-dir` answers `<main>/.git` from every linked
// worktree) and records the owner's checkout, pid and start time, so `--stage-status` / `--stage-down`
// work from anywhere and a collision REFUSES with a name instead of silently killing a sibling's stage.
//
// LIFECYCLE: one active stage keyed by sha at .cache/snap-stage/<short-sha>/ (`pnpm install` once —
// shared store), its OWN db (seedStageData's provenance note below — a cached stage KEEPS its old db)
// + assets symlink; boots the worktree's stack.sh on the offset band and stays WARM. A new HEAD sha
// rebuilds (stale stage torn down first); `--fresh` forces; `--stage-down` (ops/stage-status.ts) removes.
// READ-ONLY BY CONVENTION: nothing edits the worktree source — only gitignored node_modules/db/assets.
// ENV: boots under ORB_ENV_NO_FILE, inheriting exactly the DB-BOUND keys (lib/stage-plan.ts
// STAGE_INHERITED_ENV_KEYS — CREDENTIALS_KEY missing ⇒ /healthz 503 forever, the blindness that hid it).
// VERSION TRIPWIRE: a ref whose vite.config lacks VITE_API_TARGET would proxy /api to the DEV server —
// rejected up front via `git show`, before any worktree/install/boot work.
// `--dirty` stages the WORKING TREE instead of a commit: rsync by `git ls-files` manifest (see
// syncDirtyTree's docstring for the filter-syntax trap) into the fixed `dirty` key — refreshable, still
// crash-loop-immune (only OUR rsync touches the stage; its node --watch restarts only on our calls).
// The pure derivation half (ports/paths/staleness/band-access) is lib/stage-plan.ts.

import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { print } from "../../_shared/artifacts.ts";
import { execNicedSync, runNicedSync, spawnFullPrioritySync } from "../../_shared/proc.ts";
import type { ActiveStage, EnsureStageOpts, StagePaths, StagePorts } from "../contract/stage.ts";
import {
  ACTIVE_REL,
  bandAccess,
  DIRTY_STAGE_KEY,
  foreignStageRefusal,
  ISOLATION_TRIPWIRE,
  markerRootFromCommonDir,
  STAGE_ROOT_REL,
  shortSha,
  stageBaseUrl,
  stageDecision,
  stageInheritedEnv,
  stagePaths,
  stagePorts,
} from "../lib/stage-plan.ts";

const DEBUG_TOKEN_BYTES = 16;

// ── git / repo helpers ───────────────────────────────────────────────────────────────────────────────

export function repoRoot(): string {
  return execNicedSync("git", ["rev-parse", "--show-toplevel"]).trim();
}

/** Resolve a ref (branch/tag/sha/HEAD) to a full commit sha. Throws (git non-zero) on an unknown ref. */
function resolveRef(root: string, ref: string): string {
  return execNicedSync("git", ["rev-parse", ref], { cwd: root }).trim();
}

export function markerRoot(root: string): string {
  const res = runNicedSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root });
  // No git answer at all ⇒ keep the marker local: a per-checkout marker is worse than none, but a marker
  // written to a guessed path would be invisible to every reader including this one.
  return res.status === 0 ? markerRootFromCommonDir(res.stdout) : root;
}

// ── active-stage state (the SHARED, repo-keyed marker — <main-checkout>/.cache/snap-stage/active.json) ──
//
// Every function here takes the MARKER ROOT (`markerRoot(repoRoot())`), never a checkout root: that is the
// whole of issue #108. Stage DIRS stay per-checkout (they are worktrees of that checkout) — only the ONE
// ownership marker is shared, and it names the checkout its dir belongs to.

function activePath(markerHome: string): string {
  return join(markerHome, ACTIVE_REL);
}

export function readActive(markerHome: string): ActiveStage | null {
  const p = activePath(markerHome);
  if (!existsSync(p)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<ActiveStage>;
    // A marker with no owner cannot be reasoned about across checkouts (it predates #108, or is
    // hand-written): treat it exactly like a truncated one — no marker, and the port-probe path decides.
    return typeof parsed.checkout === "string" ? (parsed as ActiveStage) : null;
  } catch {
    // A truncated/garbage marker (a killed mid-write) is treated as "no active stage" → a clean rebuild.
    return null;
  }
}

/** Exported beside `readActive` because the pair IS the cross-checkout contract (#108): the suite proves
 *  a marker written under one checkout's `markerRoot` is read back under another's. */
export function writeActive(markerHome: string, a: ActiveStage): void {
  mkdirSync(join(markerHome, STAGE_ROOT_REL), { recursive: true });
  writeFileSync(activePath(markerHome), `${JSON.stringify(a, null, 2)}\n`);
}

export function clearActive(markerHome: string): void {
  rmSync(activePath(markerHome), { force: true });
}

// ── health / version / worktree primitives ─────────────────────────────────────────────────────────────

function curlOk(url: string): boolean {
  return runNicedSync("curl", ["-sf", "-m", "2", url], { stdio: "ignore" }).status === 0;
}

/** Both halves must answer: the server (healthz) AND vite (the origin snap navigates to). */
function stageHealthy(ports: StagePorts): boolean {
  return curlOk(`http://127.0.0.1:${ports.server}/healthz`) && curlOk(`${stageBaseUrl(ports.vite)}/`);
}

/** Reject a ref whose vite.config predates the VITE_API_TARGET hook — read straight from git, BEFORE any
 *  worktree/install work, so a bad ref costs nothing and never boots a stage that proxies to the dev server. */
function assertRefSupportsIsolation(root: string, sha: string): void {
  const res = runNicedSync("git", ["show", `${sha}:packages/client/vite.config.ts`], { cwd: root });
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
  const manifest = execNicedSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root });
  const manifestPath = join(dir, ".rsync-manifest.txt");
  writeFileSync(manifestPath, manifest);
  const res = runNicedSync("rsync", ["-a", "--delete-missing-args", "--files-from", manifestPath, `${root}/`, `${dir}/`], { stdio: "inherit" });
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
  runNicedSync("git", ["worktree", "add", "--detach", dir, sha], { cwd: root, stdio: "inherit" });
}

function removeWorktree(root: string, dir: string): void {
  // --force: the worktree carries gitignored node_modules/db — git refuses a "dirty" remove otherwise.
  runNicedSync("git", ["worktree", "remove", "--force", dir], { cwd: root, stdio: "inherit" });
  runNicedSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}

function pnpmInstall(dir: string): void {
  const res = runNicedSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd: dir, stdio: "inherit" });
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

export function stopStage(dir: string): void {
  const stackSh = join(dir, "scripts", "dev", "stack.sh");
  if (existsSync(stackSh)) {
    runNicedSync("bash", [stackSh, "stop"], { cwd: dir, stdio: "inherit" });
  }
}

/** The inherited keys read straight off the dev `.env` on disk (NOT via process.env — under
 *  `ORB_ENV_NO_FILE` the stage's own boot never loads the file at all). No `.env` ⇒ nothing inherited, which
 *  is correct: without one there is no dev DB copy to be bound to either. */
function devInheritedEnv(root: string): Record<string, string> {
  const p = join(root, ".env");
  if (!existsSync(p)) {
    return {};
  }
  return stageInheritedEnv(readFileSync(p, "utf8"));
}

function bootStage(root: string, paths: StagePaths, ports: StagePorts): void {
  const inherited = devInheritedEnv(root);
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: the stage stack inherits the operator's ambient env (PATH etc) — harness plumbing, not app config.
    ...process.env,
    PORT: String(ports.server),
    VITE_PORT: String(ports.vite),
    VITE_API_TARGET: `http://127.0.0.1:${ports.server}`,
    DATABASE_URL: paths.databaseUrl,
    ASSETS_DIR: paths.assetsDir,
    // ADOPT-ONLY (A.4/A.5-1): the stage ADOPTS the shared box-level fleet when it's up (so live-model
    // surfaces snap correctly) and NEVER spawns or manages it — pinned so an ambient VLLM_DISABLED=false
    // can't make a visual-review surface cold-start (and, post-sleep-mode, become a second auto-sleep
    // manager fighting the primary). The stage runs no supervisor management; exactly one auto-sleep
    // timer exists (the dev/prod server's) — the single-manager assumption made true by construction.
    ENGINES_POSTURE: "adopt-only",
    // Skip the repo-root .env ENTIRELY (the strong hatch) — ORB_ENV_NO_OVERRIDE only flipped precedence,
    // so OWNER_HANDLES/DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE/OIDC_* all filled from the operator's real `.env`,
    // arming the stage's /api/_debug/* surface under the operator's REAL DEBUG_TOKEN with WIRE_CAPTURE=on,
    // behind a copy of the dev DB, on a second port. The keys the copied DB actually needs are declared
    // explicitly below instead.
    ORB_ENV_NO_FILE: "1",
    // The DB-BOUND keys, and ONLY those — see STAGE_INHERITED_ENV_KEYS for the per-key reason. The stage's
    // DB is a COPY of the dev DB, so a value the copied rows are bound to (the owner row's handle, the
    // credential ciphertext's key) must come across or the stage boots against data it cannot read. An
    // absent key falls through to the schema's own default, exactly like an unset key always has.
    ...inherited,
    // Minted per stage boot (like probe-fire.ts) rather than inherited — the operator's real token must
    // never arm a second, less-guarded /api/_debug/* surface. WIRE_CAPTURE stays at its schema default
    // (off) under ORB_ENV_NO_FILE; a caller who wants the wire-capture surface on the stage can still
    // export WIRE_CAPTURE=on in their own shell (process.env spread above), same as any other opt-in.
    DEBUG_TOKEN: randomBytes(DEBUG_TOKEN_BYTES).toString("hex"),
  };
  const stackSh = join(paths.dir, "scripts", "dev", "stack.sh");
  // FULL PRIORITY, deliberately (the one census'd exception — see spawnFullPrioritySync's doc): a
  // -19 staged app times out snap navigations under load, skewing the receipts the stage exists for.
  const res = spawnFullPrioritySync("bash", [stackSh, "start"], { cwd: paths.dir, env });
  if (res.status !== 0) {
    throw new Error(`stage stack failed to boot — inspect ${join(paths.dir, ".cache", "stack")}/*.log`);
  }
}

// ── Orchestration ──────────────────────────────────────────────────────────────────────────────────────

/** Remove a stage dir by its kind: a real ref is a `git worktree` (needs `git worktree remove`); the
 *  `--dirty` stage is a plain rsync'd directory (a bare `rmSync` suffices — no git bookkeeping to free). */
export function removeStageDir(root: string, stage: Pick<ActiveStage, "sha" | "dir">): void {
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

/** Free the fixed offset ports: tear down a DIFFERENT active stage, or a --fresh rebuild of the same one.
 *  `active` here is always OUR OWN stage — a foreign one is refused or reclaimed before this runs (#108). */
function teardownIfStale(homes: { readonly root: string; readonly markerHome: string }, active: ActiveStage | null, targetSha: string, fresh: boolean): void {
  if (active !== null && (active.sha !== targetSha || fresh)) {
    print(`[snap-stage] tearing down stale stage ${active.shortSha}`);
    stopStage(active.dir);
    removeStageDir(homes.root, active);
    clearActive(homes.markerHome);
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
  const markerHome = markerRoot(root);
  const active = readActive(markerHome);
  const healthy = active !== null && active.sha === targetSha && stageHealthy(ports);

  // ISSUE #108: the marker is shared, so it can name ANOTHER checkout. Decide that before anything else —
  // the old code tore down whatever the marker named, which is how a lane silently killed a sibling's stage.
  const access = bandAccess({ active, checkout: root, targetSha, dirty, fresh: opts.fresh, bandBound: bandIsBound(ports), healthy });
  if (active !== null && access === "refuse") {
    throw new Error(foreignStageRefusal(active, stageBandPortPid(ports.server), Date.now()));
  }
  if (active !== null && access === "shared-reuse") {
    print(`[snap-stage] reusing ${active.checkout}'s warm stage ${active.shortSha} (same commit) → ${active.baseUrl}`);
    return active;
  }
  if (active !== null && access === "take-over") {
    // Their dir lives under THEIR checkout, so `teardownIfStale` (which only judges sha/fresh against OUR
    // paths) would leave the corpse and the marker behind. Reclaim explicitly, then proceed marker-less.
    print(`[snap-stage] reclaiming a DEAD stage ${active.shortSha} owned by ${active.checkout} (band unbound)`);
    stopStage(active.dir);
    removeStageDir(root, active);
    clearActive(markerHome);
  }
  const ours = access === "ours" ? active : null;

  if (ours !== null && stageDecision({ targetSha, active: ours, fresh: opts.fresh, healthy }) === "reuse") {
    return reuseWarmStage(root, ours, dirty);
  }

  assertStageSourceSupportsIsolation(root, dirty, targetSha);
  teardownIfStale({ root, markerHome }, ours, targetSha, opts.fresh);
  prepareStageSource(root, paths, { targetSha, dirty, fresh: opts.fresh });

  if (!existsSync(join(paths.dir, "node_modules"))) {
    print(`[snap-stage] pnpm install (shared store) in ${paths.dir}`);
    pnpmInstall(paths.dir);
  }
  seedStageData(root, paths);

  print(`[snap-stage] booting isolated stack — server:${ports.server} vite:${ports.vite}`);
  bootStage(root, paths, ports);

  const built: ActiveStage = {
    sha: targetSha,
    shortSha: shortSha(targetSha),
    dir: paths.dir,
    serverPort: ports.server,
    vitePort: ports.vite,
    baseUrl: stageBaseUrl(ports.vite),
    checkout: root,
    ownerPid: stageBandPortPid(ports.server),
    startedAt: new Date().toISOString(),
  };
  writeActive(markerHome, built);
  print(`[snap-stage] stage ready → ${built.baseUrl}`);
  return built;
}

const SS_PID_RE = /pid=(\d+)/u;

/** The pid bound to a stage-band port (via `ss -tlnp`), or null — the marker-less teardown's index. */
export function stageBandPortPid(port: number): number | null {
  const out = runNicedSync("ss", ["-tlnp"]);
  if (out.status !== 0) {
    return null;
  }
  for (const line of out.stdout.split("\n")) {
    if (line.includes(`:${port} `)) {
      const m = SS_PID_RE.exec(line);
      if (m !== null) {
        return Number(m[1]);
      }
    }
  }
  return null;
}

/** Is EITHER half of the fixed band bound right now? The liveness half of the #108 ownership question —
 *  a foreign marker over an unbound band is a corpse to reclaim, over a bound one it is a live sibling. */
function bandIsBound(ports: StagePorts): boolean {
  return stageBandPortPid(ports.server) !== null || stageBandPortPid(ports.vite) !== null;
}

/** Stage worktree/dir names present under `.cache/snap-stage/` (excludes active.json). */
