// The mkdir-based mutex the stage band table, the session boot reservation and the artifact alias publication
// share (mkdir is atomic on every filesystem we run on). A dead holder's lock is reaped; an ownerless directory
// is reaped only after `LOCK_STALE_MS`, because mkdir and the holder's pid write are separate operations. A live
// holder is never stolen: a waiter that exhausts its budget throws.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pidAlive } from "../artifacts/run-retention.ts";
import { waitSync } from "./sync-sleep.ts";

/** An ownerless lock directory may be reaped after this age. A live holder is never stolen. */
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 25;
/** The wait budget every caller starts from. */
export const DIR_LOCK_WAIT_MS = 5000;

/** Thrown when the wait budget is spent with a live (or still-fresh) holder in place. */
export class DirLockTimeoutError extends Error {}

function lockHolderPid(path: string): number | null {
  // optional-read-as-absent — an unreadable holder file means "I cannot identify the holder", which the age check below then judges. Ends if a lock ever carries state beyond its holder pid.
  try {
    const pid = Number(readFileSync(join(path, "pid"), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Monotonic per-process tie-breaker so two releases of the same lock PATH inside one process (e.g.
 *  successive test cases sharing a pid) never rename to the same `.releasing-*` name. */
let releaseSeq = 0;

/** Physically release a lock directory: RENAME it off its live name first, then remove the renamed copy.
 *  The rename is the atomic step (#1732) — a concurrent `mkdirSync(path)` either lands on the fresh
 *  (post-rename) name outright, or still sees the live directory and fails EEXIST; it can never observe
 *  a half-removed directory. Before this, `rmSync(path, { recursive: true, force: true })` ran directly
 *  against the LIVE name: its internal readdir→unlink→rmdir sequence is not atomic against a concurrent
 *  write into that same still-live path, and a waiter that recreated `pid` in that window (a false-stale
 *  break, or the "give up waiting" takeover below) made the rmdir see a non-empty directory and throw
 *  ENOTEMPTY out of the holder's own release.
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

function breakStaleLock(path: string): void {
  const pid = lockHolderPid(path);
  if (pid !== null) {
    if (!pidAlive(pid)) {
      releaseLockDir(path);
    }
    return;
  }
  // mkdir and writing pid are separate operations: another allocator may see this directory in between.
  // a removed lock is already free; its next claimant retries mkdir.
  try {
    if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
      releaseLockDir(path);
    }
  } catch {
    // Empty: see the cleanup explanation above.
  }
}

/** Run `fn` holding the mutex at `path`. Reap a dead holder or an aged ownerless directory, but refuse
 *  after `waitMs` rather than allowing two live processes into the critical section. `what` names the lock
 *  in the timeout. */
export function withDirLock<T>(path: string, what: string, fn: () => T, waitMs: number = DIR_LOCK_WAIT_MS): T {
  const deadline = Date.now() + waitMs;
  for (;;) {
    // a held or unwritable lock is retried until the deadline, then withDirLock throws the timeout. Ends if the loop stops throwing at the deadline.
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), `${process.pid}\n`);
      break;
    } catch {
      // Held (or unwritable): judge the holder, then wait a beat.
    }
    breakStaleLock(path);
    if (Date.now() > deadline) {
      throw new DirLockTimeoutError(`timed out waiting for ${what} at ${path}`);
    }
    waitSync(LOCK_POLL_MS);
  }
  try {
    return fn();
  } finally {
    if (lockHolderPid(path) === process.pid) {
      releaseLockDir(path);
    }
  }
}
