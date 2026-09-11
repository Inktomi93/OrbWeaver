import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import { runMarkerArg } from "@orb/tooling/_shared/run-marker";

const PROC_PID_RE = /^[0-9]+$/;
const PROC_PPID_RE = /^PPid:\s+([0-9]+)$/m;
const DEFAULT_SAMPLE_MS = 10;

export interface ChromiumIdentity {
  readonly pid: number;
  readonly startTime: string;
  readonly processGroup: number;
}

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

// /proc/<pid>/stat fields after the closing command parenthesis start at field 3 (state). Process group
// is field 5 and starttime is field 22. starttime makes a PID an identity instead of a reusable number.
function processIdentity(pid: number): ChromiumIdentity | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
    const processGroup = Number(fields[2]);
    const startTime = fields[19];
    if (!Number.isSafeInteger(processGroup) || startTime === undefined) {
      return null;
    }
    return { pid, processGroup, startTime };
  } catch {
    return null;
  }
}

/** Chromium identities that are descendants NOW. Call while the launcher is still alive. */
export function chromiumDescendantIdentities(rootPid: number): ChromiumIdentity[] {
  const descendants = descendantPids(rootPid, processParents());
  const identities: ChromiumIdentity[] = [];
  for (const pid of descendants) {
    if (pid === rootPid) {
      continue;
    }
    try {
      const executable = basename(readlinkSync(`/proc/${pid}/exe`));
      if (executable.includes("headless_shell") || executable.includes("chrome") || executable.includes("chromium")) {
        const identity = processIdentity(pid);
        if (identity !== null) {
          identities.push(identity);
        }
      }
    } catch {
      // Same process-exit race as the ancestry census.
    }
  }
  return identities;
}

/** Exact captured identities still alive, independent of their current parent and immune to PID reuse. */
export function livingChromiumIdentities(identities: readonly ChromiumIdentity[]): ChromiumIdentity[] {
  return identities.filter((identity) => processIdentity(identity.pid)?.startTime === identity.startTime);
}

export interface ChromiumWitness {
  readonly sample: () => void;
  readonly stop: () => readonly ChromiumIdentity[];
}

/** Poll descendants during an async CLI/launcher run; stopping returns every distinct identity observed. */
export function watchChromiumDescendants(rootPid: number, sampleMs = DEFAULT_SAMPLE_MS): ChromiumWitness {
  const observed = new Map<string, ChromiumIdentity>();
  const sample = (): void => {
    for (const identity of chromiumDescendantIdentities(rootPid)) {
      observed.set(`${identity.pid}:${identity.startTime}`, identity);
    }
  };
  sample();
  const timer = setInterval(sample, sampleMs);
  timer.unref();
  return {
    sample,
    stop(): readonly ChromiumIdentity[] {
      clearInterval(timer);
      sample();
      return [...observed.values()];
    },
  };
}

/** THE ARGS a simulated reparented-leak chromium must launch with (#1926). `marker === null` reproduces
 *  the shape that left 11 four-day-old orphans on the box on 2026-09-11: a detached grandchild chromium
 *  with no run-marker channel is invisible to `_shared/run-marker.ts`'s abandoned-run sweep in EITHER
 *  reader (its environ is erased by chromium's own process-title rewrite, and nothing stamped its argv),
 *  so if the fixture's own explicit `terminateChromiumIdentities` cleanup never runs — the test process is
 *  SIGKILLed, OOM-killed, or its worktree torn down mid-test — the leak is PERMANENT: no sweep, ever, can
 *  reach it. Stamping the marker gives the fixture the same reaping path every production launch already
 *  has, as defense-in-depth alongside (never instead of) its own cleanup. */
export function leakChromiumArgs(userDataDir: string, marker: string | null): readonly string[] {
  const base = ["--headless", "--no-sandbox", "--disable-gpu", `--user-data-dir=${userDataDir}`];
  return marker === null ? [...base, "about:blank"] : [...base, runMarkerArg(marker), "about:blank"];
}

/** Cleanup for planted leak controls: signal only captured, still-matching Chromium groups/identities. */
export function terminateChromiumIdentities(identities: readonly ChromiumIdentity[]): void {
  const living = livingChromiumIdentities(identities);
  const ownGroup = processIdentity(process.pid)?.processGroup;
  const groups = new Set(living.map((identity) => identity.processGroup));
  for (const group of groups) {
    if (group <= 1 || group === ownGroup) {
      continue;
    }
    try {
      process.kill(-group, "SIGTERM");
    } catch {
      // The exact captured group may finish while the planted-red assertion unwinds.
    }
  }
  for (const identity of living) {
    try {
      process.kill(identity.pid, "SIGTERM");
    } catch {
      // Same race for a Chromium process outside a distinct group.
    }
  }
}
