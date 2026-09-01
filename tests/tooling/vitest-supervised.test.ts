// Guard for scripts/vitest-supervised.mjs (issues #345, #1012) — the sharded hang-watchdog runner behind
// `pnpm test`. A research-zone script test (test-layout exempts flat tests/tooling/ files that cover
// scripts/), it drives the supervisor against a FAKE vitest via ORB_VITEST_BIN and asserts:
//   1. a clean child (exit 0) is mirrored;
//   2. a failing child (exit 1) is mirrored;
//   3. a WEDGED child that wrote a COMPLETE-pass report is killed and reported exit 0 (the self-heal);
//   4. a WEDGED child that wrote a crashed-worker report (success:true but a VANISHED test) is reported
//      exit 1 — the #345 non-negotiable that the supervisor NEVER returns a false green — and its whole
//      process group is dead afterwards (nothing survives the kill);
//   5. #1012 SHARDING: two `--project` flags run TWO child processes, each with its OWN shard report, and
//      the merged `--outputFile.json` sums them and names the shards;
//   6. #1012 CONTAINMENT: one shard wedging does NOT cost the other shard's verdict, and a wedged shard is
//      re-run exactly once — a shard that wedges then passes ends the run GREEN, while a shard that wedges
//      twice with a crashed-worker report is still exit 1 (the non-negotiable survives the retry);
//   7. #1012 EVIDENCE: a wedge writes an attempt-suffixed `reports/test-wedge-*.txt` naming the wedged pid
//      and the SUSPECT files, and the re-run's dump does not overwrite the first attempt's.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";

const SUPERVISOR = join(process.cwd(), "scripts", "vitest-supervised.mjs");

// A single parametric fake vitest: it parses its own --outputFile.json (the supervisor passes the run args
// straight through), writes the report its MODE dictates, records its pid, prints one line, then either
// exits or hangs forever on an interval — exactly the shape the supervisor must survive.
const FAKE = `
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
let mode = process.env.FAKE_MODE;
const args = process.argv.slice(2);
let out = "report.json";
let project = "none";
for (let i = 0; i < args.length; i += 1) {
  const m = args[i].match(/^--outputFile\\.json=(.+)$/u);
  if (m) out = m[1];
  if (args[i] === "--project") project = args[i + 1];
}
if (process.env.FAKE_PID_FILE) writeFileSync(process.env.FAKE_PID_FILE, String(process.pid));
if (process.env.FAKE_SPAWN_LOG) appendFileSync(process.env.FAKE_SPAWN_LOG, project + "\\n");
// FAKE_WEDGE_ONCE names a project that wedges on its FIRST spawn and passes on its second — the #1012
// retry arm. The attempt counter is the spawn log, so the fake needs no state of its own.
if (process.env.FAKE_WEDGE_ONCE === project) {
  const seen = readFileSync(process.env.FAKE_SPAWN_LOG, "utf-8").split("\\n").filter((l) => l === project).length;
  mode = seen === 1 ? "hang-crash" : "pass";
}
const COMPLETE_PASS = { success: true, numTotalTests: 3, numPassedTests: 2, numFailedTests: 0, numPendingTests: 1, numTodoTests: 0, numFailedTestSuites: 0, testResults: [{ name: "tests/" + project + "/a.test.ts" }, { name: "tests/" + project + "/b.test.ts" }] };
// The empirically-confirmed crashed-worker shape (#345): success:true, but the test VANISHED (0 in every bucket, total 1).
const CRASH = { success: true, numTotalTests: 1, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numFailedTestSuites: 0 };
// "busy": SILENT but burning CPU in a GRANDCHILD, the shape a long single test file has (it spawns a CLI
// and prints nothing) — the supervisor must NOT kill it.
if (mode === "busy") {
  const spin = spawn(process.execPath, ["-e", "const t=Date.now();while(Date.now()-t<" + (process.env.FAKE_BUSY_MS ?? "6000") + "){Math.sqrt(Math.random())}"], { stdio: "ignore" });
  spin.on("exit", () => { writeFileSync(out, JSON.stringify(COMPLETE_PASS)); process.exit(0); });
}
if (mode === "hang-pass" || mode === "pass") writeFileSync(out, JSON.stringify(COMPLETE_PASS));
if (mode === "hang-crash") writeFileSync(out, JSON.stringify(CRASH));
process.stdout.write("fake vitest: " + mode + "\\n");
// A default-reporter-shaped completion line, so the supervisor's wedge dump can diff completed vs planned.
process.stdout.write(" \\u2713 |" + project + "| tests/" + project + "/a.test.ts (2 tests) 1ms\\n");
if (mode === "exit0" || mode === "pass") process.exit(0);
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

interface SupervisorOptions {
  readonly mode: string;
  readonly reportFile: string;
  readonly pidFile?: string;
  /** Extra `--project` shards; two or more switch the supervisor into sharded mode. */
  readonly projects?: readonly string[];
  readonly spawnLog?: string;
  /** The project whose FIRST spawn wedges and whose second passes (the retry arm). */
  readonly wedgeOnce?: string;
  /** A per-case cwd, so one case's `reports/` wedge dumps never mix with another's. */
  readonly cwd?: string;
}

function runSupervisor(options: SupervisorOptions): Promise<RunResult> {
  // biome-ignore lint/style/noProcessEnv: the spawned supervisor needs the inherited PATH to find `nice`/node.
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Uppercase env keys via bracket assignment (env vars are not camelCase identifiers).
  env["ORB_VITEST_BIN"] = fakeBin;
  env["ORB_TEST_HANG_TIMEOUT_MS"] = "1500";
  env["FAKE_MODE"] = options.mode;
  if (options.pidFile !== undefined) {
    env["FAKE_PID_FILE"] = options.pidFile;
  }
  if (options.spawnLog !== undefined) {
    env["FAKE_SPAWN_LOG"] = options.spawnLog;
    writeFileSync(options.spawnLog, "");
  }
  if (options.wedgeOnce !== undefined) {
    env["FAKE_WEDGE_ONCE"] = options.wedgeOnce;
  }
  const args = [SUPERVISOR, "run", ...(options.projects ?? []).flatMap((p) => ["--project", p]), `--outputFile.json=${options.reportFile}`];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: options.cwd ?? dir, env, stdio: "ignore" });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

interface MergedReport {
  readonly success: boolean;
  readonly numTotalTests?: number;
  readonly numPassedTests?: number;
  readonly orbShards?: readonly { readonly project: string; readonly exitCode: number; readonly wedges: number }[];
  readonly testResults?: readonly { readonly name: string }[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** A fresh cwd per sharded case: `reports/test-wedge-*.txt` is written relative to it. */
function caseDir(name: string): string {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  return d;
}

test("mirrors a clean child's exit 0", { timeout: 15_000 }, async () => {
  const res = await runSupervisor({ mode: "exit0", reportFile: join(dir, "r0.json") });
  expect(res.code).toBe(0);
});

test("mirrors a failing child's exit 1", { timeout: 15_000 }, async () => {
  const res = await runSupervisor({ mode: "exit1", reportFile: join(dir, "r1.json") });
  expect(res.code).toBe(1);
});

test("kills a wedged child that wrote a COMPLETE pass and reports exit 0", { timeout: 15_000 }, async () => {
  const res = await runSupervisor({ mode: "hang-pass", reportFile: join(dir, "rpass.json") });
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
  const res = await runSupervisor({ mode: "hang-crash", reportFile: report, pidFile });
  // The report literally says success:true — the supervisor MUST NOT trust it (a test vanished).
  const written = readJson<{ success: boolean }>(report);
  expect(written.success).toBe(true);
  expect(res.code).toBe(1);
  // Group kill: the fake's own pid must be gone (nothing survives the SIGKILL). `pidFile` holds the LAST
  // attempt's pid — the #1012 retry re-runs a wedged shard once, and both attempts must be dead.
  const fakePid = Number(readFileSync(pidFile, "utf-8"));
  expect(() => process.kill(fakePid, 0)).toThrow();
});

// ---------------------------------------------------------------------------------------------------
// #1012 — sharding, containment, and the wedge evidence file.
// ---------------------------------------------------------------------------------------------------

// The PRIMARY #1012 defect, measured live 2026-09-01: the old watchdog treated SILENCE as the wedge signal
// and SIGKILLed a healthy battery whose only crime was running one long file (vitest's default reporter
// prints nothing while a file runs; `ast-observability.int` spawns the real `pnpm ast` CLI five times).
// These two cases pin BOTH directions of the replacement rule — silent+busy survives, silent+idle dies.
test("does NOT kill a child that is SILENT but burning CPU in a grandchild (the false-kill class)", {
  timeout: 40_000,
}, async () => {
  const cwd = caseDir("busy");
  const report = join(cwd, "reports", "test-report.json");
  // The busy child prints ONE line and is then silent for ~6s — four times the 1500ms window — while its
  // grandchild spins. Under the old silence-only rule this run was killed; it must now finish naturally.
  const res = await runSupervisor({ mode: "busy", reportFile: report, cwd });
  expect(res.code).toBe(0);
  expect(existsSync(report)).toBe(true);
  // A survivor leaves NO wedge dump — the kill never happened.
  expect(readdirSync(join(cwd, "reports")).filter((f) => f.startsWith("test-wedge-"))).toHaveLength(0);
});

test("still kills a child that is silent AND idle, and says so in the dump", { timeout: 20_000 }, async () => {
  const cwd = caseDir("idle");
  const report = join(cwd, "reports", "test-report.json");
  const res = await runSupervisor({ mode: "hang-crash", reportFile: report, cwd });
  expect(res.code).toBe(1);
  const dumps = readdirSync(join(cwd, "reports")).filter((f) => f.startsWith("test-wedge-"));
  expect(dumps.length).toBeGreaterThan(0);
  expect(readFileSync(join(cwd, "reports", dumps[0] ?? ""), "utf-8")).toContain("zero CPU across the whole process tree");
});

test("shards one vitest process per --project and merges their reports into the ONE contract path", {
  timeout: 30_000,
}, async () => {
  const cwd = caseDir("shard-ok");
  const report = join(cwd, "reports", "test-report.json");
  const spawnLog = join(cwd, "spawns.txt");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: report,
    projects: ["unit", "contract"],
    spawnLog,
    cwd,
  });
  expect(res.code).toBe(0);
  // One child process per project, in order — the containment mechanism itself.
  expect(readFileSync(spawnLog, "utf-8").split("\n").filter(Boolean)).toEqual(["unit", "contract"]);
  // Each shard wrote its OWN report beside the merged one.
  expect(existsSync(join(cwd, "reports", "test-shards", "unit.json"))).toBe(true);
  expect(existsSync(join(cwd, "reports", "test-shards", "contract.json"))).toBe(true);
  // The merged report sums the shards, names them, and still satisfies the accounted-for predicate
  // (2 passed + 1 pending = 3 total, per shard) that `pnpm check`'s readers and the supervisor rely on.
  const merged = readJson<MergedReport>(report);
  expect(merged.success).toBe(true);
  expect(merged.numTotalTests).toBe(6);
  expect(merged.numPassedTests).toBe(4);
  expect(merged.orbShards?.map((s) => s.project)).toEqual(["unit", "contract"]);
  expect(merged.orbShards?.every((s) => s.wedges === 0)).toBe(true);
  expect(merged.testResults).toHaveLength(4);
});

test("a shard that wedges is re-run ONCE and its wedge is recorded, while the other shard's verdict stands", {
  timeout: 40_000,
}, async () => {
  const cwd = caseDir("shard-retry");
  const report = join(cwd, "reports", "test-report.json");
  const spawnLog = join(cwd, "spawns.txt");
  // Seed the shard's PREVIOUS report — the supervisor rotates it aside and diffs it against the files this
  // run announced as finished, which is what turns a wedge into a suspect list.
  mkdirSync(join(cwd, "reports", "test-shards"), { recursive: true });
  writeFileSync(
    join(cwd, "reports", "test-shards", "unit.json"),
    JSON.stringify({ testResults: [{ name: "tests/unit/a.test.ts" }, { name: "tests/unit/b.test.ts" }] }),
  );
  const res = await runSupervisor({
    mode: "pass",
    reportFile: report,
    projects: ["unit", "contract"],
    spawnLog,
    wedgeOnce: "unit",
    cwd,
  });
  // The wedge is CONTAINED, not fatal: the re-run passed, so the whole run is green...
  expect(res.code).toBe(0);
  // ...and `unit` was spawned exactly twice (one wedge + one re-run) while `contract` ran once.
  const spawns = readFileSync(spawnLog, "utf-8").split("\n").filter(Boolean);
  expect(spawns).toEqual(["unit", "unit", "contract"]);
  // The green is not allowed to HIDE the wedge — the merged report records it.
  const merged = readJson<MergedReport>(report);
  expect(merged.success).toBe(true);
  expect(merged.orbShards?.find((s) => s.project === "unit")?.wedges).toBe(1);
  expect(merged.orbShards?.find((s) => s.project === "contract")?.wedges).toBe(0);
  // The wedge dump is attempt-suffixed evidence, and it names the file the previous run reported but this
  // one never finished (b.test.ts) — the suspect list, the only root-cause lead a wedge leaves.
  const dumps = readdirSync(join(cwd, "reports")).filter((f) => f.startsWith("test-wedge-"));
  expect(dumps).toHaveLength(1);
  expect(dumps[0]).toContain("test-wedge-unit-attempt1-");
  const dump = readFileSync(join(cwd, "reports", dumps[0] ?? ""), "utf-8");
  expect(dump).toContain("PARENT pid=");
  expect(dump).toContain("tests/unit/b.test.ts");
});
