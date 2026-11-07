// The mkdir-based mutex the stage band table, the session boot reservation and the artifact alias publication share.
// One waiter at a time judges the holder: a lock whose process is gone is broken, an ownerless directory only after
// `LOCK_STALE_MS`. A waiter that spends its budget throws; it never enters beside a running holder.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pidAlive } from "../artifacts/run-retention.ts";
import { isExistingEntryError, isMissingEntryError } from "../host/errno.ts";
import { processStartTicks } from "../host/platform.ts";
import { waitSync } from "./sync-sleep.ts";

/** An ownerless lock directory, or a reaper's guard, may be broken after this age. */
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 25;
/** The wait budget every caller starts from. */
export const DIR_LOCK_WAIT_MS = 5000;
const REAPING_SUFFIX = ".reaping";

/** Thrown when the wait budget is spent with a running (or still-fresh) holder in place. */
export class DirLockTimeoutError extends Error {}

interface Holder {
  readonly pid: number;
  /** The kernel start time recorded beside the pid, where the platform has one; null otherwise. */
  readonly start: string | null;
}

function lockHolder(path: string): Holder | null {
  // optional-read-as-absent — an unreadable holder file means "I cannot identify the holder", which the age check below then judges. Ends if a lock ever carries state beyond its holder.
  try {
    const [pidText, start] = readFileSync(join(path, "pid"), "utf8").trim().split(/\s+/u);
    const pid = Number(pidText);
    return Number.isInteger(pid) && pid > 0 ? { pid, start: start ?? null } : null;
  } catch {
    return null;
  }
}

// A recycled pid is a different process: the start time recorded at claim tells the holder from its successor.
const holderRunning = ({ pid, start }: Holder): boolean => pidAlive(pid) && (start === null || processStartTicks(pid) === start);

function holderRecord(): string {
  const start = processStartTicks(process.pid);
  return `${process.pid}${start === null ? "" : ` ${start}`}\n`;
}

/** Monotonic per-process tie-breaker so two releases of the same lock PATH inside one process (e.g.
 *  successive test cases sharing a pid) never rename to the same `.releasing-*` name. */
let releaseSeq = 0;

/** Physically release a lock directory: RENAME it off its live name first, then remove the renamed copy.
 *  The rename is the atomic step (#1732) — a concurrent `mkdirSync(path)` either lands on the fresh
 *  (post-rename) name outright, or still sees the live directory and fails EEXIST; it can never observe
 *  a half-removed directory. Before this, `rmSync(path, { recursive: true, force: true })` ran directly
 *  against the LIVE name: its internal readdir→unlink→rmdir sequence is not atomic against a concurrent
 *  write into that same still-live path, and a waiter that recreated `pid` in that window made the rmdir
 *  see a non-empty directory and throw ENOTEMPTY out of the holder's own release.
 *  `onRenamed` is a TEST SEAM ONLY, firing after the rename and before the removal so a suite can plant
 *  that exact race deterministically instead of chasing real OS-level timing — no production caller
 *  passes it. */
export function releaseLockDir(path: string, onRenamed?: () => void): void {
  releaseSeq += 1;
  const releasing = `${path}.releasing-${process.pid}-${releaseSeq}`;
  // the rename target is already gone — someone
  // else's break or release beat us to it — which means there is nothing left for THIS caller to remove.
  // Ends if this ever stops being a "someone else already finished the job" race.
  try {
    renameSync(path, releasing);
  } catch {
    return;
  }
  onRenamed?.();
  rmSync(releasing, { recursive: true, force: true });
}

const ageMs = (path: string): number => Date.now() - statSync(path).mtimeMs;

// Whether a directory is older than the stale age; a directory that vanished while it was asked about has no age to judge.
function aged(path: string): boolean {
  try {
    return ageMs(path) > LOCK_STALE_MS;
  } catch (error) {
    if (isMissingEntryError(error)) {
      return false;
    }
    throw error;
  }
}

// Judging a holder and breaking its lock are two steps, and between them another waiter can break the same lock and a
// third can claim it fresh: a waiter holding a stale judgement would then break a live lock. The guard directory makes
// the judgement and the break one step, so a waiter that finds the guard taken waits its turn instead of judging.
function claimGuard(guard: string): boolean {
  try {
    mkdirSync(guard);
    return true;
  } catch (error) {
    if (!isExistingEntryError(error)) {
      throw error;
    }
    // a reaper that died inside its step leaves the guard behind
    if (aged(guard)) {
      releaseLockDir(guard);
    }
    return false;
  }
}

function breakStaleLock(path: string): void {
  const guard = `${path}${REAPING_SUFFIX}`;
  if (!claimGuard(guard)) {
    return;
  }
  try {
    const holder = lockHolder(path);
    // mkdir and writing pid are separate operations: another claimant may be between them, so an ownerless directory is judged by age.
    if (holder === null ? aged(path) : !holderRunning(holder)) {
      releaseLockDir(path);
    }
  } finally {
    rmSync(guard, { recursive: true, force: true });
  }
}

// Take the directory: false when it is already taken, a throw for any other failure (a read-only parent is not contention).
function claim(path: string): boolean {
  try {
    mkdirSync(path);
  } catch (error) {
    if (isExistingEntryError(error)) {
      return false;
    }
    throw error;
  }
  try {
    writeFileSync(join(path, "pid"), holderRecord());
  } catch (error) {
    releaseLockDir(path);
    throw error;
  }
  return true;
}

/** Run `fn` holding the mutex at `path`. Break the lock of a gone holder or an aged ownerless directory, but throw
 *  after `waitMs` rather than allow two running processes into the critical section. `what` names the lock in the
 *  timeout. */
export function withDirLock<T>(path: string, what: string, fn: () => T, waitMs: number = DIR_LOCK_WAIT_MS): T {
  const deadline = Date.now() + waitMs;
  while (!claim(path)) {
    breakStaleLock(path);
    if (Date.now() > deadline) {
      throw new DirLockTimeoutError(`timed out waiting for ${what} at ${path}`);
    }
    waitSync(LOCK_POLL_MS);
  }
  try {
    return fn();
  } finally {
    if (lockHolder(path)?.pid === process.pid) {
      releaseLockDir(path);
    }
  }
}
