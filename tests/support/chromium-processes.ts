// The chromium processes a test's launcher left behind, read through the platform module: a descendant
// census keyed on the command line, which the run-marker argument makes unique per launch, so a pid the OS
// reuses never reads as the browser that carried it.
import process from "node:process";
import { listProcesses, processGroupId, processInfo } from "@orb/tooling/_shared/platform";
import { runMarkerArg } from "@orb/tooling/_shared/run-marker";

// One sample is a full process-table read (tens of ms under load); a shorter interval starves the test's
// own event loop, and a leaked chromium stays a descendant for far longer than this.
const DEFAULT_SAMPLE_MS = 50;
const CHROMIUM_RE = /headless_shell|chrome|chromium/u;

export interface ChromiumIdentity {
  readonly pid: number;
  /** The command line as launched; with the run marker in it, unique per browser process. */
  readonly cmdline: string;
}

export function identityKey(identity: ChromiumIdentity): string {
  return `${String(identity.pid)}:${identity.cmdline}`;
}

/** Chromium identities that are descendants NOW. Call while the launcher is still alive. */
export function chromiumDescendantIdentities(rootPid: number): ChromiumIdentity[] {
  const entries = listProcesses();
  const children = new Map<number, number[]>();
  const byPid = new Map(entries.map((entry) => [entry.pid, entry] as const));
  for (const entry of entries) {
    if (entry.ppid !== null) {
      children.set(entry.ppid, [...(children.get(entry.ppid) ?? []), entry.pid]);
    }
  }
  const identities: ChromiumIdentity[] = [];
  const queue = [rootPid];
  const seen = new Set<number>([rootPid]);
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (seen.has(child)) {
        continue;
      }
      seen.add(child);
      queue.push(child);
      const entry = byPid.get(child);
      if (entry !== undefined && CHROMIUM_RE.test(entry.cmdline)) {
        identities.push({ pid: child, cmdline: entry.cmdline });
      }
    }
  }
  return identities;
}

/** Exact captured identities still alive, independent of their current parent and immune to PID reuse. */
export function livingChromiumIdentities(identities: readonly ChromiumIdentity[]): ChromiumIdentity[] {
  return identities.filter((identity) => processInfo(identity.pid)?.cmdline === identity.cmdline);
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
      observed.set(identityKey(identity), identity);
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

function signalQuietly(target: number, signal: NodeJS.Signals): void {
  try {
    process.kill(target, signal);
  } catch {
    // The exact captured process or group may finish while the planted-red assertion unwinds.
  }
}

/** Cleanup for planted leak controls: signal only captured, still-matching Chromium groups/identities. */
export function terminateChromiumIdentities(identities: readonly ChromiumIdentity[]): void {
  const living = livingChromiumIdentities(identities);
  const ownGroup = processGroupId(process.pid);
  const groups = new Set(living.map((identity) => processGroupId(identity.pid)).filter((group): group is number => group !== null));
  for (const group of groups) {
    if (group <= 1 || group === ownGroup) {
      continue;
    }
    signalQuietly(-group, "SIGTERM");
  }
  for (const identity of living) {
    signalQuietly(identity.pid, "SIGTERM");
  }
}
