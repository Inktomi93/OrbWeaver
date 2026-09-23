// Guard for scripts/vitest-supervised.ts (issues #345, #1012) — the sharded hang-watchdog runner behind
// `pnpm test`. A research-zone script test (test-layout exempts flat tests/tooling/ files that cover
// scripts/), it drives the supervisor against a FAKE vitest via ORB_VITEST_BIN and asserts:
//   1. a clean child (exit 0) is mirrored;
//   2. a failing child (exit 1) is mirrored;
//   3. a WEDGED child that wrote a COMPLETE-pass report is killed and reported exit 2 — a TOOL ERROR;
//   4. a WEDGED child that wrote a crashed-worker report (success:true but a VANISHED test) is also exit 2
//      — the #345 non-negotiable that the supervisor NEVER returns a false green — and its whole
//      process group is dead afterwards (nothing survives the kill);
//
//   RULING FORK, STATED (#1490, 2026-09-04). Item 3 used to read "…and reported exit 0 (the self-heal)",
//   and that arm passed for as long as it existed. The new finding is that the exit code was the lie: the
//   watchdog SIGKILLed a vitest that never finalized, the supervisor read a 0 off the report the corpse
//   left, and `pnpm verify --push` — which keys on the exit code — read a killed run as green. The
//   SELF-HEAL MECHANISM survives untouched: such a shard is still not re-run (re-running buys another
//   wedge lottery ticket), its report is still the shard's verdict, and the containment log still fires.
//   Only the process exit changed, to the repo's tool-error code. The arm below is the same fixture with
//   the honest number; a shard that wedges and then RE-RUNS to a natural exit is still 0 (the retry arm at
//   the bottom of this file is that positive control, unchanged).
//   5. #1012 SHARDING: two `--project` flags run TWO child processes, each with its OWN shard report, and
//      the merged `--outputFile.json` sums them and names the shards;
//   6. #1012 CONTAINMENT: one shard wedging does NOT cost the other shard's verdict, and a wedged shard is
//      re-run exactly once — a shard that wedges then passes ends the run GREEN, while a shard that wedges
//      twice with a crashed-worker report is still exit 1 (the non-negotiable survives the retry);
//   7. #1012 EVIDENCE: a wedge writes an attempt-suffixed `reports/test-wedge-*.txt` naming the wedged pid
//      and the SUSPECT files, and the re-run's dump does not overwrite the first attempt's.
//   8. #2472 THE SECOND NON-VERDICT SHAPE: a POOL CRASH (a worker fork dies, vitest finalizes normally and
//      exits 1) and a SIGNAL-KILLED vitest are both exit 2, they NAME what died and which named spec
//      operands never reported, and the merged report is not a success. Items 1 and 2 are the positive
//      controls that make those 2s mean something rather than a blanket escalation: clean is still 0 and a
//      real red is still 1. This extends #1490's ruling without reversing it — same mechanism ("a run that
//      never finalized is not a number"), a shape that needs no watchdog because vitest announces it.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const SUPERVISOR = join(process.cwd(), "scripts", "vitest-supervised.ts");

// The busy-mode grandchild's source, hoisted out of FAKE below so this gate marker can be a REAL comment
// (a `//` inside a template literal is string content, not a comment). It burns CPU for a measured
// wall-clock span and prints nothing — the exact shape of a long single test file.
// @orb-waive test-determinism(Date.now): the SUBJECT is elapsed real CPU time — a spawned grandchild has no injectable clock, and the loop's END CONDITION is FAKE_BUSY_MS of wall time having passed
const SPIN_SRC = "const t = Date.now(); while (Date.now() - t < Number(process.argv[1])) {}";

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
if (process.env.FAKE_ARGS_LOG) writeFileSync(process.env.FAKE_ARGS_LOG, JSON.stringify(args));
if (args.some((arg) => arg.startsWith("--runtime-only"))) process.exit(1);
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
  const spin = spawn(process.execPath, ["-e", ${JSON.stringify(SPIN_SRC)}, process.env.FAKE_BUSY_MS ?? "6000"], { stdio: "ignore" });
  spin.on("exit", () => { writeFileSync(out, JSON.stringify(COMPLETE_PASS)); process.exit(0); });
}
if (mode === "hang-pass" || mode === "pass") writeFileSync(out, JSON.stringify(COMPLETE_PASS));
if (mode === "hang-crash") writeFileSync(out, JSON.stringify(CRASH));
// "pool-crash": a worker fork DIED and vitest then FINALIZED NORMALLY and exited 1 (#2472). The two lines
// are vitest 4.1.11's verbatim framing, captured 2026-09-20 from a spec that SIGKILLed its own fork.
if (mode === "pool-crash") {
  writeFileSync(out, JSON.stringify(CRASH));
  process.stderr.write("Error: [vitest-pool]: Worker forks emitted error.\\n");
  process.stderr.write("Caused by: Error: Worker exited unexpectedly\\n");
}
process.stdout.write("fake vitest: " + mode + "\\n");
// A default-reporter-shaped completion line, so the supervisor's wedge dump can diff completed vs planned.
process.stdout.write(" \\u2713 |" + project + "| tests/" + project + "/a.test.ts (2 tests) 1ms\\n");
if (mode === "exit0" || mode === "pass") process.exit(0);
if (mode === "exit1" || mode === "pool-crash") process.exit(1);
// "signal-death": the vitest PROCESS ITSELF dies on a signal (an OOM reap, a heap abort) without our
// watchdog killing it. The owner's exit-2 class in its purest form; the supervisor used to report 1.
if (mode === "signal-death") process.kill(process.pid, "SIGKILL");
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
  /** How long the busy grandchild spins (ms). */
  readonly busyMs?: string;
  /** The absolute silence ceiling — the backstop that fires even while the tree is still burning CPU. */
  readonly hangMaxMs?: string;
  /** Captures the argv received by the fake Vitest child. */
  readonly argsLog?: string;
  /** Additional wrapper argv, used by argument-translation controls. */
  readonly extraArgs?: readonly string[];
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
  if (options.busyMs !== undefined) {
    env["FAKE_BUSY_MS"] = options.busyMs;
  }
  if (options.hangMaxMs !== undefined) {
    env["ORB_TEST_HANG_MAX_MS"] = options.hangMaxMs;
  }
  if (options.argsLog !== undefined) {
    env["FAKE_ARGS_LOG"] = options.argsLog;
  }
  const args = [
    SUPERVISOR,
    "run",
    ...(options.projects ?? []).flatMap((p) => ["--project", p]),
    ...(options.extraArgs ?? []),
    `--outputFile.json=${options.reportFile}`,
  ];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: options.cwd ?? dir, env, stdio: "ignore" });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

interface MergedReport {
  readonly success: boolean;
  readonly numTotalTests?: number;
  readonly numPassedTests?: number;
  readonly orbShards?: readonly {
    readonly project: string;
    readonly exitCode: number;
    readonly wedges: number;
    /** #2472: the sentence naming what DIED when this shard produced no verdict, else null. */
    readonly nonVerdict?: string | null;
    /** #2472: the named spec operands that never printed a result line. */
    readonly unreported?: readonly string[];
  }[];
  readonly testResults?: readonly { readonly name: string }[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** A fresh cwd per sharded case: every artifact is written relative to it. */
function caseDir(name: string): string {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  return d;
}

/** The wedge dumps this run wrote. Since #1029 they live in the run's OWN SLOT
 *  (`reports/runs/test/<checkout>-<pid>-<timestamp>/`) rather than at a fixed `reports/` path — which is
 *  precisely what lets two concurrent supervisors keep each other's evidence. A case dir hosts exactly one
 *  supervisor run, so its single slot is the run's. */
function wedgeDumps(cwd: string): readonly string[] {
  const runs = join(cwd, "reports", "runs", "test");
  if (!existsSync(runs)) {
    return [];
  }
  return readdirSync(runs).flatMap((runId) =>
    readdirSync(join(runs, runId))
      .filter((f) => f.startsWith("test-wedge-"))
      .map((f) => join(runs, runId, f)),
  );
}

test("mirrors a clean child's exit 0", { timeout: scaledBudget(15_000) }, async () => {
  const res = await runSupervisor({ mode: "exit0", reportFile: join(dir, "r0.json") });
  expect(res.code).toBe(0);
});

test("mirrors a failing child's exit 1", { timeout: scaledBudget(15_000) }, async () => {
  const res = await runSupervisor({ mode: "exit1", reportFile: join(dir, "r1.json") });
  expect(res.code).toBe(1);
});

// ── #2472: A DEAD WORKER FORK IS A TOOL ERROR, NOT A RED ────────────────────────────────────────────────
// The two arms above are the positive controls that make these ones mean something: the supervisor still
// distinguishes clean (0) from violations (1), so a 2 below is discrimination and not a blanket escalation.
//
// THE DEFECT, measured 2026-09-20 on this repo's own tree: a spec whose fork was SIGKILLed made vitest
// print the pool's unhandled-error framing, FINALIZE NORMALLY, and exit 1 — the same number
// `expect(1).toBe(2)` exits with. `tests:instrument-affected` recorded `ok:false, exitCode:1` in
// `reports/verify.json`, which reads "your tests failed" over a harness that died. The #1490 wedge ruling
// already said a run that never finalized is not a number; it was keyed on the one non-verdict shape that
// needed a watchdog to notice. This is the shape vitest announces itself.
test("a POOL CRASH is exit 2 — vitest exits 1 for a dead fork and for a real red, and those are not the same run", {
  timeout: scaledBudget(15_000),
}, async () => {
  const res = await runSupervisor({ mode: "pool-crash", reportFile: join(dir, "pool-crash.json") });
  expect(res.code, "a crashed worker is a TOOL ERROR (2), never a violation (1)").toBe(2);
});

test("…and the exit-2 report NAMES the specs that never reported, so 'not a verdict' is not 'no information'", { timeout: scaledBudget(15_000) }, async () => {
  const cwd = caseDir("pool-crash-evidence");
  const reportFile = join(cwd, "reports", "test-report.json");
  const res = await runSupervisor({
    mode: "pool-crash",
    reportFile,
    cwd,
    // Named operands: the fake announces a completion line for `tests/none/a.test.ts` only, so the
    // supervisor must report the OTHER one as never-reported and must not invent the one that did.
    extraArgs: ["tests/none/a.test.ts", "tests/none/went-down-with-the-fork.test.ts"],
  });
  expect(res.code).toBe(2);
  const report = readJson<MergedReport>(reportFile);
  expect(report.success, "a run whose fork died is not a pass, whatever the corpse's report says").toBe(false);
  const shard = report.orbShards?.[0];
  expect(shard?.nonVerdict, "the refusal names WHAT died").toMatch(/worker pool|worker fork/u);
  expect(shard?.unreported).toEqual(["tests/none/went-down-with-the-fork.test.ts"]);
});

test("a SIGNAL-KILLED vitest is exit 2 too — the owner's exit-134/137 class, not a product red", { timeout: scaledBudget(15_000) }, async () => {
  const res = await runSupervisor({ mode: "signal-death", reportFile: join(dir, "signal-death.json") });
  expect(res.code).toBe(2);
});

test("translates --runtime-only into config mode without widening an explicit project selection", { timeout: scaledBudget(15_000) }, async () => {
  const argsLog = join(dir, "runtime-only-args.json");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: join(dir, "runtime-only.json"),
    argsLog,
    projects: ["tooling"],
    extraArgs: ["--runtime-only", "--config", join(dir, "vitest.config.ts"), "tests/tooling"],
  });
  expect(res.code).toBe(0);
  const childArgs = readJson<readonly string[]>(argsLog);
  expect(childArgs.filter((arg) => arg === "--project" || arg.startsWith("--project="))).toEqual(["--project"]);
  expect(childArgs).toContain("tooling");
  expect(childArgs).toContain("tests/tooling");
  expect(childArgs).not.toContain("--runtime-only");
  expect(childArgs.filter((arg) => arg === "--config" || arg.startsWith("--config="))).toEqual([
    expect.stringMatching(/^--config=.*vitest\.runtime\.config\.ts$/u),
  ]);
});

test("deduplicates exact project shards so native repeated selection executes once", { timeout: scaledBudget(30_000) }, async () => {
  const cwd = caseDir("duplicate-shards");
  const spawnLog = join(cwd, "spawns.txt");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: join(cwd, "reports", "test-report.json"),
    projects: ["unit", "unit", "contract"],
    spawnLog,
    cwd,
  });
  expect(res.code).toBe(0);
  expect(readFileSync(spawnLog, "utf-8").split("\n").filter(Boolean)).toEqual(["unit", "contract"]);
});

test("keeps wildcard and negative project selectors together for one native union", { timeout: scaledBudget(15_000) }, async () => {
  const cwd = caseDir("project-filter-union");
  const spawnLog = join(cwd, "spawns.txt");
  const argsLog = join(cwd, "args.json");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: join(cwd, "reports", "test-report.json"),
    projects: ["tool*", "!types-*"],
    spawnLog,
    argsLog,
    cwd,
  });
  expect(res.code).toBe(0);
  expect(readFileSync(spawnLog, "utf-8").split("\n").filter(Boolean)).toHaveLength(1);
  const childArgs = readJson<readonly string[]>(argsLog);
  expect(childArgs).toEqual(expect.arrayContaining(["--project", "tool*", "!types-*"]));
});

test("refuses runtime-only with a custom config that cannot honor repository config mode", { timeout: scaledBudget(15_000) }, async () => {
  const argsLog = join(dir, "unsupported-config-args.json");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: join(dir, "unsupported-config.json"),
    argsLog,
    extraArgs: ["--runtime-only", "--config", join(dir, "vitest.custom.config.mjs")],
  });
  expect(res.code).toBe(3);
  expect(existsSync(argsLog)).toBe(false);
});

test("leaves malformed --runtime-only forms for Vitest to reject", { timeout: scaledBudget(15_000) }, async () => {
  const argsLog = join(dir, "malformed-runtime-only-args.json");
  const res = await runSupervisor({
    mode: "pass",
    reportFile: join(dir, "malformed-runtime-only.json"),
    argsLog,
    extraArgs: ["--runtime-only=true"],
  });
  expect(res.code).toBe(1);
  expect(readJson<readonly string[]>(argsLog)).toContain("--runtime-only=true");
});

test("kills a wedged child that wrote a COMPLETE pass and reports exit 2 — TOOL ERROR, never 0 (#1490)", { timeout: scaledBudget(15_000) }, async () => {
  // THE #1490 DEFECT, exactly: the child wrote a clean report and THEN wedged, so `verdictFromReport` said
  // 0, the re-run (which only fires on a non-zero code) never ran, and the supervisor exited 0 about a run
  // it had to SIGKILL. The pre-push bar keys on this number.
  const res = await runSupervisor({ mode: "hang-pass", reportFile: join(dir, "rpass.json") });
  expect(res.code).toBe(2);
});

test("resolves and runs the REAL default vitest entry (not the .bin sh shim) — a light project exits 0", { timeout: scaledBudget(60_000) }, async () => {
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

test("real native collection keeps runtime-only inside the caller's exact project", { timeout: scaledBudget(30_000) }, async () => {
  const list = join(dir, "runtime-project-list.json");
  const report = join(dir, "runtime-project-list-report.json");
  const contractFile = "tests/contracts/assets/index.contract.test.ts";
  const repositoryFile = "tests/tooling/verify/gates/dangling-refs.repo.int.test.ts";
  const args = [
    SUPERVISOR,
    "list",
    contractFile,
    repositoryFile,
    "--filesOnly",
    `--json=${list}`,
    "--runtime-only",
    "--project",
    "contract",
    `--outputFile.json=${report}`,
  ];
  const res = await new Promise<RunResult>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: "ignore" });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  expect(res.code).toBe(0);
  const files = readJson<readonly { readonly file: string; readonly projectName: string }[]>(list);
  expect(files.map(({ file, projectName }) => ({ file: file.slice(process.cwd().length + 1), projectName }))).toEqual([
    { file: contractFile, projectName: "contract" },
  ]);
});

test("a runtime-only parent leaves native type projects visible to nested Vitest", { timeout: scaledBudget(30_000) }, async () => {
  const list = join(dir, "nested-type-project-list.json");
  const res = await new Promise<RunResult>((resolve) => {
    const child = spawn("pnpm", ["exec", "vitest", "list", "--filesOnly", `--json=${list}`, "--project", "types-*"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  expect(res.code).toBe(0);
  const files = readJson<readonly { readonly projectName: string }[]>(list);
  expect(files.length).toBeGreaterThan(0);
  expect([...new Set(files.map(({ projectName }) => projectName))].toSorted()).toEqual(["types-browser", "types-node"]);
});

test("a wedged child whose report hides a crashed worker is NOT green, and its group is dead", { timeout: scaledBudget(15_000) }, async () => {
  const report = join(dir, "rcrash.json");
  const pidFile = join(dir, "crash.pid");
  const res = await runSupervisor({ mode: "hang-crash", reportFile: report, pidFile });
  // The report literally says success:true — the supervisor MUST NOT trust it (a test vanished).
  const written = readJson<{ success: boolean }>(report);
  expect(written.success).toBe(true);
  // Both attempts wedge, so the FINAL attempt never finalized: 2 (tool error) since #1490, where this used
  // to be 1. The #345 non-negotiable is unchanged — the number that must never appear here is 0.
  expect(res.code).toBe(2);
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
  timeout: scaledBudget(40_000),
}, async () => {
  const cwd = caseDir("busy");
  const report = join(cwd, "reports", "test-report.json");
  // The busy child prints ONE line and is then silent for ~6s — four times the 1500ms window — while its
  // grandchild spins. Under the old silence-only rule this run was killed; it must now finish naturally.
  const res = await runSupervisor({ mode: "busy", reportFile: report, cwd });
  expect(res.code).toBe(0);
  expect(existsSync(report)).toBe(true);
  // A survivor leaves NO wedge dump — the kill never happened.
  expect(wedgeDumps(cwd)).toHaveLength(0);
});

// ORB_TEST_HANG_MAX_MS — the absolute backstop, and the ONLY thing that can stop a silent RUNAWAY. Both
// arms are needed: a ceiling that never fires is decoration, and one that fires early is the false kill
// this lane just removed. The TWO CLOCKS matter here — CPU progress resets the no-CPU timer but never the
// ceiling's, or a busy tree would push the ceiling out forever (it did, until this pair was written).
test("the ORB_TEST_HANG_MAX_MS ceiling KILLS a busy-but-silent runaway that outlives it", {
  timeout: scaledBudget(30_000),
}, async () => {
  const cwd = caseDir("ceiling-fires");
  const report = join(cwd, "reports", "test-report.json");
  // Spins 20s; the ceiling is 3s. The child never prints again, so the ceiling clock keeps running.
  const res = await runSupervisor({ mode: "busy", reportFile: report, cwd, busyMs: "20000", hangMaxMs: "3000" });
  expect(res.code).toBe(2); // killed by the ceiling on both attempts ⇒ tool error (#1490), never a verdict

  const dumps = wedgeDumps(cwd);
  expect(dumps.length).toBeGreaterThan(0);
  expect(readFileSync(dumps[0] ?? "", "utf-8")).toContain("hard ceiling");
});

test("the SAME busy-but-silent child SURVIVES under a generous ORB_TEST_HANG_MAX_MS", {
  timeout: scaledBudget(40_000),
}, async () => {
  const cwd = caseDir("ceiling-generous");
  const report = join(cwd, "reports", "test-report.json");
  const res = await runSupervisor({ mode: "busy", reportFile: report, cwd, busyMs: "6000", hangMaxMs: "600000" });
  expect(res.code).toBe(0);
  expect(wedgeDumps(cwd)).toHaveLength(0);
});

test("still kills a child that is silent AND idle, and says so in the dump", { timeout: scaledBudget(20_000) }, async () => {
  const cwd = caseDir("idle");
  const report = join(cwd, "reports", "test-report.json");
  const res = await runSupervisor({ mode: "hang-crash", reportFile: report, cwd });
  expect(res.code).toBe(2); // a kill is a tool error, not a verdict (#1490)
  const dumps = wedgeDumps(cwd);
  expect(dumps.length).toBeGreaterThan(0);
  expect(readFileSync(dumps[0] ?? "", "utf-8")).toContain("zero CPU across the whole process tree");
});

test("shards one vitest process per --project and merges their reports into the ONE contract path", {
  timeout: scaledBudget(30_000),
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
  timeout: scaledBudget(40_000),
}, async () => {
  const cwd = caseDir("shard-retry");
  const report = join(cwd, "reports", "test-report.json");
  const spawnLog = join(cwd, "spawns.txt");
  // Seed the shard's PREVIOUS report at the PUBLISHED pointer — the supervisor reads it there (#1029; this
  // run writes into its own slot, so nothing is rotated) and diffs it against the files this run announced
  // as finished, which is what turns a wedge into a suspect list.
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
  const dumps = wedgeDumps(cwd);
  expect(dumps).toHaveLength(1);
  expect(dumps[0]).toContain("test-wedge-unit-attempt1-");
  const dump = readFileSync(dumps[0] ?? "", "utf-8");
  expect(dump).toContain("PARENT pid=");
  expect(dump).toContain("tests/unit/b.test.ts");
});

test("a SHARDED run whose shards end wedged exits 2 and its merged report is not a success (#1490)", {
  timeout: scaledBudget(40_000),
}, async () => {
  const cwd = caseDir("shard-wedged");
  const report = join(cwd, "reports", "test-report.json");
  // Every shard writes a COMPLETE-pass report and then hangs — the shape that used to fold into a merged
  // `success:true` and a process exit 0. The merged file is read by `pnpm check`'s consumers, so the exit
  // code alone would not have been the whole lie.
  const res = await runSupervisor({ mode: "hang-pass", reportFile: report, projects: ["unit", "contract"], cwd });
  expect(res.code).toBe(2);
  const merged = readJson<MergedReport>(report);
  expect(merged.success, "a run whose final attempt was KILLED is not a pass, whatever the corpse's report says").toBe(false);
  // The per-shard provenance still carries the counts — containment is recorded, not hidden.
  expect(merged.orbShards?.every((s) => s.wedges > 0)).toBe(true);
});
