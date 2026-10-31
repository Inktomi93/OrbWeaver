// The run-owned OS temp root. A process that starts tests or browsers points TMPDIR, TMP and TEMP at a
// folder it owns and removes it when it ends, so everything below it (Chromium profiles, mkdtemp folders a
// killed test never reached its cleanup for) goes with it.
// A SIGKILLed or timed-out run cannot clean up, so the next acquire sweeps run folders whose owner is gone.
// A folder is swept only when its owning pid (in its name) is dead or has been reused: a live owner's is never touched.
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pidAlive } from "../artifacts/run-retention.ts";
import { processStartTicks } from "../host/platform.ts";
import { exportProcessEnv, processEnvValue } from "./process-env.ts";

/** The OS temp folder the run folders live in. A child that outlives its parent reads it from here, so its
 *  own run folder is a sibling of the parent's, never inside the folder the parent deletes. */
export const RUN_TEMP_BASE_ENV = "ORB_RUN_TEMP_BASE";
const TEMP_ENV_KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
const RUN_DIR_PREFIX = "orb-run-";
const RUN_DIR_NAME = /^orb-run-(\d+)-/u;
const OWNER_FILE = ".owner";
const REMOVE_RETRIES = 3;
const REMOVE_RETRY_MS = 50;

interface OwnerRecord {
  readonly pid: number;
  readonly startTicks: string | null;
}

export interface RunTempRoot {
  readonly path: string;
  /** Removes the folder and points the temp variables back at the base. Idempotent. */
  readonly release: () => void;
}

let held: RunTempRoot | undefined;

/** The OS temp folder, as it was before any run folder redirected it. For a path that must outlive the run
 *  and be shared with other processes. */
export function runTempBase(): string {
  const declared = processEnvValue(RUN_TEMP_BASE_ENV);
  return declared === undefined || declared === "" ? tmpdir() : declared;
}

function removeTree(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: REMOVE_RETRIES, retryDelay: REMOVE_RETRY_MS });
}

function readOwner(directory: string): OwnerRecord | null {
  // A folder with no readable owner file is mid-creation or foreign; the pid in its name alone decides.
  try {
    return JSON.parse(readFileSync(join(directory, OWNER_FILE), "utf8")) as OwnerRecord;
  } catch {
    return null;
  }
}

function ownerIsLive(directory: string, pid: number): boolean {
  if (!pidAlive(pid)) {
    return false;
  }
  const recorded = readOwner(directory)?.startTicks ?? null;
  // A reused pid has a different start time than the process that made the folder.
  return recorded === null || processStartTicks(pid) === recorded;
}

/** Remove every run folder under `base` whose owner is gone. Returns the removed paths. */
export function sweepAbandonedRunRoots(base: string): readonly string[] {
  const uid = process.getuid?.();
  const removed: string[] = [];
  for (const name of readdirSync(base)) {
    const match = RUN_DIR_NAME.exec(name);
    if (match === null) {
      continue;
    }
    const path = join(base, name);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory() || (uid !== undefined && stat.uid !== uid)) {
      continue;
    }
    const pid = Number(match[1]);
    if (pid === process.pid || ownerIsLive(path, pid)) {
      continue;
    }
    removeTree(path);
    removed.push(path);
  }
  return removed;
}

/** Make this process own a fresh run folder and point the temp variables at it. Sweeps abandoned ones first.
 *  A second call in the same process returns the folder already held. */
export function acquireRunTempRoot(): RunTempRoot {
  if (held !== undefined) {
    return held;
  }
  const base = runTempBase();
  sweepAbandonedRunRoots(base);
  const path = mkdtempSync(join(base, `${RUN_DIR_PREFIX}${String(process.pid)}-`));
  writeFileSync(join(path, OWNER_FILE), JSON.stringify({ pid: process.pid, startTicks: processStartTicks(process.pid) } satisfies OwnerRecord));
  const previous = TEMP_ENV_KEYS.map((key) => [key, processEnvValue(key)] as const);
  for (const key of TEMP_ENV_KEYS) {
    exportProcessEnv(key, path);
  }
  exportProcessEnv(RUN_TEMP_BASE_ENV, base);
  const onExit = (): void => removeTree(path);
  process.once("exit", onExit);
  const root: RunTempRoot = {
    path,
    release: (): void => {
      if (held !== root) {
        return;
      }
      held = undefined;
      process.off("exit", onExit);
      for (const [key, value] of previous) {
        exportProcessEnv(key, value ?? base);
      }
      removeTree(path);
    },
  };
  held = root;
  return root;
}
