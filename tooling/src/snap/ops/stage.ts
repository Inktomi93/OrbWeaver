// ── snap-stage: the ISOLATED serving mode behind `snap --isolated` ───────────────────────────────────
//
// WHY THIS EXISTS (the one-liner recovery story): a visual pass (side-eye) run against the LIVE dev stack
// fights that stack's HMR — a concurrent lane saving mid-edit source crash-loops node --watch/vite under the
// reviewer, who then has to hand-build a worktree at HEAD to finish. `snap --isolated` makes that recovery
// ONE flag: it serves snaps from a DETACHED git worktree pinned at local HEAD (or `--ref <sha>`), booting a
// SECOND, fully isolated dev stack on OFFSET ports with its OWN db/data — zero collision with the dev stack,
// both run at once. The worktree is never edited, so its watchers never fire: crash-loop-immune by
// construction while keeping the dev bundle's `window.__orb` (side-eye's eval machinery) intact.
//
// THE TABLE IS REPO-KEYED, NOT CHECKOUT-KEYED (issue #108, 2026-08-16). A band is a port pair for the whole
// BOX, so the file naming its owner must be one every checkout agrees on. It used to be written
// into whichever checkout snap ran from, so a lane's stage left main's marker dir empty and a sibling's
// only tell was `ss -tlnp` plus ps spelunking — two coordination rounds in one afternoon. The table now
// lives beside the MAIN checkout (`git rev-parse --git-common-dir` answers `<main>/.git` from every linked
// worktree) and each row records the owner's checkout, pid and start time, so `--stage-status` /
// `--stage-down` work from anywhere and a collision REFUSES with a name instead of silently killing a
// sibling's stage.
//
// EVERY LANE GETS ITS OWN STAGE (issue #1276, design §3.6). There used to be ONE band, so two lanes wanting
// a stage was a refusal by construction — four were blocked in a single afternoon (2026-09-02). There are
// now ten registered bands (`_shared/ports.ts`) and a locked ALLOCATOR: this checkout's own row, else a
// sibling's healthy row at our sha, else the lowest free band, else the lowest stranded one (reaped on
// acquire), else an exit-2 refusal naming every row with its idle age. The decision is
// lib/stage-bands.ts's, the census + the claim are ops/stage-census.ts's; this file boots what it is given.
// Arm 2 is REAL and not decorative: until #2441 the `--base` ownership guard called the row this allocator
// had just handed out `foreign` and exited 2 ("nothing was measured"), so the arm could never complete a
// run. `ensureStage`'s single exit publishes the bound row (`lib/stage-run-binding.ts`) and THAT is what
// entitles the read — the guard's `shared` claim, with a printed line naming whose tree answered.
//
// LIFECYCLE: one stage per (checkout, sha) at .cache/snap-stage/<short-sha>/ (`pnpm install` once —
// shared store), its OWN db (seedStageData's provenance note below — a cached stage KEEPS its old db)
// + assets symlink; boots the worktree's own stack cli on the offset band and stays WARM. A new HEAD sha
// rebuilds (stale stage torn down first); `--fresh` forces; `--stage-down` (ops/stage-status.ts) removes.
// READ-ONLY BY CONVENTION: nothing edits the worktree source — only gitignored node_modules/db/assets.
// ENV: boots under ORB_ENV_NO_FILE, inheriting exactly the DB-BOUND keys (lib/stage-plan.ts
// STAGE_INHERITED_ENV_KEYS — CREDENTIALS_KEY missing ⇒ /healthz 503 forever, the blindness that hid it).
// VERSION TRIPWIRE: a ref whose vite.config lacks VITE_API_TARGET would proxy /api to the DEV server —
// rejected up front via `git show`, before any worktree/install/boot work.
// `--dirty` stages the WORKING TREE instead of a commit: rsync by `git ls-files` manifest (see
// syncDirtyTree's docstring for the filter-syntax trap) into the fixed `dirty` key — refreshable, still
// crash-loop-immune (only OUR rsync touches the stage; its node --watch restarts only on our calls).
// The pure derivation half (ports/paths/staleness/band-access) is lib/stage-plan.ts; the marker I/O is
// ops/stage-marker.ts and the "what is running" probes are ops/stage-probe.ts.
//
// WARMTH HAS AN EXPIRY NOW (issue #324, 2026-08-22). A stage stayed running as a detached process group
// long after its purpose ended, holding the band and reading like the real dev stack until someone read
// the cmdline; `.cache/snap-stage/` also accumulated dirs from crashed runs, and the marker outlived
// the stage it named by two days. The fix is NOT teardown at run completion — staying warm across runs
// (and across checkouts, #108's `shared-reuse`) is the whole feature, and killing the stage with its
// invoker would delete it. A WARM stage's liveness is its USE: every boot, every reuse, every session call
// bound to the band and every attached sibling run stamps `lastUsedAt` (the heartbeat); a row past the
// owner-ruled TTL (60 min, `ORB_STAGE_TTL_MIN` — F5) is reaped by the next allocation that needs a band or
// by `--stage-sweep`; and the boot path prunes stage dirs that no row and no current call owns. A row with
// a LIVE session ref is never a strand, whatever its idle age. The verdicts are pure (lib/stage-bands.ts
// `stageSweepVerdict`/`rowIsDangling`, lib/stage-plan.ts `orphanStageDirs`); the sweep NEVER touches a band
// process it cannot positively identify as a stage, which is what keeps a sibling's live stage safe.
//
// AND THE STAGE NOW EXPIRES ITSELF (issue #1163 arm b, 2026-09-05). The three arms above are all
// PULL-driven — a lane must want a band, or an operator must run the sweep — so a box with idle lanes kept
// full stacks resident for hours (measured: bands stranded 2h56m / 4h51m / 1h37m with live servers and no
// sessions). `ensureStage` now ARMS the band's own idle timer at its single exit (`armStageKeeper`), and
// that timer tears the stage down through the same path `--stage-down` takes. It is never a fence: the
// three arms above are unchanged and still reap a band whose keeper died.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runGit } from "../../_shared/git.ts";
import { listeningPids } from "../../_shared/platform.ts";
import { stageBandPorts } from "../../_shared/ports.ts";
import { runNicedSync, spawnFullPrioritySync } from "../../_shared/proc.ts";
import { FIXTURE_SEED_CLI_REL, fixtureIdentityEnv } from "../../stack/index.ts";
import type { EnsureStageOpts, StageAuthMode, StagePaths, StagePorts, StageRow, StageStopVerdict } from "../contract/stage.ts";
import { stageRowAuth } from "../contract/stage.ts";
import { foreignHolders, liveHoldersOf, STAGE_USE_HEARTBEAT_MS, stageDecision, stageRebuildRefusal } from "../lib/stage-bands.ts";
import {
  DIRTY_STAGE_KEY,
  missingLauncherRefusal,
  orphanStageDirs,
  STAGE_ROOT_REL,
  shortSha,
  stageBandEnv,
  stageInheritedEnv,
  stageLauncher,
  stageLauncherSpawn,
  stagePaths,
  stageRowBaseUrl,
} from "../lib/stage-plan.ts";
import { registerStageRunBinding } from "../lib/stage-run-binding.ts";
import { acquireStageBand, stageRowHealth } from "./stage-census.ts";
import { repoRoot, resolveRef } from "./stage-git.ts";
import { holdStageUse } from "./stage-holders.ts";
import { armStageKeeper } from "./stage-keeper.ts";
import { clearRow, markerRoot, readBands, touchRow, writeRow } from "./stage-marker.ts";
import { holderProcessRunning, stageBandPortPid, stageDirs } from "./stage-probe.ts";
import { recordStageReap } from "./stage-reap-log.ts";
import { assertStageSourceSupportsIsolation, pnpmInstall, prepareStageSource, removeStageDir, seedStageData, syncDirtyTree } from "./stage-source.ts";
import { stopStage } from "./stage-teardown.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const DEBUG_TOKEN_BYTES = 16;

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

function bootStage(root: string, paths: StagePaths, ports: StagePorts, auth: StageAuthMode): void {
  // A local-auth stage owns an empty data root, so no dev db key applies; the fixture recipe's identity
  // half (local sign-in, its insecure secrets, the owner handle) takes their place.
  const inherited = auth === "local" ? fixtureIdentityEnv(ports.server) : devInheritedEnv(root);
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: the stage stack inherits the operator's ambient env (PATH etc) — harness plumbing, not app config.
    ...process.env,
    // The band's address, the same env the teardown's `stack down` resolves its ports from. It also skips
    // the repo-root .env entirely, so the operator's DEBUG_TOKEN/WIRE_CAPTURE/OIDC_* never arm a second
    // /api/_debug/* surface behind a copy of the dev DB; the keys the copied DB needs are declared below.
    ...stageBandEnv(ports),
    // ONE root for the stage's db, assets, secrets and caches; the server derives every path from it, and
    // `seedStageData` filled it from the same derivation.
    DATA_DIR: paths.dataDir,
    // A stage is a render target that never embeds. The background model load stalls the server's event
    // loop for about a minute on a loaded box, so every API read times out and the stage reads BOOT-DEAD.
    LOCAL_LIGHT_PREFETCH: "off",
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
  // Resolved, not hardcoded (#447): an older `--ref` stage ships a shell launcher where the current tree
  // ships the stack cli. A ref with neither is refused BY NAME here rather than spawning a path that does
  // not exist and reporting a generic boot failure.
  const launcher = stageLauncher(paths.dir, existsSync);
  if (launcher === null) {
    throw new Error(missingLauncherRefusal(paths.dir));
  }
  // FULL PRIORITY, deliberately (the one census'd exception — see spawnFullPrioritySync's doc): a
  // -19 staged app times out snap navigations under load, skewing the receipts the stage exists for.
  const spawn = stageLauncherSpawn(launcher, "up", process.execPath);
  const res = spawnFullPrioritySync(spawn.command, [...spawn.args], { cwd: paths.dir, env });
  if (res.status !== 0) {
    throw new Error(`stage stack failed to boot — inspect ${join(paths.dir, ".cache", "stack")}/*.log`);
  }
}

/** Mint the fixture's humans on a booted local-auth stage with the staged tree's own seed cli, the same
 *  verb `pnpm fixture up` runs. The seed verifies both humans can sign in before it exits 0. */
function seedStageHumans(paths: StagePaths, ports: StagePorts): void {
  const seedCli = join(paths.dir, FIXTURE_SEED_CLI_REL);
  if (!existsSync(seedCli)) {
    throw new Error(`stage ${paths.dir} ships no ${FIXTURE_SEED_CLI_REL}, so --stage-auth local cannot seed its humans; use a newer --ref`);
  }
  // biome-ignore lint/style/noProcessEnv: the seed child inherits the operator's ambient env (PATH etc) — harness plumbing, not app config.
  const env = { ...process.env, ...fixtureIdentityEnv(ports.server) };
  const res = runNicedSync(process.execPath, [seedCli, "multi-user"], { cwd: paths.dir, env, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`stage ${paths.dir}: seeding the fixture humans failed (seed multi-user exit ${String(res.status)})`);
  }
}

// ── Orchestration ──────────────────────────────────────────────────────────────────────────────────────

/** The PROVISIONAL row written inside the allocation lock, before the 55 s boot: it claims the band by
 *  name so a sibling entering the lock a millisecond later sees it occupied and takes the next one. The
 *  boot rewrites it with the real pid and the db provenance; a boot that throws clears it. */
function claimRow(claim: {
  readonly band: number;
  readonly checkout: string;
  readonly targetSha: string;
  readonly dir: string;
  readonly nowIso: string;
}): StageRow {
  const { band, targetSha, dir, nowIso } = claim;
  const ports = stageBandPorts(band);
  return {
    band,
    sha: targetSha,
    dir,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: claim.checkout,
    ownerPid: null,
    startedAt: nowIso,
    lastUsedAt: nowIso,
    holders: [],
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  };
}

/** A boot onto a band whose old stack may still hold the ports would fail against it, or serve the old stack:
 *  an unconfirmed stop ends this run as a tool error. */
function refuseUnconfirmedStop(row: StageRow, stop: StageStopVerdict): void {
  if (stop.kind === "unconfirmed") {
    throw new Error(`stage ${shortSha(row.sha)} on band ${row.band} could not be replaced: ${stop.reason}`);
  }
}

/** Tear a stage down and forget it — the shape every rebuild/reap path shares. Ports come from the ROW,
 *  because the stage being removed may sit on a different band than the one we are about to boot on. */
function dropStage(root: string, home: string, row: StageRow): void {
  refuseUnconfirmedStop(row, stopStage(row.dir, { server: row.serverPort, vite: row.vitePort }));
  removeStageDir(root, row);
  clearRow(home, row.band);
}

/** Reuse a healthy warm stage as-is, EXCEPT a dirty one still re-syncs the working tree first (cheap,
 *  idempotent — the point of `--dirty` being refreshable); its own node --watch picks up the diff. The
 *  rsync COUNT rides the row, because it is one half of the ERA rule (lib/stage-bands.ts). */
function reuseWarmStage(homes: { readonly root: string; readonly home: string }, row: StageRow, dirty: boolean, nowIso: string): StageRow {
  const { root, home } = homes;
  if (dirty) {
    print(`[snap-stage] re-syncing working tree → warm dirty stage ${row.dir} (band ${row.band})`);
    syncDirtyTree(root, row.dir);
    const resynced: StageRow = { ...row, rsyncs: row.rsyncs + 1, lastUsedAt: nowIso };
    writeRow(home, resynced);
    return resynced;
  }
  print(`[snap-stage] reusing warm stage ${shortSha(row.sha)} on band ${row.band} → ${stageRowBaseUrl(row)}`);
  touchRow(home, row.band, nowIso);
  return { ...row, lastUsedAt: nowIso };
}

/** Build the stage on the band the allocator gave us, and write the row that says so. Everything here runs
 *  OUTSIDE the table lock — the band is already claimed, so a 55 s boot blocks nobody's allocation. */
function bootOntoBand(input: {
  readonly root: string;
  readonly home: string;
  readonly band: number;
  readonly targetSha: string;
  readonly dirty: boolean;
  readonly fresh: boolean;
  readonly auth: StageAuthMode;
}): StageRow {
  const { root, home, band, targetSha, dirty, auth } = input;
  const paths = stagePaths(root, targetSha, auth);
  const ports = stageBandPorts(band);
  assertStageSourceSupportsIsolation(root, dirty, targetSha);
  // After the staleness teardown and BEFORE this call's dir is created: whatever is still on disk that
  // no row and no current call accounts for is a crashed run's residue (#324).
  pruneOrphanStageDirs(root, { rowDirs: readBands(home).map((row) => row.dir), targetDir: paths.dir });
  prepareStageSource(root, paths, { targetSha, dirty, fresh: input.fresh });

  if (!existsSync(join(paths.dir, "node_modules"))) {
    print(`[snap-stage] pnpm install (shared store) in ${paths.dir}`);
    pnpmInstall(paths.dir);
  }
  const dbProvenance = auth === "local" ? null : seedStageData(root, paths);

  print(`[snap-stage] booting isolated stack on band ${band} — server:${ports.server} vite:${ports.vite} · auth ${auth}`);
  try {
    bootStage(root, paths, ports, auth);
    if (auth === "local") {
      seedStageHumans(paths, ports);
    }
  } catch (e) {
    // The claim outlives nothing: a band whose boot failed must be free for the next caller, or one bad
    // ref would burn a band until somebody swept it.
    clearRow(home, band);
    throw e;
  }
  const nowIso = new Date().toISOString();
  const bound = listeningPids();
  if (bound.kind === "refused") {
    // The owner pid is shown, never judged; the stage is already up, so an unknown owner is recorded as unknown.
    print(`[snap-stage] owner pid of :${ports.server} not recorded — ${bound.reason}`);
  }
  const built: StageRow = {
    band,
    sha: targetSha,
    dir: paths.dir,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: root,
    ownerPid: bound.kind === "read" ? stageBandPortPid(ports.server, bound.value) : null,
    startedAt: nowIso,
    // Born used: a stage booted this instant is the freshest possible, and the reaper reads THIS field.
    lastUsedAt: nowIso,
    holders: [],
    sessions: [],
    dbProvenance,
    rsyncs: dirty ? 1 : 0,
  };
  writeRow(home, built);
  print(`[snap-stage] stage ready → ${stageRowBaseUrl(built)}`);
  return built;
}

/** Boot-or-reuse an isolated stage ON THIS LANE'S OWN BAND and return its row (its base URL is where snap
 *  navigates). `--dirty` stages the WORKING TREE (keyed by the fixed `DIRTY_STAGE_KEY`, never a real sha)
 *  instead of a git ref — see the module header. */
export function ensureStage(opts: EnsureStageOpts): StageRow {
  const root = repoRoot();
  const home = markerRoot(root);
  const resolved = resolveStageRow(root, opts);
  // ARM (b) (#1163): every path below yields a LIVE row, and every live row gets the band's own idle
  // timer — armed here, at the ONE exit, so no future arm can forget it. Idempotent: a warm reuse whose
  // keeper is still running spawns nothing (ops/stage-keeper.ts).
  const row = armStageKeeper(home, resolved.row);
  // …and that SAME one exit publishes what this run bound, carrying whether we BOOTED it — the one fact the
  // boot-dead teardown may act on without breaking #324's warm-across-runs rule (lib/stage-run-binding.ts).
  registerStageRunBinding({ row, home, booted: resolved.booted });
  // Every caller that binds a stage holds it for its process's life (snap runs, session daemons,
  // cache:check), so no other checkout tears it down under that use.
  holdStageUse(home, row, root, STAGE_USE_HEARTBEAT_MS);
  return row;
}

/** The row plus the one provenance bit `ensureStage` publishes: did THIS call build the stage from nothing
 *  (a boot, or a rebuild onto our own band), or did it reuse one that was already serving — ours warm, or a
 *  sibling checkout's at the same sha? Only the first is ever a teardown candidate. */
interface ResolvedStage {
  readonly row: StageRow;
  readonly booted: boolean;
}

function rebuildReason(row: StageRow, ask: { readonly targetSha: string; readonly auth: StageAuthMode; readonly fresh: boolean }): string {
  if (ask.fresh) {
    return "--fresh";
  }
  if (row.sha !== ask.targetSha || stageRowAuth(row) !== ask.auth) {
    return `replaced by ${shortSha(ask.targetSha)} · auth ${ask.auth}`;
  }
  return "unhealthy";
}

function resolveStageRow(root: string, opts: EnsureStageOpts): ResolvedStage {
  const dirty = opts.dirty ?? false;
  const targetSha = dirty ? DIRTY_STAGE_KEY : resolveRef(root, opts.ref ?? "HEAD");
  const home = markerRoot(root);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const auth = opts.auth ?? "single-user";
  const dir = stagePaths(root, targetSha, auth).dir;

  const { allocation } = acquireStageBand({
    home,
    root,
    checkout: root,
    targetSha,
    dirty,
    fresh: opts.fresh,
    nowMs,
    auth,
    claim: (band) => claimRow({ band, checkout: root, targetSha, dir, nowIso }),
  });

  if (allocation.kind === "exhausted") {
    // Exit-2 class: nothing was measured, and the text names every row with its idle age so the operator
    // can see which lane holds what (§3.6). ops/guards.ts turns the throw into the printed STAGE ERROR.
    throw new Error(allocation.refusal);
  }
  if (allocation.kind === "shared-reuse") {
    print(
      `[snap-stage] reusing ${allocation.row.checkout}'s warm stage ${shortSha(allocation.row.sha)} on band ${allocation.band} (same commit) → ${stageRowBaseUrl(allocation.row)}`,
    );
    // OUR use keeps THEIR stage alive: the heartbeat measures the band's use, not one checkout's (#324).
    touchRow(home, allocation.band, nowIso);
    return { row: { ...allocation.row, lastUsedAt: nowIso }, booted: false };
  }
  if (allocation.kind === "ours") {
    const healthy = stageRowHealth(allocation.row, nowMs) === "warm";
    const liveHolders = liveHoldersOf(allocation.row, nowMs, holderProcessRunning);
    const decision = stageDecision({ targetSha, row: allocation.row, fresh: opts.fresh, healthy, auth, checkout: root, nowMs, liveHolders });
    if (decision === "reuse") {
      return { row: reuseWarmStage({ root, home }, allocation.row, dirty, nowIso), booted: false };
    }
    if (decision === "refuse") {
      throw new Error(stageRebuildRefusal(allocation.row, foreignHolders(liveHolders, root), nowMs));
    }
    print(
      `[snap-stage] rebuilding our stage ${shortSha(allocation.row.sha)} on band ${allocation.band} (${rebuildReason(allocation.row, { targetSha, auth, fresh: opts.fresh })})`,
    );
    dropStage(root, home, allocation.row);
    writeRow(home, claimRow({ band: allocation.band, checkout: root, targetSha, dir, nowIso }));
    return { row: bootOntoBand({ root, home, band: allocation.band, targetSha, dirty, fresh: opts.fresh, auth }), booted: true };
  }
  if (allocation.kind === "reap") {
    // LAZY REAP-ON-ACQUIRE (#1163 arm a): the band was already claimed for us inside the lock, so this
    // tears down the corpse that was on it. `git worktree remove` is repo-wide, so a sibling checkout's
    // stranded worktree is removable from here (#108) — and it is a strand by the sweep's own rule: past
    // the TTL, no live session, stage-rooted.
    print(
      `[snap-stage] reaping the stranded stage ${shortSha(allocation.row.sha)} on band ${allocation.band} (owner ${allocation.row.checkout}, last used ${allocation.row.lastUsedAt})`,
    );
    const stop = stopStage(allocation.row.dir, { server: allocation.row.serverPort, vite: allocation.row.vitePort });
    if (stop.kind === "unconfirmed") {
      // Put the strand's row back over our claim: the band is not ours to boot on while its ports may be held.
      writeRow(home, allocation.row);
    }
    refuseUnconfirmedStop(allocation.row, stop);
    removeStageDir(allocation.row.checkout, allocation.row);
    // The row is NOT cleared here — the lock already replaced it with our claim — so this arm records its
    // own ledger entry rather than going through `tearDownStageRow` (#1163). The strand's old keeper, if
    // one is still running, sees a row naming a different keeper at its next poll and RELEASES.
    recordStageReap(home, allocation.row, "acquire", nowMs);
  }
  return { row: bootOntoBand({ root, home, band: allocation.band, targetSha, dirty, fresh: opts.fresh, auth }), booted: true };
}

/** Sweep stage dirs on THIS checkout that no row accounts for (#324): a crashed run leaves a bare
 *  worktree dir behind, and `.cache/snap-stage/` accumulated them silently. Cheap, and it runs on the
 *  boot path rather than waiting for an operator to notice — every row's dir and the dir this call is
 *  about to use are always spared, and dirs are per-checkout so a sibling's stage is out of reach. */
function pruneOrphanStageDirs(root: string, keep: { readonly rowDirs: readonly string[]; readonly targetDir: string | null }): void {
  const orphans = orphanStageDirs(stageDirs(root), keep);
  if (orphans.length === 0) {
    return;
  }
  print(`[snap-stage] pruning ${orphans.length} orphaned stage dir(s): ${orphans.join(", ")}`);
  for (const name of orphans) {
    rmSync(join(root, STAGE_ROOT_REL, name), { recursive: true, force: true });
  }
  runGit(root, ["worktree", "prune"], { stdio: "ignore" });
}
