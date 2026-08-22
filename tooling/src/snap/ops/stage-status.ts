// `--stage-status` / `--stage-down` / `--stage-sweep`: the engines:status-style visibility read, the
// deliberate teardown (marker-led, with the marker-less kill-by-port fallback for a lost marker), and the
// SAFE reaper for a stage that outlived its use (#324). Works from ANY checkout — the marker is shared
// and carries the owner's absolute dir (#108).
//
// THE SWEEP'S SAFETY IS ITS TWO FENCES, and neither is negotiable: it only ever kills a band process it
// positively identified as stage-rooted (`pidIsStageRooted` — the dev stack on a mis-set port, or any
// other server, is never its business), and only when the heartbeat (or, marker-less, the process's own
// age) says nothing has used it for `STAGE_IDLE_TTL_MS`. A live sibling's stage — bound band, fresh
// `lastUsedAt` — is reported and left alone, which is the #310 liveness-gate lesson applied to the band.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import { runNicedSync } from "../../_shared/proc.ts";
import type { ActiveStage, StageSweepVerdict } from "../contract/stage.ts";
import {
  ACTIVE_REL,
  DIRTY_STAGE_KEY,
  describeStageAge,
  describeStageAgePhrase,
  foreignTeardownRefusal,
  markerIsDangling,
  orphanStageDirs,
  STAGE_IDLE_TTL_MS,
  STAGE_ROOT_REL,
  stageIdleMs,
  stagePorts,
  stageSweepVerdict,
  teardownConsent,
} from "../lib/stage-plan.ts";
import { removeStageDir, repoRoot, stopStage } from "./stage.ts";
import { clearActive, markerRoot, readActive } from "./stage-marker.ts";
import { bandIsBound, killProcessGroup, pidElapsedSeconds, pidIsStageRooted, stageBandPortPid, stageDirs } from "./stage-probe.ts";

/** `snap --stage-status`: the `engines:status`-style visibility, stage edition — the marker, the stage-band
 *  port owners, and the worktree dirs on disk (so a LOST-marker / ownerless stage is SEEN, not invisible). */
export function stageStatus(): string {
  const root = repoRoot();
  const markerHome = markerRoot(root);
  const active = readActive(markerHome);
  const ports = stagePorts();
  const serverPid = stageBandPortPid(ports.server);
  const vitePid = stageBandPortPid(ports.vite);
  const dirs = stageDirs(root);
  const lines = [
    `marker      : ${active === null ? "none" : `${active.shortSha} → ${active.baseUrl}`}  (${join(markerHome, ACTIVE_REL)})`,
    // The #108 line: WHOSE stage it is, readable identically from every checkout.
    `owner       : ${active === null ? "—" : `${active.checkout} · pid ${active.ownerPid ?? "unknown"} · started ${describeStageAge(active.startedAt, Date.now())} ago`}`,
    // The #324 line: a WARM stage is supposed to outlive its run, so "how long since anyone used it" is
    // the only number that separates a stage still doing its job from a strand holding the band.
    `last used   : ${active === null ? "—" : `${describeStageAgePhrase(active.lastUsedAt, Date.now())}${stageIdleMs(active, Date.now()) > STAGE_IDLE_TTL_MS ? " — IDLE past the sweep TTL" : ""}`}`,
    `stage ports : server :${ports.server} pid ${serverPid ?? "—"} · vite :${ports.vite} pid ${vitePid ?? "—"}`,
    // Stage DIRS are per-checkout by design (each is a worktree of its own checkout) — this half is local.
    `stage dirs  : ${dirs.length === 0 ? "none" : dirs.join(", ")}  (this checkout: ${root})`,
  ];
  // Flag the ownerless case the marker-index alone can't teardown: ports bound but no marker.
  if (active === null && (serverPid !== null || vitePid !== null)) {
    lines.push("WARNING     : stage ports are bound but NO marker — a lost-marker stage; `--stage-down` will kill by port + sweep dirs.");
  }
  lines.push(`sweep       : ${sweepReport(root).join(" · ")}`);
  return lines.join("\n");
}

/** The age of the OLDEST process holding the band — a stage leader outlives the children it respawns, so
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
  stranded: "STRANDED — `--stage-sweep` will reap it",
  live: "band in use (or not a stage's) — nothing to reap",
  unbound: "band unbound",
};

/** The band's strand evidence, gathered ONCE — `--stage-status` reports it and `--stage-sweep` acts on
 *  it, so the read and the write can never disagree about what is running. */
function bandStrandEvidence(root: string): {
  readonly verdict: StageSweepVerdict;
  readonly active: ActiveStage | null;
  readonly pids: readonly number[];
  readonly orphanDirs: readonly string[];
} {
  const ports = stagePorts();
  const markerHome = markerRoot(root);
  const active = readActive(markerHome);
  const pids = [stageBandPortPid(ports.server), stageBandPortPid(ports.vite)].filter((pid): pid is number => pid !== null);
  const verdict = stageSweepVerdict({
    active,
    bandBound: bandIsBound(ports),
    // EVERY bound band pid must be a stage's; one unidentified holder is enough to keep our hands off
    // the band entirely, because killing its group could take an unrelated server with it.
    bandIsStageRooted: pids.length > 0 && pids.every((pid) => pidIsStageRooted(pid)),
    bandProcessAgeSeconds: oldestProcessAgeSeconds(pids),
    nowMs: Date.now(),
  });
  return { verdict, active, pids, orphanDirs: orphanStageDirs(stageDirs(root), { markerDir: active === null ? null : active.dir, targetDir: null }) };
}

function sweepReport(root: string): string[] {
  const { verdict, active, orphanDirs } = bandStrandEvidence(root);
  const band = markerIsDangling(active, verdict) ? "band unbound, marker DANGLING — `--stage-sweep` will reconcile it" : SWEEP_BAND_LINE[verdict];
  return [band, orphanDirs.length === 0 ? "no orphan dirs" : `${orphanDirs.length} orphan dir(s): ${orphanDirs.join(", ")}`];
}

/** `snap --stage-sweep`: reap a stage that outlived its use, reconcile a dangling marker, and prune the
 *  dirs crashed runs left behind (#324) — the three residues a strand leaves. SAFE BY CONSTRUCTION: it
 *  kills only a band whose every holder is stage-rooted AND whose last use is past `STAGE_IDLE_TTL_MS`
 *  (or, marker-less, whose process is older than it). A live stage, a sibling's or ours, is reported and
 *  left standing; `--stage-down` remains the deliberate teardown for one you know you are finished with. */
export function sweepStages(): string {
  const root = repoRoot();
  const markerHome = markerRoot(root);
  const { verdict, active, pids, orphanDirs } = bandStrandEvidence(root);
  const done: string[] = [];
  if (verdict === "stranded") {
    // Stop it the polite way first when we know its dir (the stack's own `stop` reaps its pidfiles);
    // the group kill is the backstop for exactly the detached-leader case that made this issue.
    if (active !== null) {
      stopStage(active.dir);
    }
    const killed = pids.filter((pid) => killProcessGroup(pid));
    clearActive(markerHome);
    done.push(
      `reaped a stranded stage: stopped ${active === null ? "(no marker)" : active.shortSha}, killed ${killed.length} process group(s), cleared the marker`,
    );
  }
  if (markerIsDangling(active, verdict) && active !== null) {
    // Best-effort: the dir may already be gone (a hand-cleaned strand), which is not a failure to report.
    try {
      removeStageDir(root, active);
    } catch {
      // Nothing to remove, or a worktree git has already forgotten — the marker is still the deliverable.
    }
    clearActive(markerHome);
    done.push(`reconciled a dangling marker: ${active.shortSha} (band free, last used ${describeStageAge(active.lastUsedAt, Date.now())} ago)`);
  }
  for (const name of orphanDirs) {
    rmSync(join(root, STAGE_ROOT_REL, name), { recursive: true, force: true });
  }
  if (orphanDirs.length > 0) {
    runNicedSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
    done.push(`pruned ${orphanDirs.length} orphaned stage dir(s): ${orphanDirs.join(", ")}`);
  }
  if (done.length === 0) {
    return verdict === "live"
      ? "nothing to sweep — the stage band is in use (or held by something that is not a stage); use `--stage-down` to tear a stage down deliberately"
      : "nothing to sweep — no stranded stage, no orphaned stage dirs";
  }
  return done.join("; ");
}

/** Marker-less teardown fallback: no active.json (a killed-mid-write / lost marker) but a stage may still be
 *  bound. Kill the stage-band port owners' groups and sweep the stage dirs. Returns a one-line status. */
function teardownStageMarkerless(root: string): string {
  const ports = stagePorts();
  const killed: number[] = [];
  for (const port of [ports.server, ports.vite]) {
    const pid = stageBandPortPid(port);
    if (pid !== null) {
      const pgid = runNicedSync("ps", ["-o", "pgid=", "-p", String(pid)]).stdout.trim();
      if (pgid.length > 0) {
        runNicedSync("kill", ["-TERM", `-${pgid}`], { stdio: "ignore" });
        killed.push(pid);
      }
    }
  }
  const dirs = stageDirs(root);
  for (const name of dirs) {
    rmSync(join(root, STAGE_ROOT_REL, name), { recursive: true, force: true });
  }
  runNicedSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
  if (killed.length === 0 && dirs.length === 0) {
    return "no active stage to tear down (no marker, no bound stage ports, no stage dirs)";
  }
  return `marker-less teardown: killed ${killed.length} stage-band port owner(s), swept ${dirs.length} stage dir(s)`;
}

/** `--stage-down`: stop the active stage's stack and remove its worktree/dir. Still works from ANY
 *  checkout — the marker is shared and carries the owner's absolute dir, and `git worktree remove` is
 *  repo-wide (#108) — but a FOREIGN stage whose band is still bound now needs `--force` (see
 *  `teardownConsent`: the ruling survives, its input changed). Falls back to a marker-less teardown (kill
 *  by stage-band port + sweep THIS checkout's dirs) when there is no marker but a stage may still be
 *  bound — which is also the path a pre-#108 per-checkout marker takes. */
export function teardownStage(force: boolean): string {
  const root = repoRoot();
  const markerHome = markerRoot(root);
  const { verdict, active } = bandStrandEvidence(root);
  if (active === null) {
    return teardownStageMarkerless(root);
  }
  if (teardownConsent({ active, checkout: root, inUse: verdict === "live", force }) === "refuse") {
    return foreignTeardownRefusal(active, Date.now());
  }
  const whose = active.checkout === root ? "" : ` owned by ${active.checkout}`;
  try {
    stopStage(active.dir);
    removeStageDir(root, active);
  } catch (e) {
    return `partial teardown of ${active.shortSha}${whose}: ${errorMessage(e)}`;
  }
  clearActive(markerHome);
  return `tore down stage ${active.shortSha}${whose} (stack stopped, ${active.sha === DIRTY_STAGE_KEY ? "dir" : "worktree"} removed)`;
}
