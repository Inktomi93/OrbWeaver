// The shared engine-family orphan reaper (A.4 supervision hygiene). An unclean APIServer death orphans its
// VRAM-holding children (EngineCore · Worker_TP · the `vllm serve` process) with no live owner — the
// recurring zoo that starves every respawn and would make a wake pre-check name our own corpse as a
// "foreign tenant". Extracted from the supervisor's original EngineCore-only reaper and WIDENED to the full
// family, so both the in-server supervisor AND the fleet front-door (engines:start reconcile) share ONE
// identification.
//
// IDENTIFICATION IS CWD-EQUALITY, NEVER A SUBSTRING GREP. Every engine we launch starts in the repo root and
// never chdirs, so `/proc/<pid>/cwd == repoRoot AND the parent's cwd != repoRoot` means the parent (the
// APIServer) died and the child re-parented (to init, cwd /). A bare `vllm`/`api_server` substring grep is
// BANNED — the false-positive class is live (an IDE language server matched `api_server`). The cwd match is
// EQUALITY not prefix: a snap-stage's server family lives UNDER the main root but never EQUAL to it, so a
// stage's processes miss the key and a stage reaper (marker = the stage root) can never reap dev engines.
//
// PURE core (`findOrphanedFamily`) with the /proc read + cmdline injected, so it's unit-testable; the I/O
// shell (`reapOrphanedFamily`) does the ps read + SIGKILL.
//
// LIVENESS GATE (the whole-fleet-reboot fix). Under OWNERSHIP INVERSION (A.4) a HEALTHY detached engine is
// nobody's child: its launcher exits and the `vllm serve` APIServer re-parents to `systemd --user` (cwd
// `/`). So a live engine matches the cwd-orphan predicate above exactly like a real corpse does — its argv
// carries `vllm serve`, its own cwd IS the repo root, its parent's cwd is not. A blind reap therefore
// SIGKILLs the healthy siblings on any PARTIAL-down reconcile: an admin "restart gen" drops gen's port →
// `engines.sh start` runs reconcile (do_start reconciles only when the fleet is not fully healthy) AND the
// supervisor's queued-spawn reaps → embed+rerank get killed → the launcher then re-boots all three. That is
// the "restart ONE engine boots the WHOLE fleet" symptom, and it also fires on any single-engine crash
// recovery. The one thing a corpse cannot fake is LIVENESS: a live engine is the LISTENER of a loopback
// port that answers /health. `reapTargets` drops any orphan candidate that is a live listener; corpses,
// duplicate-fleet losers (they never won the port bind, so they are not the listener) and hung engines (the
// port does not answer) are NOT the healthy listener and are still reaped. Cold boot has no healthy ports →
// the protected set is empty → byte-identical to the pre-gate behavior.

import { execFile } from "node:child_process";
import { readlinkSync } from "node:fs";
import process from "node:process";
import { engineBaseUrl } from "./engine-url.ts";
import { VLLM_ENGINES } from "./engines.ts";

// The engine process family, by a marker substring in the process cmdline. `EngineCore` + `Worker_TP` are
// vLLM's multiproc worker names; `vllm serve` (the APIServer's own argv) is the parent — included so a
// PARTIAL-dead tree (APIServer alive but a worker orphaned, or vice-versa) is fully swept. These substrings
// are only ever tested AFTER the cwd-equality gate below — never a standalone grep.
const FAMILY_MARKERS = ["EngineCore", "Worker_TP", "vllm serve"] as const;

const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(.*)$/;

interface PsRow {
  readonly pid: number;
  readonly ppid: number;
  readonly args: string;
}

/** Parse `ps -eo pid=,ppid=,args=` output into rows. */
export function parsePsRows(psOutput: string): PsRow[] {
  const rows: PsRow[] = [];
  for (const line of psOutput.split("\n")) {
    const m = PS_ROW_RE.exec(line);
    if (m !== null) {
      rows.push({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] ?? "" });
    }
  }
  return rows;
}

/** Is this cmdline a member of OUR engine family? (Only meaningful once the cwd-equality gate has confirmed
 *  the process is ours — see the module header: never a standalone substring grep.) */
function isFamilyCmdline(args: string): boolean {
  return FAMILY_MARKERS.some((marker) => args.includes(marker));
}

/**
 * The pure orphan match: an engine-family process whose cwd EQUALS our root but whose PARENT's cwd does NOT
 * (the parent died → re-parented). `hasOurMarker(pid)` is injected (the /proc/<pid>/cwd === root read) so the
 * decision is testable; it MUST be cwd EQUALITY, never a prefix (a stage tree lives under but ≠ the root).
 */
export function findOrphanedFamily(psOutput: string, hasOurMarker: (pid: number) => boolean): number[] {
  return parsePsRows(psOutput)
    .filter((r) => isFamilyCmdline(r.args))
    .filter((r) => hasOurMarker(r.pid) && !hasOurMarker(r.ppid))
    .map((r) => r.pid);
}

/** The cwd-EQUALITY marker: `/proc/<pid>/cwd` resolves to exactly `root` (never a prefix). Any read failure
 *  (process gone / permission) ⇒ not ours. */
export function makeCwdMarker(root: string): (pid: number) => boolean {
  return (pid: number): boolean => {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) === root;
    } catch {
      return false;
    }
  };
}

const SS_PID_RE = /pid=(\d+)/;
const HEALTH_TIMEOUT_MS = 2000;

/** The LISTENER pids for a set of ports, parsed from `ss -tlnp` output. Only ports in `ports` are consulted;
 *  a line for `:<port> ` yields the `pid=<n>` it advertises. This is the process that WON the socket bind —
 *  a duplicate-fleet loser never appears here (it lost the bind), so it stays reapable. */
export function liveListenerPids(ssOutput: string, ports: ReadonlySet<string>): number[] {
  const pids: number[] = [];
  for (const line of ssOutput.split("\n")) {
    for (const port of ports) {
      if (!line.includes(`:${port} `)) {
        continue;
      }
      const m = SS_PID_RE.exec(line);
      if (m !== null) {
        pids.push(Number(m[1]));
      }
    }
  }
  return pids;
}

/** The pids to actually SIGKILL: the cwd-orphan candidates minus any that is a LIVE engine listener. A live
 *  detached engine matches the orphan predicate (re-parented to systemd) but must never be reaped; its
 *  presence in `liveEnginePids` (the healthy-port listeners) is the discriminator from a real corpse. */
export function reapTargets(psOutput: string, hasOurMarker: (pid: number) => boolean, liveEnginePids: ReadonlySet<number>): number[] {
  return findOrphanedFamily(psOutput, hasOurMarker).filter((pid) => !liveEnginePids.has(pid));
}

/** One /health probe — a healthy answer means the port's listener is a LIVE engine, not a corpse. */
async function portHealthy(port: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** The default liveness resolver: probe every engine's loopback port; for the ports that answer /health,
 *  read the bound listener pid via `ss -tlnp`. Those pids are LIVE detached engines that must be spared. */
async function defaultLiveEnginePids(): Promise<Set<number>> {
  const healthyPorts = new Set<string>();
  await Promise.all(
    VLLM_ENGINES.map(async (engine) => {
      const port = new URL(engineBaseUrl(engine)).port;
      if (await portHealthy(port)) {
        healthyPorts.add(port);
      }
    }),
  );
  if (healthyPorts.size === 0) {
    return new Set();
  }
  const ss = await new Promise<string>((resolve) => {
    execFile("ss", ["-tlnp"], (err, stdout) => resolve(err ? "" : stdout));
  });
  return new Set(liveListenerPids(ss, healthyPorts));
}

/** Reap orphaned engine-family processes rooted at `repoRoot`: ps read → cwd-equality family match → drop the
 *  live engine listeners (the liveness gate) → SIGKILL the rest. Returns the pids reaped. Never throws (a
 *  race-gone pid is swallowed). `liveEnginePids` is injected in tests so the gate is exercised without a real
 *  fleet; it defaults to probing the loopback ports. */
export async function reapOrphanedFamily(repoRoot: string, liveEnginePids: () => Promise<Set<number>> = defaultLiveEnginePids): Promise<number[]> {
  const ps = await new Promise<string>((resolve) => {
    execFile("ps", ["-eo", "pid=,ppid=,args="], (err, stdout) => resolve(err ? "" : stdout));
  });
  const marker = makeCwdMarker(repoRoot);
  if (findOrphanedFamily(ps, marker).length === 0) {
    return []; // no orphan candidates → skip the liveness probe I/O entirely (the common no-corpse case)
  }
  const spared = await liveEnginePids();
  const reaped: number[] = [];
  for (const pid of reapTargets(ps, marker, spared)) {
    try {
      process.kill(pid, "SIGKILL");
      reaped.push(pid);
    } catch {
      // already gone
    }
  }
  return reaped;
}
