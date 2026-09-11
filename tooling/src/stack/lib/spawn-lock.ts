// ── spawn-lock: the filesystem half of the prod spawn window ─────────────────────────────────────────
//
// WHY IT IS ITS OWN MODULE: `tooling/src/stack/ops/prod.ts` is an executable script — it ends in
// `process.exit(await main())`, so importing it to test anything RUNS it. The lock's fs mechanics are
// exactly the part that needs a test with real files on disk (a decision table cannot prove that a stale
// lock is actually UNLINKED), so they live here, importable and side-effect-free at module scope. The
// DECISIONS stay pure in `./stack-mode.ts` (`parseLockHolder` / `decideSpawnLock`).
//
// WHAT IT PROTECTS: the adopt/refuse decision and the spawn are separate syscalls, so two `up prod` runs
// can both read "the port is free" and both spawn. The loser dies on EADDRINUSE — but only after its
// pidfile write clobbered the winner's record. `wx` (exclusive create) is the atomic take; the same shape
// `tooling/src/stack/ops/engines.ts` uses for its adopt window, which paid for this class with a duplicate vLLM
// fleet holding ~17GiB and serving nothing.
//
// `isAlive` is INJECTED rather than calling `process.kill(pid, 0)` directly — that is what lets a test
// drive the live-holder arm without a real process, and it keeps the "is 0 a pid" question (it is not,
// see parseLockHolder) out of this file entirely.

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { decideSpawnLock, lockHolderText, parseLockHolder } from "./prod-record.ts";

// Two takes: one for the clean case, one after breaking a lock whose holder is gone or unreadable.
const LOCK_TAKE_ATTEMPTS = 2;

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** kill(2) liveness: ESRCH is absent, EPERM proves a live process we may not signal, everything else is an
 * operator/tool failure rather than permission to break its lock. The signal door is injectable for proof. */
export function pidIsAlive(pid: number, signal: (pid: number, signal: 0) => void = process.kill): boolean {
  try {
    signal(pid, 0);
    return true;
  } catch (error) {
    if (errnoIs(error, "ESRCH")) {
      return false;
    }
    if (errnoIs(error, "EPERM")) {
      return true;
    }
    throw error;
  }
}

export interface SpawnLockOpts {
  readonly lockPath: string;
  /** The pid written into the lock file — the launcher's own. */
  readonly selfPid: number;
  /** Liveness probe for a parsed holder pid. Injected; see the header. */
  readonly isAlive: (pid: number) => boolean;
  readonly log: (message: string) => void;
}

/** Take the lock, or report why not. `false` means "another launcher owns the spawn window" — the caller
 *  must treat that as a no-op, never as a reason to spawn anyway. */
export function acquireSpawnLock(opts: SpawnLockOpts): boolean {
  mkdirSync(dirname(opts.lockPath), { recursive: true });
  for (let attempt = 0; attempt < LOCK_TAKE_ATTEMPTS; attempt += 1) {
    if (takeSpawnLock(opts)) {
      return true;
    }
    if (!handleHeldSpawnLock(opts)) {
      return false;
    }
  }
  opts.log("could not take the spawn lock after breaking a stale one — another launcher won the race; no-op.");
  return false;
}

/** The atomic take. `wx` fails if the file exists — that failure IS the mutual exclusion. */
function takeSpawnLock(opts: SpawnLockOpts): boolean {
  try {
    writeFileSync(opts.lockPath, `${opts.selfPid}\n`, { flag: "wx" });
    return true;
  } catch (error) {
    if (errnoIs(error, "EEXIST")) {
      return false;
    }
    throw error;
  }
}

/** Something holds the lock. Returns true to retry the take, false to give up (a LIVE holder owns it).
 *  Exported for its own test: the stale arms must be proven to actually remove the file. */
export function handleHeldSpawnLock(opts: SpawnLockOpts): boolean {
  let raw: string | null = null;
  // @orb-waive caught-failure-ownership(error): ENOENT alone is the racing-release state and the following exclusive create decides ownership; other reads throw. Ends if no retry follows.
  try {
    raw = readFileSync(opts.lockPath, "utf8");
  } catch (error) {
    if (!errnoIs(error, "ENOENT")) {
      throw error;
    }
    raw = null;
  }
  const holder = parseLockHolder(raw);
  const alive = holder.kind === "pid" && opts.isAlive(holder.pid);
  const action = decideSpawnLock(holder, alive);
  if (action === "refuse") {
    opts.log(`another launcher (${lockHolderText(holder)}) is mid-spawn — this up is a no-op. Re-run when it finishes, or check \`stack status prod\`.`);
    return false;
  }
  if (action === "break-stale") {
    opts.log(`breaking a stale spawn lock (${lockHolderText(holder)}).`);
    // @orb-waive caught-failure-ownership(error): ENOENT alone means another launcher won the unlink race; the next exclusive create decides ownership. Ends if no retry follows.
    try {
      unlinkSync(opts.lockPath);
    } catch (error) {
      if (!errnoIs(error, "ENOENT")) {
        throw error;
      }
    }
  }
  return true;
}

export function releaseSpawnLock(lockPath: string): void {
  // @orb-waive caught-failure-ownership(error): ENOENT is idempotent release; every other unlink failure is rethrown. Ends if release gains an ownership-transfer acknowledgement.
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (!errnoIs(error, "ENOENT")) {
      throw error;
    }
  }
}
