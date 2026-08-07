// Real-filesystem tests for the prod spawn lock (scripts/dev/_kit/spawn-lock.ts).
//
// WHY REAL FILES: `decideSpawnLock` is a decision table, and a decision table cannot prove that a stale
// lock is actually UNLINKED. Both wedge shapes below end in "…and then the file is gone", which is a
// claim about the disk. `isAlive` is injected so the live-holder arm needs no real process, and the lock
// path is a per-test tmpdir so nothing touches `.cache/stack`.
//
// THE TWO SHAPES (found by review, unreachable through the tested paths — these pins are the proof):
//   1. an EMPTY lock file → `Number("")` is 0 → `process.kill(0, 0)` signals the caller's own process
//      GROUP and always succeeds → "a live launcher holds it" → `up prod` no-ops FOREVER.
//   2. NON-NUMERIC content → NaN → the old verdict was `retake`, but the file still existed, so the
//      retry's `wx` failed again and the loop gave up. The lock was never removed.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnLockOpts } from "../../scripts/dev/_kit/spawn-lock.ts";
import { acquireSpawnLock, handleHeldSpawnLock, releaseSpawnLock } from "../../scripts/dev/_kit/spawn-lock.ts";
import { expect, test } from "../support/fixtures.ts";

const SELF_PID = 1234;
const HOLDER_PID = 4242;

function lockDir(): string {
  return mkdtempSync(join(tmpdir(), "orb-spawn-lock-"));
}

function opts(dir: string, isAlive: (pid: number) => boolean, lines: string[] = []): SpawnLockOpts {
  return { lockPath: join(dir, "prod.spawn.lock"), selfPid: SELF_PID, isAlive, log: (m) => lines.push(m) };
}

const never = (): boolean => false;
const always = (): boolean => true;

test("a free lock is taken, records the launcher's pid, and is released", () => {
  const dir = lockDir();
  try {
    const o = opts(dir, never);
    expect(acquireSpawnLock(o)).toBe(true);
    expect(readFileSync(o.lockPath, "utf8").trim()).toBe(String(SELF_PID));
    releaseSpawnLock(o.lockPath);
    expect(existsSync(o.lockPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a LIVE holder is refused, and its lock file survives untouched", () => {
  const dir = lockDir();
  try {
    const lines: string[] = [];
    const o = opts(dir, always, lines);
    writeFileSync(o.lockPath, `${HOLDER_PID}\n`);
    expect(acquireSpawnLock(o)).toBe(false);
    // The winner's lock must NOT be broken by the loser.
    expect(readFileSync(o.lockPath, "utf8").trim()).toBe(String(HOLDER_PID));
    expect(lines.join(" ")).toContain("mid-spawn");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a DEAD holder's lock is broken and the lock is then taken", () => {
  const dir = lockDir();
  try {
    const o = opts(dir, never);
    writeFileSync(o.lockPath, `${HOLDER_PID}\n`);
    expect(acquireSpawnLock(o)).toBe(true);
    expect(readFileSync(o.lockPath, "utf8").trim()).toBe(String(SELF_PID));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an EMPTY lock file is BROKEN and retaken — never read as a live pid 0", () => {
  const dir = lockDir();
  try {
    const lines: string[] = [];
    // `always` is the hostile setting: even if the injected probe would call everything alive, an
    // unparseable holder must not survive. (Under the defect, pid 0 probed as alive and wedged here.)
    const o = opts(dir, always, lines);
    writeFileSync(o.lockPath, "");
    expect(acquireSpawnLock(o)).toBe(true);
    expect(readFileSync(o.lockPath, "utf8").trim()).toBe(String(SELF_PID));
    expect(lines.join(" ")).toContain("breaking a stale spawn lock");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a NON-NUMERIC lock file is actually UNLINKED, not merely retried", () => {
  const dir = lockDir();
  try {
    const o = opts(dir, always);
    writeFileSync(o.lockPath, "garbage\n");
    // handleHeldSpawnLock directly: the claim under test is about the disk, not the return value.
    expect(handleHeldSpawnLock(o)).toBe(true);
    expect(existsSync(o.lockPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("whitespace-only content is stale too, and the whole acquire recovers", () => {
  const dir = lockDir();
  try {
    const o = opts(dir, always);
    writeFileSync(o.lockPath, "   \n");
    expect(acquireSpawnLock(o)).toBe(true);
    expect(readFileSync(o.lockPath, "utf8").trim()).toBe(String(SELF_PID));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a lock file that VANISHES mid-read is simply retaken", () => {
  const dir = lockDir();
  try {
    const o = opts(dir, always);
    // No file at all — handleHeldSpawnLock's read throws, which is the racing-release path.
    expect(handleHeldSpawnLock(o)).toBe(true);
    expect(existsSync(o.lockPath)).toBe(false);
    expect(acquireSpawnLock(o)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
