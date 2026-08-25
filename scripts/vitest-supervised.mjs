#!/usr/bin/env node
// vitest-supervised — the `pnpm test` node-lane runner, wrapping `vitest run` with a HANG WATCHDOG.
//
// WHY THIS EXISTS (issue #345): vitest 4.1.11's `forks` pool can leave the PARENT process wedged in
// `ep_poll` after the run, holding a dead worker's worker-to-parent IPC **Pipe** handle — the loop never
// drains, the process never exits. This is upstream and unfixed in 4.x:
//   - vitest #10162 "Vitest hangs after all tests pass — Pipe(fd=3) ref=true" (the exact handle; WITHDRAWN,
//     no minimal repro) and #10057 "Remove worker error listener early during forks pool shutdown" (the
//     shutdown-race fix — NEVER merged). 4.1.11 is the latest 4.x; there is no in-runner remedy.
//   - vitest's OWN safety net (`ctx.exit()` → an UNREF'd `teardownTimeout` timer that force-exits, default
//     10s) only arms once the run has finalized. The INDEFINITE hang is precisely the race where a worker
//     exits unexpectedly and the run-completion promise never settles, so `ctx.exit()` is never reached and
//     the safety timer is never armed → the parent blocks forever. No in-process backstop can cover that
//     (every in-process hook needs the run to complete first), so the backstop must be EXTERNAL — here.
//
// MECHANISM: spawn `nice -19 vitest run <args>`, tee its output live, and reset an inactivity timer on
// every output chunk. A completed run emits per-file result lines continuously; a wedged parent emits
// nothing. If NOTHING is emitted for ORB_TEST_HANG_TIMEOUT_MS (default 300000 = 5 min — ~2.5× the longest
// legitimate quiet gap, the 120s `ast-observability` serial rows; inactivity, not worker count, is the
// signal, so a `--maxWorkers`-capped run is watched the same), the run is wedged: SIGKILL the whole process
// GROUP (the parent + any orphaned workers), then decide the verdict.
//
// VERDICT ON A WEDGE — never a false green (#345 non-negotiable): the freshly-written `test-report.json`
// (deleted before the run, so its presence means THIS run wrote it) is read, and exit 0 is returned ONLY
// for a clean, COMPLETE pass. A crashed worker leaves `success:true` in the json with the crashed test
// VANISHED (counted in numTotalTests but in no passed/failed/pending/todo bucket) — empirically confirmed
// (#345). So the predicate also requires every test to be accounted for; a vanished test (or a missing
// report) is a FAILURE, exit 1.
//
// OVERRIDE: `ORB_TEST_HANG_TIMEOUT_MS` raises/lowers the inactivity limit (raise it if a legitimately slow
// suite under co-hosted-homelab load ever trips a false kill — a false RED here is safe, a false GREEN is
// not). `ORB_VITEST_BIN` overrides the vitest entry (used by the guard test to point at a fake).
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import process from "node:process";

const DEFAULT_HANG_MS = 300_000;
const MS_PER_SEC = 1000;
const WATCHDOG_MIN_MS = 1000;
const WATCHDOG_MAX_MS = 15_000;
const WATCHDOG_DIVISOR = 4;
const OUTPUT_FILE_RE = /^--outputFile\.json=(.+)$/u;

const root = process.cwd();
const vitestArgs = process.argv.slice(2);

/** The inactivity limit (ms). A non-finite or non-positive override falls back to the 5-min default. */
function hangLimitMs() {
  // biome-ignore lint/style/noProcessEnv: the ORB_TEST_HANG_TIMEOUT_MS knob is this script's contract.
  const raw = Number(process.env["ORB_TEST_HANG_TIMEOUT_MS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HANG_MS;
}

function resolveUnder(p) {
  return isAbsolute(p) ? p : join(root, p);
}

/** The `--outputFile.json` path from the args (both `=X` and separate-token forms), else the default. */
function reportPath() {
  for (let i = 0; i < vitestArgs.length; i += 1) {
    const a = vitestArgs[i];
    const eq = a.match(OUTPUT_FILE_RE);
    if (eq) {
      return resolveUnder(eq[1]);
    }
    if (a === "--outputFile.json" && i + 1 < vitestArgs.length) {
      return resolveUnder(vitestArgs[i + 1]);
    }
  }
  return resolveUnder("reports/test-report.json");
}

/** Read the fresh json report and return the process exit code it implies. Missing / unparseable / an
 *  incomplete run (a vanished test — the worker-crash signature) / any failure ⇒ 1. A COMPLETE all-pass ⇒ 0. */
function verdictFromReport(path) {
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return 1; // no verdict written ⇒ the run did not finish ⇒ failure, never a false green.
  }
  const total = Number(report.numTotalTests ?? 0);
  const passed = Number(report.numPassedTests ?? 0);
  const failed = Number(report.numFailedTests ?? 0);
  const pending = Number(report.numPendingTests ?? 0);
  const todo = Number(report.numTodoTests ?? 0);
  const failedSuites = Number(report.numFailedTestSuites ?? 0);
  const accountedFor = passed + failed + pending + todo === total; // a crashed worker's test vanishes here.
  const clean = report.success === true && failed === 0 && failedSuites === 0 && total > 0 && accountedFor;
  return clean ? 0 : 1;
}

function log(line) {
  process.stderr.write(`[vitest-supervised] ${line}\n`);
}

let settled = false;
/** Exit once, propagating `code`. `settled` guards the wedge path from racing the child's own exit event. */
function settle(code) {
  if (settled) {
    return;
  }
  settled = true;
  process.exit(code);
}

// Freshness guarantee: a STALE report from a prior run must never be read as this run's verdict.
rmSync(reportPath(), { force: true });

// The vitest ESM ENTRY (`vitest.mjs`, a `#!/usr/bin/env node` module), NOT the `.bin/vitest` npm shim —
// the shim is a `#!/bin/sh` script and `node <shim>` throws a SyntaxError. ORB_VITEST_BIN (a real node
// module) overrides it for the guard test.
// biome-ignore lint/style/noProcessEnv: the ORB_VITEST_BIN knob lets the guard test point at a fake vitest.
const vitestBin = resolveUnder(process.env["ORB_VITEST_BIN"] ?? "node_modules/vitest/vitest.mjs");

// `nice -19` preserves the homelab-protecting priority floor the old `test` script carried. `detached`
// makes the child a process-group leader so a wedge can SIGKILL the WHOLE group (parent + orphaned workers).
const child = spawn("nice", ["-n", "19", process.execPath, vitestBin, ...vitestArgs], {
  cwd: root,
  detached: true,
  stdio: ["inherit", "pipe", "pipe"],
});

let lastActivity = Date.now();
function touch() {
  lastActivity = Date.now();
}
child.stdout.on("data", (c) => {
  process.stdout.write(c);
  touch();
});
child.stderr.on("data", (c) => {
  process.stderr.write(c);
  touch();
});

/** SIGKILL the child's whole process group (negative pid). Best-effort — the group may already be gone. */
function killGroup() {
  try {
    if (child.pid !== undefined) {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    /* ESRCH: already dead */
  }
}

const limit = hangLimitMs();
const tickMs = Math.max(WATCHDOG_MIN_MS, Math.min(WATCHDOG_MAX_MS, Math.floor(limit / WATCHDOG_DIVISOR)));
const watchdog = setInterval(() => {
  if (Date.now() - lastActivity < limit) {
    return;
  }
  clearInterval(watchdog);
  const path = reportPath();
  const verdict = verdictFromReport(path);
  log(`no output for ${Math.round(limit / MS_PER_SEC)}s — vitest parent is WEDGED (issue #345: leaked worker`);
  log("IPC Pipe holds the event loop; vitest #10162/#10057, unfixed in 4.x). Killing the process group.");
  log(`verdict from ${path}: exit ${verdict} (${verdict === 0 ? "complete pass" : "incomplete/failed run — NOT a pass"}).`);
  killGroup();
  settle(verdict);
}, tickMs).unref();

// Forward terminal signals to the child group (detached children don't receive them automatically).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    killGroup();
    settle(1);
  });
}

child.on("error", (err) => {
  clearInterval(watchdog);
  log(`failed to spawn vitest: ${err.message}`);
  settle(1);
});

child.on("exit", (code, signal) => {
  clearInterval(watchdog);
  // A clean run mirrors vitest's own exit code. A signal-terminated child (not by us — `settled` guards
  // that) is a failure, never a silent pass.
  settle(signal ? 1 : (code ?? 1));
});
