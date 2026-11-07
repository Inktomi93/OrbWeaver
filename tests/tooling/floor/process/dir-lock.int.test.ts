// The directory mutex holds against a holder that died, a holder whose pid was recycled, a failure that is not
// contention, and a crowd of waiters breaking one dead lock: a running holder is never entered beside.

import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { processStartTicks } from "@orb/tooling/floor/host/platform";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { DirLockTimeoutError, withDirLock } from "../../../../tooling/src/floor/process/dir-lock.ts";
import { scaledBudget } from "../../_load-budget.ts";

const DEAD_PID = 2_147_483_647;
const SHORT_WAIT_MS = 150;

function plantLock(path: string, record: string): void {
  mkdirSync(path);
  writeFileSync(join(path, "pid"), `${record}\n`);
}

test("a lock directory that cannot be created for a reason other than contention fails with that error, not a timeout", ({ scratch }) => {
  const notADirectory = join(scratch, "blocker");
  writeFileSync(notADirectory, "");
  let failure: unknown;
  try {
    withDirLock(join(notADirectory, "lock"), "the probe lock", () => "unreached", SHORT_WAIT_MS);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: "ENOTDIR" });
  expect(failure).not.toBeInstanceOf(DirLockTimeoutError);
});

test("a waiter does not judge a lock while another waiter holds the reaping guard, and takes it once the guard is gone", ({ scratch }) => {
  const lock = join(scratch, "probe.lock");
  plantLock(lock, String(DEAD_PID));
  const guard = `${lock}.reaping`;
  mkdirSync(guard);
  expect(() => withDirLock(lock, "the probe lock", () => "entered", SHORT_WAIT_MS)).toThrow(DirLockTimeoutError);
  expect(existsSync(lock)).toBe(true);
  expect(readFileSync(join(lock, "pid"), "utf8").trim()).toBe(String(DEAD_PID));
  utimesSync(guard, 0, 0);
  expect(withDirLock(lock, "the probe lock", () => "entered", scaledBudget(5000))).toBe("entered");
  expect(existsSync(guard)).toBe(false);
});

test("a running holder's lock is not broken, and a recorded start time that differs from the pid's current one is a recycled pid", ({ scratch }) => {
  const live = join(scratch, "live.lock");
  plantLock(live, String(process.pid));
  expect(() => withDirLock(live, "the probe lock", () => "entered", SHORT_WAIT_MS)).toThrow(DirLockTimeoutError);
  const ticks = processStartTicks(process.pid);
  if (ticks === null) {
    return;
  }
  const same = join(scratch, "same.lock");
  plantLock(same, `${process.pid} ${ticks}`);
  expect(() => withDirLock(same, "the probe lock", () => "entered", SHORT_WAIT_MS)).toThrow(DirLockTimeoutError);
  const recycled = join(scratch, "recycled.lock");
  plantLock(recycled, `${process.pid} ${ticks}0`);
  expect(withDirLock(recycled, "the probe lock", () => "entered", scaledBudget(5000))).toBe("entered");
});

test("an ownerless lock directory is broken only once it has aged", ({ scratch }) => {
  const lock = join(scratch, "ownerless.lock");
  mkdirSync(lock);
  expect(() => withDirLock(lock, "the probe lock", () => "entered", SHORT_WAIT_MS)).toThrow(DirLockTimeoutError);
  utimesSync(lock, 0, 0);
  expect(withDirLock(lock, "the probe lock", () => "entered", scaledBudget(5000))).toBe("entered");
});

// ── a crowd of waiters breaking ONE dead lock ───────────────────────────────────────────────────────────
//
// Every round seeds a lock whose holder is dead and lets all the children meet before they take it. A waiter that
// judged the dead holder, lost the break to a second waiter, and then broke the lock a third had just claimed let two
// children into the critical section; the dead-holder case is where that window exists, so each round plants it.

const CROWD_CHILD = `import { appendFileSync, mkdirSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [lockSrc, base, workers, rounds] = process.argv.slice(2);
const { withDirLock } = await import(pathToFileURL(lockSrc).href);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let round = 0; round < Number(rounds); round += 1) {
  const meet = join(base, "meet-" + round);
  mkdirSync(meet, { recursive: true });
  writeFileSync(join(meet, String(process.pid)), "");
  for (let spin = 0; spin < 5000 && readdirSync(meet).length < Number(workers); spin += 1) {
    wait(1);
  }
  try {
    withDirLock(join(base, "lock-" + round), "the crowd lock", () => {
      const inside = join(base, "inside-" + round);
      try {
        mkdirSync(inside);
      } catch {
        appendFileSync(join(base, "overlaps"), "round " + round + "\\n");
        return;
      }
      wait(10);
      rmdirSync(inside);
    }, 20000);
  } catch (error) {
    appendFileSync(join(base, "errors"), round + " " + error.message + "\\n");
  }
}
`;

const CROWD_WORKERS = 6;
const CROWD_ROUNDS = 30;

test("six waiters breaking one dead holder's lock never share the critical section", { timeout: scaledBudget(120_000) }, async ({ scratch, repoRoot }) => {
  const lockSource = join(repoRoot, "tooling", "src", "floor", "process", "dir-lock.ts");
  const child = join(scratch, "crowd-child.mjs");
  writeFileSync(child, CROWD_CHILD);
  for (let round = 0; round < CROWD_ROUNDS; round += 1) {
    plantLock(join(scratch, `lock-${String(round)}`), String(DEAD_PID));
  }
  const results = await Promise.all(
    Array.from({ length: CROWD_WORKERS }, () =>
      spawnNiced(process.execPath, [child, lockSource, scratch, String(CROWD_WORKERS), String(CROWD_ROUNDS)], { timeoutMs: scaledBudget(100_000) }),
    ),
  );
  expect(results.map((result) => `exit ${String(result.code)} ${result.stderr.trim()}`)).toEqual(Array.from({ length: CROWD_WORKERS }, () => "exit 0 "));
  expect(existsSync(join(scratch, "errors")) ? readFileSync(join(scratch, "errors"), "utf8") : "").toBe("");
  expect(existsSync(join(scratch, "overlaps")) ? readFileSync(join(scratch, "overlaps"), "utf8") : "").toBe("");
});
