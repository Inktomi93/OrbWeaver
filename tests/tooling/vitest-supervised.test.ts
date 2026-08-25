// Guard for scripts/vitest-supervised.mjs (issue #345) — the hang-watchdog wrapper around `vitest run`.
// A research-zone script test (test-layout exempts flat tests/tooling/ files that cover scripts/), it drives
// the supervisor against a FAKE vitest via ORB_VITEST_BIN and asserts the four outcomes that matter:
//   1. a clean child (exit 0) is mirrored;
//   2. a failing child (exit 1) is mirrored;
//   3. a WEDGED child that wrote a COMPLETE-pass report is killed and reported exit 0 (the self-heal);
//   4. a WEDGED child that wrote a crashed-worker report (success:true but a VANISHED test) is reported
//      exit 1 — the #345 non-negotiable that the supervisor NEVER returns a false green — and its whole
//      process group is dead afterwards (nothing survives the kill).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll, expect, test } from "vitest";

const SUPERVISOR = join(process.cwd(), "scripts", "vitest-supervised.mjs");

// A single parametric fake vitest: it parses its own --outputFile.json (the supervisor passes the run args
// straight through), writes the report its MODE dictates, records its pid, prints one line, then either
// exits or hangs forever on an interval — exactly the shape the supervisor must survive.
const FAKE = `
import { writeFileSync } from "node:fs";
import process from "node:process";
const mode = process.env.FAKE_MODE;
const args = process.argv.slice(2);
let out = "report.json";
for (const a of args) { const m = a.match(/^--outputFile\\.json=(.+)$/u); if (m) out = m[1]; }
if (process.env.FAKE_PID_FILE) writeFileSync(process.env.FAKE_PID_FILE, String(process.pid));
const COMPLETE_PASS = { success: true, numTotalTests: 3, numPassedTests: 2, numFailedTests: 0, numPendingTests: 1, numTodoTests: 0, numFailedTestSuites: 0 };
// The empirically-confirmed crashed-worker shape (#345): success:true, but the test VANISHED (0 in every bucket, total 1).
const CRASH = { success: true, numTotalTests: 1, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numFailedTestSuites: 0 };
if (mode === "hang-pass") writeFileSync(out, JSON.stringify(COMPLETE_PASS));
if (mode === "hang-crash") writeFileSync(out, JSON.stringify(CRASH));
process.stdout.write("fake vitest: " + mode + "\\n");
if (mode === "exit0") process.exit(0);
if (mode === "exit1") process.exit(1);
setInterval(() => {}, 1000); // hang, as a wedged vitest parent would
`;

let dir: string;
let fakeBin: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cb-vitest-sup-"));
  fakeBin = join(dir, "fake-vitest.mjs");
  writeFileSync(fakeBin, FAKE);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface RunResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

function runSupervisor(mode: string, reportFile: string, pidFile?: string): Promise<RunResult> {
  // biome-ignore lint/style/noProcessEnv: the spawned supervisor needs the inherited PATH to find `nice`/node.
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Uppercase env keys via bracket assignment (env vars are not camelCase identifiers).
  env["ORB_VITEST_BIN"] = fakeBin;
  env["ORB_TEST_HANG_TIMEOUT_MS"] = "1500";
  env["FAKE_MODE"] = mode;
  if (pidFile) {
    env["FAKE_PID_FILE"] = pidFile;
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SUPERVISOR, "run", `--outputFile.json=${reportFile}`], {
      cwd: dir,
      env,
      stdio: "ignore",
    });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

test("mirrors a clean child's exit 0", { timeout: 15_000 }, async () => {
  const res = await runSupervisor("exit0", join(dir, "r0.json"));
  expect(res.code).toBe(0);
});

test("mirrors a failing child's exit 1", { timeout: 15_000 }, async () => {
  const res = await runSupervisor("exit1", join(dir, "r1.json"));
  expect(res.code).toBe(1);
});

test("kills a wedged child that wrote a COMPLETE pass and reports exit 0", { timeout: 15_000 }, async () => {
  const report = join(dir, "rpass.json");
  const res = await runSupervisor("hang-pass", report);
  expect(res.code).toBe(0);
});

test("resolves and runs the REAL default vitest entry (not the .bin sh shim) — a light project exits 0", { timeout: 60_000 }, async () => {
  // No ORB_VITEST_BIN: the supervisor must resolve node_modules/vitest/vitest.mjs (a node ESM), never the
  // #!/bin/sh `.bin/vitest` shim — `node <shim>` throws SyntaxError (caught in the #345 acceptance). cwd is
  // the repo root so vitest.config + node_modules resolve; the contract project is small (~5s, pure zod).
  const report = join(dir, "rreal.json");
  const args = [SUPERVISOR, "run", "--project", "contract", "--reporter=json", `--outputFile.json=${report}`];
  const res = await new Promise<RunResult>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: "ignore" });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  expect(res.code).toBe(0);
});

test("a wedged child whose report hides a crashed worker is reported exit 1, and its group is dead", { timeout: 15_000 }, async () => {
  const report = join(dir, "rcrash.json");
  const pidFile = join(dir, "crash.pid");
  const res = await runSupervisor("hang-crash", report, pidFile);
  // The report literally says success:true — the supervisor MUST NOT trust it (a test vanished).
  const written = JSON.parse(readFileSync(report, "utf-8")) as { success: boolean };
  expect(written.success).toBe(true);
  expect(res.code).toBe(1);
  // Group kill: the fake's own pid must be gone (nothing survives the SIGKILL).
  const fakePid = Number(readFileSync(pidFile, "utf-8"));
  expect(() => process.kill(fakePid, 0)).toThrow();
});
