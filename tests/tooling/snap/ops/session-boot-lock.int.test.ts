// The session registry's boot mutex is bounded and owner-aware. A lock whose holder died, or that was
// created and never stamped, must not wedge every cold boot: a synchronous spin has no deadline, so the
// abandoned-lock cases run in a child process that the runner can kill, and a hang reads as a failure.

import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { REPO_ROOT } from "@orb/tooling/floor/artifacts/artifacts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { reserveSessionBoot } from "../../../../tooling/src/snap/ops/session-registry.ts";
import { scaledBudget } from "../../_load-budget.ts";

const REGISTRY_SRC = join(REPO_ROOT, "tooling/src/snap/ops/session-registry.ts");
const CHILD_BUDGET_MS = scaledBudget(20_000, 4);
const TEST_BUDGET_MS = CHILD_BUDGET_MS + scaledBudget(5000);
const LIVE_HOLDER_WAIT_MS = 150;
const DEAD_PID = "2147483647\n";

function lockDirOf(home: string): string {
  const lockDir = join(home, ".boot.lock");
  mkdirSync(lockDir, { recursive: true });
  return lockDir;
}

/** Reserve through the shipped registry in a killable child, so an unbounded wait fails instead of wedging the runner. */
async function reserveInChild(scratch: string, home: string): Promise<{ readonly stdout: string; readonly code: number | null }> {
  const path = join(scratch, "reserve-child.ts");
  writeFileSync(
    path,
    `import { reserveSessionBoot } from ${JSON.stringify(REGISTRY_SRC)};\nconsole.log(reserveSessionBoot(${JSON.stringify(home)}, "child", 1));\n`,
  );
  const res = await spawnNiced("node", [path], { timeoutMs: CHILD_BUDGET_MS });
  return { stdout: `${res.stdout}${res.stderr}`, code: res.code };
}

test("a boot lock whose holder died is reclaimed and the boot reserves", { timeout: TEST_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "registry");
  writeFileSync(join(lockDirOf(home), "pid"), DEAD_PID);

  const res = await reserveInChild(scratch, home);

  expect(res.code, res.stdout).toBe(0);
  expect(res.stdout).toContain("reserved");
  expect(existsSync(join(home, ".boot.lock"))).toBe(false);
});

test("an ownerless boot lock that has aged is reclaimed and the boot reserves", { timeout: TEST_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "registry");
  utimesSync(lockDirOf(home), new Date(0), new Date(0));

  const res = await reserveInChild(scratch, home);

  expect(res.code, res.stdout).toBe(0);
  expect(res.stdout).toContain("reserved");
});

test("an ownerless boot lock that is fresh is still held: it may be mid-creation", ({ scratch }) => {
  const home = join(scratch, "registry");
  lockDirOf(home);

  expect(reserveSessionBoot(home, "waiter", 1, LIVE_HOLDER_WAIT_MS)).toBe("locked");
  expect(existsSync(join(home, ".boot.lock"))).toBe(true);
});

test("a live holder is never stolen: the waiter refuses once its budget is spent", ({ scratch }) => {
  const home = join(scratch, "registry");
  writeFileSync(join(lockDirOf(home), "pid"), `${process.pid}\n`);

  expect(reserveSessionBoot(home, "waiter", 1, LIVE_HOLDER_WAIT_MS)).toBe("locked");
  expect(readFileSync(join(home, ".boot.lock", "pid"), "utf8")).toBe(`${process.pid}\n`);
});

test("under cap one the first boot reserves and the second is refused for the cap", ({ scratch }) => {
  const home = join(scratch, "registry");
  mkdirSync(home, { recursive: true });

  expect(reserveSessionBoot(home, "first", 1)).toBe("reserved");
  expect(reserveSessionBoot(home, "second", 1)).toBe("cap");
  expect(reserveSessionBoot(home, "first", 2)).toBe("name");
  expect(existsSync(join(home, ".boot.lock"))).toBe(false);
});
