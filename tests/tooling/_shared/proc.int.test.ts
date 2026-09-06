// THE DEADLINE PINS for the two async spawn doors (#1508). `proc.test.ts` mocks `node:child_process` to
// pin signal OWNERSHIP; this file spawns REAL children with REAL descendants, because the two defects
// here are only visible in the process tree:
//
//   1. `spawnNicedTranscript` had NO timeout at all — the promise settled only on `error`/`close`, so one
//      wedged stage hung the entire `pnpm verify` run forever, with no verdict and no artifact.
//   2. `spawnNiced`'s timeout called `child.kill("SIGKILL")` on the DIRECT child of a non-detached spawn,
//      so a command that forks descendants left them RUNNING after the caller had already seen
//      `timedOut: true` — orphans that go on to pollute a later run's measurements.
//
// Every child here is a `node -e` hang in its own group, torn down in `finally`; nothing touches the dev
// stack, a port, or the engines.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { spawnNiced, spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// WALL CLOCK, through ONE door: the subject of the arms below is a real deadline settling on real time (a
// socket that says nothing, a child that hangs) — there is no clock to inject into the other side.
// @orb-gate-ignore test-determinism: the SUBJECT is a real deadline measured on real time — the far side (a mute socket / a hung child) has no injectable clock
const wallNowMs = (): number => Date.now();

/** The child body: fork a DESCENDANT, publish both pids, then hang forever. The descendant is spawned
 *  WITHOUT `detached`, so it inherits the child's process group — which is exactly the tree a
 *  direct-child-only kill leaves behind. */
function hangWithDescendant(outFile: string): string {
  return [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    "const kid = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1e9)'], { stdio: 'ignore' });",
    `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ parent: process.pid, kid: kid.pid }));`,
    "setInterval(() => undefined, 1e9);",
  ].join("\n");
}

/** The child needs a resolvable PATH for `nice` and NOTHING else — the CAPTURE_OPTS spelling from
 *  `tests/tooling/verify/ops/run.int.test.ts`, with `fromEntries` so the SCREAMING key is not a literal. */
// biome-ignore lint/style/noProcessEnv: the child needs a resolvable PATH for `nice` and nothing else — reading the parent's PATH here IS the point, not app config.
const CAPTURE_ENV = Object.fromEntries([["PATH", process.env["PATH"] ?? ""]]);

const PID_WAIT_TICK_MS = 50;
const PID_WAIT_TICKS = 100;
const DEADLINE_MS = 1500;
/** How long we allow the door to settle PAST its own deadline before calling it a hang. */
const SETTLE_SLACK_MS = scaledBudget(20_000);

interface ChildPids {
  readonly parent: number;
  readonly kid: number;
}

async function readPids(file: string): Promise<ChildPids> {
  for (let i = 0; i < PID_WAIT_TICKS; i += 1) {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as ChildPids;
    }
    await sleep(PID_WAIT_TICK_MS);
  }
  throw new Error("the planted child never published its pids — the fixture, not the door, is broken");
}

/** `/proc` is the honest answer to "is it gone": `process.kill(pid, 0)` would answer EPERM-vs-ESRCH, and
 *  a zombie is still a directory. Linux-only, like every other process pin in this tree. */
function alive(pid: number): boolean {
  return existsSync(`/proc/${pid}`);
}

async function waitGone(pid: number): Promise<boolean> {
  for (let i = 0; i < PID_WAIT_TICKS; i += 1) {
    if (!alive(pid)) {
      return true;
    }
    await sleep(PID_WAIT_TICK_MS);
  }
  return false;
}

function killTree(pids: ChildPids | null): void {
  for (const pid of pids === null ? [] : [pids.parent, pids.kid]) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The test owns these disposable pids and the door under test may already have reaped them — the
      // same cleanup posture as the stack fixtures. No `@orb-gate-ignore`: caught-failure-ownership does
      // not scan tests/, so a marker here would suppress nothing and read STALE to gate-ignore-inventory.
    }
  }
}

test("spawnNicedTranscript: a wedged child settles AT the deadline, says so, and its whole group dies (#1508)", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-proc-transcript-"));
  const pidFile = path.join(home, "pids.json");
  let pids: ChildPids | null = null;
  try {
    const started = wallNowMs();
    const result = await spawnNicedTranscript(process.execPath, ["-e", hangWithDescendant(pidFile)], {
      cwd: home,
      env: CAPTURE_ENV,
      timeoutMs: DEADLINE_MS,
    });
    const elapsed = wallNowMs() - started;
    pids = JSON.parse(readFileSync(pidFile, "utf8")) as ChildPids;

    // It SETTLED — the whole point. Before the fix this promise never resolved at all.
    expect(elapsed, "the door must settle at its own deadline, not run forever").toBeLessThan(DEADLINE_MS + SETTLE_SLACK_MS);
    // …and it is LOUD about why, so a stage log names the hang instead of ending mid-sentence.
    expect(result.transcript).toContain("TIMED OUT");
    // `code: null` is the file's own contract for "killed by signal" — ALWAYS a tool error, never a verdict.
    expect(result.code).toBeNull();
    // THE GROUP, not just the child: the descendant is the process a direct-child kill leaves running.
    expect(await waitGone(pids.parent), "the timed-out child must be gone").toBe(true);
    expect(await waitGone(pids.kid), "…and so must its DESCENDANT — the kill is a group kill").toBe(true);
  } finally {
    killTree(pids);
    rmSync(home, { recursive: true, force: true });
  }
});

test("spawnNicedTranscript: a child that finishes inside its deadline is untouched (#1508 planted control)", async () => {
  // The other direction — the deadline must not truncate honest work, or every stage becomes a false red.
  const result = await spawnNicedTranscript(process.execPath, ["-e", "process.stdout.write('DONE'); process.exit(7);"], {
    cwd: process.cwd(),
    env: CAPTURE_ENV,
    timeoutMs: scaledBudget(30_000),
  });
  expect(result.code, "the child's real exit code must survive").toBe(7);
  expect(result.transcript).toContain("DONE");
  expect(result.transcript, "an untimed-out run must not carry the timeout marker").not.toContain("TIMED OUT");
});

test("spawnNiced: the timeout kills the process GROUP, so no descendant outlives `timedOut` (#1508)", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-proc-niced-"));
  const pidFile = path.join(home, "pids.json");
  let pids: ChildPids | null = null;
  try {
    const result = await spawnNiced(process.execPath, ["-e", hangWithDescendant(pidFile)], { cwd: home, timeoutMs: DEADLINE_MS });
    pids = await readPids(pidFile);
    expect(result.timedOut).toBe(true);
    expect(await waitGone(pids.parent), "the timed-out child must be gone").toBe(true);
    // THE DEFECT, exactly: `child.kill("SIGKILL")` on a non-detached spawn left this one running while the
    // caller was already told `timedOut: true`.
    expect(await waitGone(pids.kid), "the descendant must die with it — the timeout is a GROUP kill").toBe(true);
  } finally {
    killTree(pids);
    rmSync(home, { recursive: true, force: true });
  }
});

test("spawnNiced: a child that beats its timeout keeps its own exit code (#1508 planted control)", async () => {
  const result = await spawnNiced(process.execPath, ["-e", "process.stdout.write('ok'); process.exit(3);"], { timeoutMs: scaledBudget(30_000) });
  expect(result.timedOut).toBe(false);
  expect(result.code).toBe(3);
  expect(result.stdout).toBe("ok");
});
