// `--stage-status` / `--stage-down` / `--stage-sweep`: the engines status-style visibility read over EVERY
// band, the deliberate teardown, and the SAFE reaper for a stage that outlived its use (#324, table-wide
// since #1276). Works from ANY checkout — the table is shared and each row carries the owner's absolute
// dir (#108).
//
// THE STATUS READ LISTS ALL TEN BANDS, not just the caller's. That listing is what makes the exhaustion
// REFUSAL legible (design §3.6): when the allocator says "no band for you", the operator's next question is
// always "who has them?", and the answer has to be one command away — with idle ages, owners and live
// session names, so a lane can tell a stage still doing its job from a strand holding a band.
//
// THE SWEEP'S SAFETY IS ITS THREE FENCES, and none is negotiable: it only ever kills a band process it
// positively identified as stage-rooted (`pidIsStageRooted` — the dev stack on a mis-set port, or any
// other server, is never its business); only when the heartbeat (or, row-less, the process's own age) says
// nothing has used it for the owner-ruled TTL; and NEVER when the row still names a LIVE session, whatever
// its idle age (a reaper that eats a live stage is worse than no reaper). A live sibling's stage — bound
// band, fresh `lastUsedAt`, or a live daemon — is reported and left alone, the #310 liveness-gate lesson.
//
// FOUR ARMS CAN NOW END A STAGE (#1163): its own idle timer, reap-on-acquire, this sweep and `--stage-down`.
// So the status read carries two more facts a bare band census cannot give: each row's TIMER (how long it
// has left, or that its keeper pid is DEAD and only the pull arms cover it), and a `recent reaps` line off
// the bounded ledger — because a reaped band leaves no row, and "free" and "taken from a lane ninety
// seconds ago" would otherwise be the same observation. The teardown verbs here write that ledger.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import { readConcurrencyProfile } from "../../_shared/concurrency-profile.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { RESERVED_PORTS, STAGE_BANDS, stageBandPorts } from "../../_shared/ports.ts";
import { killPidGroup, runNicedSync } from "../../_shared/proc.ts";
import { processEnvValue } from "../../_shared/process-env.ts";
import { pidAlive } from "../../_shared/run-retention.ts";
import type { StageBandView, StageRow, StageSweepEvidence, StageSweepVerdict } from "../contract/stage.ts";
import { describeStageBandRow, rowIsDangling, stageSweepVerdict } from "../lib/stage-bands.ts";
import { describeStageKeeper } from "../lib/stage-keeper-plan.ts";
import {
  BANDS_REL,
  DIRTY_STAGE_KEY,
  describeStageAge,
  describeStageAgePhrase,
  foreignTeardownRefusal,
  orphanStageDirs,
  STAGE_ROOT_REL,
  selectsTeardownRow,
  shortSha,
  stageIdleMs,
  teardownConsent,
} from "../lib/stage-plan.ts";
import { sweepStrandedBrowsers } from "./browser-sweep.ts";
import { sessionStatusSummary } from "./session-registry.ts";
import { stageBandViews, stageLimits } from "./stage-census.ts";
import { repoRoot } from "./stage-git.ts";
import { clearRow, markerRoot, readBands } from "./stage-marker.ts";
import { listeningPids, pidElapsedSeconds, pidIsStageRooted, stageDirs } from "./stage-probe.ts";
import { describeStageReaps, recordStageReap } from "./stage-reap-log.ts";
import { removeStageDir } from "./stage-source.ts";
import { stopStage } from "./stage-teardown.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const MS_PER_MINUTE = 60_000;

/** Which door decided the live-stage cap (#1848) — the profile's `stageCap`, or the env override. Read
 *  fresh, because a status line is printed by a process whose env the operator may have just set. */
function capSource(): string {
  const override = processEnvValue("ORB_STAGE_CAP");
  return override === undefined || override === ""
    ? `tooling/concurrency-profile.json ${readConcurrencyProfile().name}.stageCap; ORB_STAGE_CAP overrides`
    : `ORB_STAGE_CAP=${override}`;
}
/** How many ledger entries the status read shows. Ten bands, so half a table's turnover — enough to
 *  explain a stage that vanished under a lane without the line becoming a scroll. */
const RECENT_REAPS_SHOWN = 5;

/** The whole census, gathered ONCE — `--stage-status` reports it, `--stage-sweep` acts on it and
 *  `--stage-down` selects from it, so the read and the writes can never disagree about what is running. */
function bandCensus(
  root: string,
  nowMs: number,
): {
  readonly views: readonly StageBandView[];
  readonly verdicts: ReadonlyMap<number, StageSweepVerdict>;
  readonly pids: ReadonlyMap<number, readonly number[]>;
} {
  const rows = readBands(markerRoot(root));
  // `targetSha: null` — the status read arbitrates nothing, so no row is a shared-reuse candidate and no
  // health probe is taken. A visibility read must never spawn a served-probe child per band.
  const views = stageBandViews({ rows, root, checkout: root, targetSha: null, nowMs });
  const bound = listeningPids();
  const verdicts = new Map<number, StageSweepVerdict>();
  const pids = new Map<number, readonly number[]>();
  for (const view of views) {
    const ports = stageBandPorts(view.band);
    const held = [bound.get(ports.server), bound.get(ports.vite)].filter((pid): pid is number => pid !== undefined);
    pids.set(view.band, held);
    verdicts.set(view.band, stageSweepVerdict(evidenceFor(view, held, nowMs), stageLimits().ttlMs));
  }
  return { views, verdicts, pids };
}

function evidenceFor(view: StageBandView, pids: readonly number[], nowMs: number): StageSweepEvidence {
  return {
    row: view.row,
    bandBound: view.bandBound,
    bandIsStageRooted: view.bandIsStageRooted,
    bandProcessAgeSeconds: oldestProcessAgeSeconds(pids),
    liveSessions: view.liveSessions,
    nowMs,
  };
}

/** The age of the OLDEST process holding a band — a stage leader outlives the children it respawns, so
 *  a young child must never make an old strand look fresh. Null when `ps` named none of them. */
function oldestProcessAgeSeconds(pids: readonly number[]): number | null {
  let oldest: number | null = null;
  for (const pid of pids) {
    const seconds = pidElapsedSeconds(pid);
    if (seconds !== null && (oldest === null || seconds > oldest)) {
      oldest = seconds;
    }
  }
  return oldest;
}

/** One line per band verdict for the status read — the operator's "may I sweep?" answer. */
const SWEEP_BAND_LINE: Record<StageSweepVerdict, string> = {
  stranded: "STRANDED — the next allocation reaps it, or `--stage-sweep` does",
  live: "in use (or held by something that is not a stage)",
  unbound: "unbound",
};

/** `snap --stage-status`: the `engines status`-style visibility, table edition — every band with its owner,
 *  idle age, live sessions and sweep verdict, plus the reserved rows nothing may be allocated onto and the
 *  worktree dirs on disk (so a LOST-row / ownerless stage is SEEN, not invisible). */
export function stageStatus(): string {
  const root = repoRoot();
  const nowMs = Date.now();
  const home = markerRoot(root);
  const { views, verdicts } = bandCensus(root, nowMs);
  const limits = stageLimits();
  const occupied = views.filter((view) => view.row !== null).length;
  const lines = [
    // The cap NAMES ITS SOURCE (#1848): its base is the box profile's `stageCap`, and `ORB_STAGE_CAP` is
    // the override. An operator reading "cap 3" needs to know which of the two answered.
    `table       : ${occupied}/${STAGE_BANDS.length} band(s) occupied · cap ${limits.cap} live (${capSource()}) · idle TTL ${Math.round(limits.ttlMs / MS_PER_MINUTE)}m (ORB_STAGE_TTL_MIN)  (${join(home, BANDS_REL)})`,
    `this checkout: ${root}`,
  ];
  for (const view of views) {
    const verdict = verdicts.get(view.band) ?? "unbound";
    const dangling = rowIsDangling(view.row, verdict) ? " · row DANGLING (band free) — `--stage-sweep` reconciles it" : "";
    // A band with no row and nothing bound already reads "free"; appending "unbound" to it would make ten
    // lines of noise the operator has to skim past to find the one band that matters.
    const idle = view.row === null && !view.bandBound;
    // The band's own idle timer (#1163 arm b) — how long it has left, or the fact that it is DEAD/absent,
    // which is protection the operator would otherwise assume was there.
    const timer = view.row === null ? "" : ` · ${describeStageKeeper({ home, row: view.row, nowMs, ttlMs: limits.ttlMs }, pidAlive)}`;
    lines.push(idle ? describeStageBandRow(view, nowMs) : `${describeStageBandRow(view, nowMs)} · ${SWEEP_BAND_LINE[verdict]}${dangling}${timer}`);
  }
  // Stage DIRS are per-checkout by design (each is a worktree of its own checkout) — this half is local.
  const dirs = stageDirs(root);
  lines.push(`stage dirs  : ${dirs.length === 0 ? "none" : dirs.join(", ")}`);
  lines.push(`reserved    : ${RESERVED_PORTS.map((row) => `:${row.port} ${row.owner}`).join(" · ")}`);
  // WHICH ARM ENDED WHAT (#1163). A reaped band leaves no row, so "band 3 is free" and "band 3's own idle
  // timer took it ninety seconds ago" are otherwise the same observation.
  lines.push(`recent reaps: ${describeStageReaps(home, nowMs, RECENT_REAPS_SHOWN)}`);
  // The session substrate's third reader (design §3.8): a dead session is loud on every status read.
  lines.push(`sessions    : ${sessionStatusSummary(root, nowMs)}`);
  return lines.join("\n");
}

/** `snap --stage-sweep`: reap every stage that outlived its use, reconcile dangling rows, and prune the
 *  dirs crashed runs left behind (#324) — the three residues a strand leaves, now across all ten bands.
 *  SAFE BY CONSTRUCTION (see the header's three fences). `--stage-down` remains the deliberate teardown for
 *  a stage you know you are finished with. */
export function sweepStages(): string {
  const root = repoRoot();
  const home = markerRoot(root);
  const nowMs = Date.now();
  const { views, verdicts, pids } = bandCensus(root, nowMs);
  const done: string[] = [];
  for (const view of views) {
    const verdict = verdicts.get(view.band) ?? "unbound";
    if (verdict === "stranded") {
      done.push(reapBand(home, view, pids.get(view.band) ?? []));
    } else if (rowIsDangling(view.row, verdict) && view.row !== null) {
      done.push(reconcileDanglingRow(root, home, view.row, nowMs));
    }
  }
  // The fourth residue a strand leaves (#1848): a BROWSER whose snap run is gone. It survives every kill
  // in this file, because playwright gives each browser its own session.
  done.push(...sweepStrandedBrowsers());
  const orphanDirs = orphanStageDirs(stageDirs(root), { rowDirs: readBands(home).map((row) => row.dir), targetDir: null });
  for (const name of orphanDirs) {
    rmSync(join(root, STAGE_ROOT_REL, name), { recursive: true, force: true });
  }
  if (orphanDirs.length > 0) {
    runNicedSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
    done.push(`pruned ${orphanDirs.length} orphaned stage dir(s): ${orphanDirs.join(", ")}`);
  }
  if (done.length === 0) {
    return "nothing to sweep — no stranded stage, no dangling row, no orphaned stage dirs";
  }
  return done.join("; ");
}

/** Stop it the polite way first when we know its dir (the stack's own `stop` reaps its pidfiles); the
 *  group kill is the backstop for exactly the detached-leader case that made #324. */
function reapBand(home: string, view: StageBandView, pids: readonly number[]): string {
  if (view.row !== null) {
    stopStage(view.row.dir, { server: view.row.serverPort, vite: view.row.vitePort });
  }
  const killed = pids.filter((pid) => pidIsStageRooted(pid) && killGroupOf(pid));
  clearRow(home, view.band);
  if (view.row !== null) {
    recordStageReap(home, view.row, "sweep");
  }
  return `band ${view.band}: reaped a stranded stage (stopped ${view.row === null ? "(no row)" : shortSha(view.row.sha)}, killed ${killed.length} process group(s), cleared the row)`;
}

function killGroupOf(pid: number): boolean {
  const pgid = runNicedSync("ps", ["-o", "pgid=", "-p", String(pid)]).stdout.trim();
  if (pgid.length === 0) {
    return false;
  }
  killPidGroup(Number(pgid), "SIGTERM");
  return true;
}

function reconcileDanglingRow(root: string, home: string, row: StageRow, nowMs: number): string {
  // Best-effort: the dir may already be gone (a hand-cleaned strand), which is not a failure to report.
  // @orb-waive caught-failure-ownership(catch): best-effort cleanup per the comment above — the row (cleared unconditionally below) is the actual deliverable of this branch, not the dir removal. Ends if the row clear stops happening unconditionally.
  try {
    removeStageDir(root, row);
  } catch {
    // Nothing to remove, or a worktree git has already forgotten — the row is still the deliverable.
  }
  clearRow(home, row.band);
  recordStageReap(home, row, "sweep");
  return `band ${row.band}: reconciled a dangling row ${shortSha(row.sha)} (band free, last used ${describeStageAge(row.lastUsedAt, nowMs)} ago)`;
}

/** `--stage-down`: stop the stages THIS CHECKOUT owns and remove their worktrees/dirs.
 *
 *  THE #108 RULING SURVIVES; ITS INPUT CHANGED (twice, and both texts matter). #108 made teardown work from
 *  ANY checkout; #447 then required `--force` for a foreign stage that was still in use, after a plain
 *  `--stage-down` killed a sibling mid-navigation. With a TABLE there is a third question — WHICH row — and
 *  the honest default is the one that cannot surprise anyone: the rows you own. `--force` extends it to
 *  foreign rows exactly as #447 left it, so the cross-checkout escape hatch #108 promised is still one flag
 *  away and `foreignStageRefusal` still advertises it truthfully. A band bound by something no row accounts
 *  for is torn down by port (the lost-row fallback), unchanged. */
export function teardownStage(selection: { readonly force: boolean; readonly owner: string | null }): string {
  const root = repoRoot();
  const home = markerRoot(root);
  const nowMs = Date.now();
  const { views, verdicts, pids } = bandCensus(root, nowMs);
  const results: string[] = [];
  for (const view of views) {
    results.push(...teardownView({ root, home, view, verdict: verdicts.get(view.band) ?? "unbound", pids: pids.get(view.band) ?? [], selection, nowMs }));
  }
  // Same fourth residue as the sweep's (#1848): a browser whose snap run is gone survives every kill above,
  // because playwright gives each one its own session. `--stage-down` is a teardown too, so it reaps them.
  results.push(...sweepStrandedBrowsers());
  const dirs = stageDirs(root);
  const orphanDirs = orphanStageDirs(dirs, { rowDirs: readBands(home).map((row) => row.dir), targetDir: null });
  for (const name of orphanDirs) {
    rmSync(join(root, STAGE_ROOT_REL, name), { recursive: true, force: true });
  }
  if (orphanDirs.length > 0) {
    runNicedSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
    results.push(`swept ${orphanDirs.length} orphaned stage dir(s)`);
  }
  if (results.length === 0) {
    return selection.owner === null
      ? `no stage of this checkout to tear down (${root}) — \`--stage-status\` lists every band; name a sibling with \`--stage-owner <checkout> --force\``
      : `no stage owned by ${selection.owner} to tear down — \`--stage-status\` lists every band`;
  }
  return results.join("\n");
}

function teardownView(input: {
  readonly root: string;
  readonly home: string;
  readonly view: StageBandView;
  readonly verdict: StageSweepVerdict;
  readonly pids: readonly number[];
  readonly selection: { readonly force: boolean; readonly owner: string | null };
  readonly nowMs: number;
}): readonly string[] {
  const { root, home, view, verdict, pids, selection, nowMs } = input;
  if (view.row === null) {
    return selection.owner === null ? teardownRowlessBand(view, pids) : [];
  }
  if (!selectsTeardownRow(view.row, root, selection.owner)) {
    return [];
  }
  if (view.row.checkout !== root && !selection.force) {
    return [foreignSkipLine(view.row, verdict === "live", root, nowMs)];
  }
  return [teardownRow(root, home, view.row)];
}

/** What a plain `--stage-down` says about a SIBLING's row instead of touching it: the #447 refusal when it
 *  is still in use, and the skip line (with both remedies) when it is merely somebody else's. Narrowing the
 *  default to "the rows you own" is the table's doing — with one band, "the stage" was unambiguous. */
function foreignSkipLine(row: StageRow, inUse: boolean, checkout: string, nowMs: number): string {
  if (teardownConsent({ row, checkout, inUse, force: false }) === "refuse") {
    return foreignTeardownRefusal(row, nowMs);
  }
  return (
    `band ${row.band}: left ${shortSha(row.sha)} alone — it belongs to ${row.checkout} (idle ` +
    `${describeStageAgePhrase(row.lastUsedAt, nowMs)}). \`--force\` tears down a sibling's row; \`--stage-sweep\` reaps a strand.`
  );
}

function teardownRow(root: string, home: string, row: StageRow): string {
  const whose = row.checkout === root ? "" : ` owned by ${row.checkout}`;
  try {
    stopStage(row.dir, { server: row.serverPort, vite: row.vitePort });
    removeStageDir(row.checkout, row);
  } catch (e) {
    return `band ${row.band}: partial teardown of ${shortSha(row.sha)}${whose}: ${errorMessage(e)}`;
  }
  clearRow(home, row.band);
  recordStageReap(home, row, "down");
  return `band ${row.band}: tore down stage ${shortSha(row.sha)}${whose} (stack stopped, ${row.sha === DIRTY_STAGE_KEY ? "dir" : "worktree"} removed) — last used ${describeStageAgePhrase(row.lastUsedAt, Date.now())}, idle ${Math.round(stageIdleMs(row, Date.now()) / MS_PER_MINUTE)}m`;
}

/** The row-less fallback: a band bound by a stage-rooted process no row accounts for (a killed-mid-write
 *  table, or a pre-#1276 stage). Kill its group; never touch a holder we could not identify. */
function teardownRowlessBand(view: StageBandView, pids: readonly number[]): readonly string[] {
  if (!(view.bandBound && view.bandIsStageRooted)) {
    return [];
  }
  const killed = pids.filter((pid) => killGroupOf(pid));
  return [`band ${view.band}: row-less teardown — killed ${killed.length} stage-rooted band process group(s)`];
}
