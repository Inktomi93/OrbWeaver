import { readdirSync, readFileSync } from "node:fs";

const PROC_PID_RE = /^[0-9]+$/;
const PROC_PPID_RE = /^PPid:\s+([0-9]+)$/m;

function processParents(): ReadonlyMap<number, number> {
  const parents = new Map<number, number>();
  for (const entry of readdirSync("/proc")) {
    if (!PROC_PID_RE.test(entry)) {
      continue;
    }
    try {
      const parent = PROC_PPID_RE.exec(readFileSync(`/proc/${entry}/status`, "utf8"))?.[1];
      if (parent !== undefined) {
        parents.set(Number(entry), Number(parent));
      }
    } catch {
      // A process may exit between the /proc directory read and its metadata reads.
    }
  }
  return parents;
}

function descendantPids(rootPid: number, parents: ReadonlyMap<number, number>): Set<number> {
  const descendants = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, parent] of parents) {
      if (!descendants.has(pid) && descendants.has(parent)) {
        descendants.add(pid);
        grew = true;
      }
    }
  }
  return descendants;
}

function chromiumPids(pids: ReadonlySet<number>, rootPid: number): Set<number> {
  const chromium = new Set<number>();
  for (const pid of pids) {
    if (pid === rootPid) {
      continue;
    }
    try {
      const command = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      if (command.includes("headless_shell") || command.includes("chromium")) {
        chromium.add(pid);
      }
    } catch {
      // Same process-exit race as the parent census.
    }
  }
  return chromium;
}

/** Chromium descendants of one test runner, including children reached through CLI/Playwright drivers. */
export function chromiumDescendantPids(rootPid: number): Set<number> {
  return chromiumPids(descendantPids(rootPid, processParents()), rootPid);
}
