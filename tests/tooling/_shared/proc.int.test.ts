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
// SINCE #2197 IT ALSO HOLDS THE SYNC DOORS' CAPTURE PINS (bottom of the file) — `execNicedSync` /
// `execNicedSyncBuffer`. Same reason those live here rather than in `proc.test.ts`: that file MOCKS
// `node:child_process` wholesale to pin signal ownership, so `execFileSync` there is a `vi.fn()` returning
// undefined and no capture behaviour is observable through it. A real child that writes to stderr and exits
// non-zero is the only subject these properties have.
//
// Every child here is a `node -e` hang or a one-line write in its own group, torn down in `finally` where
// one is left behind; nothing touches the dev stack, a port, or the engines.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { execNicedSync, execNicedSyncBuffer, spawnNiced, spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// WALL CLOCK, through ONE door: the subject of the arms below is a real deadline settling on real time (a
// socket that says nothing, a child that hangs) — there is no clock to inject into the other side.
// @orb-waive test-determinism(Date.now): the SUBJECT is a real deadline measured on real time — the far side (a mute socket / a hung child) has no injectable clock
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

// ── THE SYNC DOORS' CAPTURE CONTRACT (#2197 / #2211) ──────────────────────────────────────────────────
//
// WHAT NODE ALREADY DOES, MEASURED BEFORE ANYTHING WAS WRITTEN HERE — because the row that sent this work
// asserted the opposite and a pin built on its letter would have been a fence wearing a defect proof's
// clothes. Three shapes, `withCapturedStderr` live vs. deleted, counting how many times the child's own
// stderr text appears in the THROWN MESSAGE:
//
//   shape                                  helper deleted   helper live
//   execNicedSync,       plain exit 2            1               2
//   execNicedSyncBuffer, plain exit 2            1               2
//   execNicedSync,       ENOBUFS kill            0               1
//
// So on an ordinary non-zero exit node's own `checkExecSyncError` already builds
// `Command failed: <argv>\n<stderr>` — for a Buffer stderr too — and the helper's append DUPLICATES it.
// On an **ENOBUFS kill** node throws a different error whose message carries no stderr at all, and the
// helper is the only reason the diagnosis is in the text. That kill is exactly the #2211/#2212 incident
// shape (the ceiling that made the whole-repo lint tier unobtainable), so the helper is right to exist and
// its general application is redundant. Both halves are pinned below, each labelled for what it is.
//
// WHY THE MESSAGE AND NOT `err.stderr`: node populates the PROPERTY in every shape (`execFileSync`'s
// default stdio is `['pipe','pipe','pipe']`; only an explicit `stdio: "inherit"` nulls it). What an
// assertion, a log line and a thrown-error report all print is the MESSAGE — so a diagnosis that lives only
// on a property nobody reads has been discarded in every way that matters.
//
// WHY THESE LIVE HERE AND NOT IN `proc.test.ts`: that file mocks `node:child_process` wholesale, so
// `execFileSync` there is a `vi.fn()` and no capture behaviour is observable through it.

/** THE MARKERS ARE SPLIT ACROSS A CONCATENATION, and that is load-bearing rather than decoration.
 *
 *  Node's failure message is `Command failed: <the whole argv>` — and for a `node -e` child the argv IS the
 *  source text, so a marker spelled contiguously inside it appears in the message NO MATTER WHAT the door
 *  does with the streams. The first draft of these arms did exactly that and passed against a deliberately
 *  neutered helper: they were matching the argv echo, not the capture. Assembling the marker only at
 *  RUNTIME (`"orb-probe-" + "diagnosis-2197"`) keeps it out of the command line, so a match is the capture
 *  and nothing else. The negative control below is what caught this. */
const DIAGNOSIS = "orb-probe-diagnosis-2197";
const ON_STDOUT = "orb-probe-stdout-2197";
const SPLIT_DIAGNOSIS = '"orb-probe-" + "diagnosis-2197"';
const SPLIT_ON_STDOUT = '"orb-probe-" + "stdout-2197"';
/** A child that writes to BOTH streams and exits non-zero. */
const FAILING_CHILD = `process.stdout.write(${SPLIT_ON_STDOUT}); process.stderr.write(${SPLIT_DIAGNOSIS}); process.exit(2);`;
/** The same exit with NOTHING on stderr — the negative control for the append. */
const SILENT_FAILING_CHILD = `process.stdout.write(${SPLIT_ON_STDOUT}); process.exit(2);`;

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("the failing child did not throw — these doors THROW on a non-zero status by contract");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// A payload comfortably past a planted tiny ceiling and comfortably under node's own ~1MiB default, so the
// arms differ ONLY by the ceiling the caller named.
const TINY_CEILING = 1024;
const PAYLOAD_BYTES = 64 * 1024;
const LOUD_FAILING_CHILD = `process.stderr.write(${SPLIT_DIAGNOSIS}); process.stdout.write("x".repeat(${PAYLOAD_BYTES}));`;
const LOUD_CHILD = `process.stdout.write("x".repeat(${PAYLOAD_BYTES}));`;

test("#2211 THE DEFECT PROOF — on an ENOBUFS kill the diagnosis reaches the MESSAGE, which node alone never does", () => {
  // THE ONE SHAPE `withCapturedStderr` IS LOAD-BEARING ON, and it is the shape the incident had: the child
  // is TERMINATED at the ceiling, node throws `ENOBUFS` rather than a completed non-zero exit, and its
  // message carries the argv and nothing else. Deleting the append takes this arm from 1 to 0 — measured.
  let thrown: unknown;
  try {
    execNicedSync(process.execPath, ["-e", LOUD_FAILING_CHILD], { maxBuffer: TINY_CEILING });
  } catch (error) {
    thrown = error;
  }

  expect((thrown as { code?: string }).code, "the tiny ceiling must KILL rather than truncate").toBe("ENOBUFS");
  expect(occurrences(String((thrown as Error).message), DIAGNOSIS)).toBe(1);
});

test("#2211 — the caller's maxBuffer is FORWARDED: without it the ceiling is node's, not the caller's", () => {
  // `execFileSync` does not truncate at `maxBuffer`, it TERMINATES the child — so a door that silently
  // drops the caller's ceiling turns a large-payload verdict into a kill, and one that drops it the other
  // way lets a payload the caller fenced sail through. Under a dropped forwarding this call succeeds.
  let thrown: unknown;
  try {
    execNicedSync(process.execPath, ["-e", LOUD_CHILD], { maxBuffer: TINY_CEILING });
  } catch (error) {
    thrown = error;
  }

  expect(thrown, "a 64KiB payload under a 1KiB ceiling must not come back as a value").toBeInstanceOf(Error);
  expect((thrown as { code?: string }).code).toBe("ENOBUFS");
});

test("#2211 NEGATIVE CONTROL — the SAME payload under a generous ceiling comes back WHOLE", () => {
  // The arm above would pass against a door that always threw. This proves the ceiling is the variable and
  // that raising it delivers the bytes rather than truncating them.
  const out = execNicedSync(process.execPath, ["-e", LOUD_CHILD], { maxBuffer: PAYLOAD_BYTES * 2 });

  expect(out).toHaveLength(PAYLOAD_BYTES);
});

test("#2197 FENCE (not a defect proof) — a plain non-zero exit carries its stderr in the message, string door", () => {
  // HONEST LABEL: this passes with `withCapturedStderr` DELETED, because node builds the text itself. It is
  // a fence on the PROPERTY — "the reason is in the message" — not evidence for the helper, and the table
  // in the section header is why it says so out loud rather than reading as a repair's receipt.
  const message = messageOf(() => execNicedSync(process.execPath, ["-e", FAILING_CHILD]));

  expect(message).toContain(DIAGNOSIS);
  expect(message).toContain("Command failed");
  // AT LEAST once, deliberately not EXACTLY once: the helper currently doubles it and that duplication is
  // an accident of two appenders, not a contract. Pinning the 2 would make a future de-duplication look
  // like a regression; pinning >=1 keeps the property and leaves the accident free to be fixed.
  expect(occurrences(message, DIAGNOSIS)).toBeGreaterThanOrEqual(1);
});

test("#2197 FENCE — the BUFFER door carries the same property; a Buffer stderr is not the quiet one", () => {
  // Same honest label. Worth a fence anyway: the twin exists for callers that need raw bytes, and node's
  // own append works on a Buffer stderr too — which is itself a fact nothing else on the tree records.
  const message = messageOf(() => execNicedSyncBuffer(process.execPath, ["-e", FAILING_CHILD]));

  expect(message).toContain(DIAGNOSIS);
});

test("#2197 NEGATIVE CONTROL — a child that fails SILENTLY gets no appended noise", () => {
  // Without this the arms above would pass against an implementation that appended something
  // unconditionally — a placeholder, a bare newline, the stdout. The append is the child's OWN words or
  // nothing. It is also the arm that caught the first draft matching the argv echo.
  const message = messageOf(() => execNicedSync(process.execPath, ["-e", SILENT_FAILING_CHILD]));

  expect(message).toContain("Command failed");
  expect(message).not.toContain(DIAGNOSIS);
  // stdout is NOT the diagnosis channel: a door that swept it in would make every gate verdict's report
  // body part of its own error text. (The marker is absent from the argv by construction — see above.)
  expect(message).not.toContain(ON_STDOUT);
});
