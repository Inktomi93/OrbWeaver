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

import { execFile } from "node:child_process";
import { readlinkSync } from "node:fs";
import process from "node:process";

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

/** Reap orphaned engine-family processes rooted at `repoRoot`: ps read → cwd-equality family match → SIGKILL.
 *  Returns the pids reaped. Never throws (a race-gone pid is swallowed). */
export async function reapOrphanedFamily(repoRoot: string): Promise<number[]> {
  const ps = await new Promise<string>((resolve) => {
    execFile("ps", ["-eo", "pid=,ppid=,args="], (err, stdout) => resolve(err ? "" : stdout));
  });
  const reaped: number[] = [];
  for (const pid of findOrphanedFamily(ps, makeCwdMarker(repoRoot))) {
    try {
      process.kill(pid, "SIGKILL");
      reaped.push(pid);
    } catch {
      // already gone
    }
  }
  return reaped;
}
