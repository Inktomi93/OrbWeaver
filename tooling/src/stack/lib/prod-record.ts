// The pidfile record codec + the spawn-lock decisions. Both exist because two `up prod` runs can race:
// the adopt/refuse decision and the spawn are separate syscalls, so both can read "port free" and both
// spawn. The loser dies on EADDRINUSE — but only after clobbering the winner's pidfile.
import type { LockHolder, ProdRecord, SpawnLockAction } from "../contract/types.ts";

export function serializeProdRecord(record: ProdRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Parse a pidfile. A truncated/garbage file (a killed mid-write) is `null` — treated as "no record",
 *  never as a crash, exactly like snap-stage's `readActive`. */
export function parseProdRecord(text: string): ProdRecord | null {
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): malformed pidfile JSON returns null and identity classification refuses any unproven live process. Ends if null can authorize a signal.
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const r = parsed as Partial<Record<keyof ProdRecord, unknown>>;
  if (r.mode !== "prod" || typeof r.pid !== "number" || typeof r.port !== "number") {
    return null;
  }
  return {
    mode: "prod",
    pid: r.pid,
    pgid: typeof r.pgid === "number" ? r.pgid : r.pid,
    port: r.port,
    startedAt: typeof r.startedAt === "string" ? r.startedAt : "",
    debug: r.debug === true,
    repoRoot: typeof r.repoRoot === "string" ? r.repoRoot : "",
    logPath: typeof r.logPath === "string" ? r.logPath : "",
  };
}

/** Read the lock file's content into a `LockHolder`. `null` raw = the read threw (file gone).
 *
 *  THE TRAP THIS CLOSES: the old code did `Number(readFileSync(...).trim())` and fed the result straight
 *  to a liveness probe. `Number("") === 0`, and **`process.kill(0, 0)` signals the caller's own process
 *  GROUP, so it always succeeds** — an empty lock file therefore read as "a live launcher (pid 0) holds
 *  the lock", and `up prod` became a permanent no-op until a human deleted the file. `0` is never a pid
 *  here; neither is a negative number (that is a process GROUP in kill(2)) nor a fractional value. */
export function parseLockHolder(raw: string | null): LockHolder {
  if (raw === null) {
    return { kind: "vanished" };
  }
  const trimmed = raw.trim();
  const pid = Number(trimmed);
  if (trimmed.length === 0 || !Number.isInteger(pid) || pid <= 0) {
    return { kind: "unparseable", raw: trimmed };
  }
  return { kind: "pid", pid };
}

/** The action after the atomic `wx` create FAILED — somebody, or something, holds the lock.
 *
 *  An UNPARSEABLE holder is a STALE lock, never a live one: nobody can be waited on, so the only
 *  non-wedging move is to break it loudly and retake. (It used to return `retake`, which left the file in
 *  place — the retry's `wx` failed again and the loop gave up, so the lock was never removed and every
 *  later `up prod` no-opped too.) */
export function decideSpawnLock(holder: LockHolder, holderAlive: boolean): SpawnLockAction {
  switch (holder.kind) {
    case "vanished":
      return "retake";
    case "unparseable":
      return "break-stale";
    // Enumerated, not `default:` (§5.5) — a new holder kind must fail the compile here, not inherit
    // the live-pid arm.
    case "pid":
      return holderAlive ? "refuse" : "break-stale";
  }
}

/** How a holder is named in an operator-facing log line. */
export function lockHolderText(holder: LockHolder): string {
  switch (holder.kind) {
    case "vanished":
      return "none (the lock file vanished mid-read)";
    case "unparseable":
      return `unparseable content ${JSON.stringify(holder.raw)}`;
    case "pid":
      return `pid ${holder.pid}`;
  }
}

/** May THIS launcher delete the pidfile after its own spawn failed?
 *
 *  ONLY when the record on disk is still the one it wrote. Two overlapping `up prod` runs race: the
 *  loser's child dies on EADDRINUSE, and an UNCONDITIONAL unlink on that failure path would delete the
 *  WINNER's record — after which `down prod` reads no record, classifies the live instance as `foreign`,
 *  and REFUSES to stop the very server this tool started. */
export function mayRemovePidfile(record: ProdRecord | null, myChildPid: number): boolean {
  return record !== null && record.pid === myChildPid;
}
