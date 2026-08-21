// `--stage-status` / `--stage-down`: the engines:status-style visibility read and the deliberate
// teardown (marker-led, with the marker-less kill-by-port fallback for a lost marker). Works from ANY
// checkout — the marker is shared and carries the owner's absolute dir (#108).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import { runNicedSync } from "../../_shared/proc.ts";
import { ACTIVE_REL, DIRTY_STAGE_KEY, describeStageAge, STAGE_ROOT_REL, stagePorts } from "../lib/stage-plan.ts";
import { clearActive, markerRoot, readActive, removeStageDir, repoRoot, stageBandPortPid, stopStage } from "./stage.ts";

function stageDirs(root: string): string[] {
  const dir = join(root, STAGE_ROOT_REL);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

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
    `stage ports : server :${ports.server} pid ${serverPid ?? "—"} · vite :${ports.vite} pid ${vitePid ?? "—"}`,
    // Stage DIRS are per-checkout by design (each is a worktree of its own checkout) — this half is local.
    `stage dirs  : ${dirs.length === 0 ? "none" : dirs.join(", ")}  (this checkout: ${root})`,
  ];
  // Flag the ownerless case the marker-index alone can't teardown: ports bound but no marker.
  if (active === null && (serverPid !== null || vitePid !== null)) {
    lines.push("WARNING     : stage ports are bound but NO marker — a lost-marker stage; `--stage-down` will kill by port + sweep dirs.");
  }
  return lines.join("\n");
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

/** `--stage-down`: stop the active stage's stack and remove its worktree/dir. Works from ANY checkout —
 *  the marker is shared and carries the owner's absolute dir, and `git worktree remove` is repo-wide (#108).
 *  Falls back to a marker-less teardown (kill by stage-band port + sweep THIS checkout's dirs) when there is
 *  no marker but a stage may still be bound — which is also the path a pre-#108 per-checkout marker takes. */
export function teardownStage(): string {
  const root = repoRoot();
  const markerHome = markerRoot(root);
  const active = readActive(markerHome);
  if (active === null) {
    return teardownStageMarkerless(root);
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
