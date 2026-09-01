#!/usr/bin/env node
// vitest-supervised — the `pnpm test` node-lane runner: SEQUENTIAL PER-PROJECT SHARDS, each wrapped in a
// hang watchdog, with ONE automatic re-run of a shard the watchdog had to kill.
//
// WHY THIS EXISTS (issue #345, re-rooted #1012): vitest 4.1.11's run path has exactly ONE unbounded await.
// `Pool.run()` does `await testFinish.promise` (node_modules/vitest/dist/chunks/cli-api.*.js — `Pool.run`),
// and that resolver is settled ONLY by a worker's `testfileFinished` message or by a runner error/exit
// event. There is a `WORKER_START_TIMEOUT` for starting a worker but NO timeout once a file is running
// (deliberate — this repo's `tests/tooling/ast/cli.int.test.ts` rows carry explicit 120s/300s budgets). The CLI is
// `const ctx = await startVitest(...); if (!ctx.shouldKeepServer()) await ctx.exit()`, so vitest's OWN
// safety net — the unref'd `teardownTimeout` force-exit armed inside `ctx.exit()` — is only reached AFTER
// the run promise resolves. A worker that dies (or whose IPC breaks) without settling its task resolver
// therefore hangs the parent FOREVER, before any backstop is armed: every per-file result line prints, the
// summary never does. That is the exact signature the owner hits.
//
// WHY NOT UPSTREAM (re-derived 2026-09-01, not remembered):
//   - There is no release above 4.1.11 to upgrade to. `npm view vitest dist-tags` → latest 4.1.11; the
//     version list goes 4.1.11 → 5.0.0-beta.1, so the only thing "newer" is a v5 prerelease.
//   - vitest#10057 ("Remove worker error listener early during forks pool shutdown") was CLOSED BY ITS OWN
//     AUTHOR as premature ("until we know what's actually happening, this is likely premature… The flow in
//     point 1 above isn't fixed by this, anyway"), a maintainer refuted its real-world evidence, and its
//     symptom is a SPURIOUS FAILURE ("tests passing but the run marked as failed") — not a hang. Patching it
//     in would be hope, not a fix.
//   - vitest#10162 ("hangs after all tests pass — Pipe(fd=3) ref=true") was WITHDRAWN for lack of a minimal
//     repro, and its own report says the hang reproduced on `threads`, `forks` AND `singleFork` — so it is
//     not even a forks-pool-specific fact.
// So there is no in-runner remedy to import; the remedy has to be EXTERNAL, and it has to CONTAIN the
// wedge rather than merely detect it.
//
// MECHANISM:
//   1. SHARDING. `--project a --project b …` is split into one `vitest run --project <x>` process per
//      project, run SEQUENTIALLY, each writing its own `reports/test-shards/<project>.json`. The shard
//      reports are merged into the ONE `--outputFile.json` path the rest of the repo reads. A wedge is a
//      per-process race, so a wedge now costs ONE shard instead of the whole run's verdict.
//   2. WATCHDOG — PROGRESS, NOT SILENCE. Each shard is spawned via `nice -19` as a process-group leader and
//      its output tee'd live, but SILENCE ALONE IS NOT THE WEDGE SIGNAL. **Truth repair, measured
//      2026-09-01:** the previous version of this file claimed 300s was "~2.5× the longest legitimate quiet
//      gap, the 120s `ast-observability` serial rows". That sentence was wrong TWICE, and it made this
//      watchdog the primary defect it was written to fix. (i) It cited a file that has not existed since
//      8931a886c; the suite is `tests/tooling/ast/cli.int.test.ts`, and 120s is its PER-ROW spawn budget
//      (300s for the two typed whole-workspace rows), not the file's cost. (ii) vitest's default reporter
//      prints NOTHING while a single file runs, so the quiet gap is the WHOLE FILE. A live capture of an
//      unsupervised battery caught the parent silent in `ep_poll` for 7+ minutes with one idle worker fork
//      whose CHILD (`tooling/src/ast/cli.ts regkeys MOTION_BUDGETS` — that suite's row) was burning ~4.5
//      cores; the run finished naturally 36 minutes later, having spent 1,057,996 ms (17.6 min) inside that
//      one file. The old 300s rule would have SIGKILLed it, producing exactly the reported symptom (every
//      per-file line printed, then silence, then a kill, and no summary — the json report is never written).
//      So the watchdog now samples the CPU jiffies of the parent AND every descendant (recursively, via
//      /proc) on each tick: CPU burned anywhere in the tree counts as activity exactly like output does. A
//      shard is killed only when it has been silent for ORB_TEST_HANG_TIMEOUT_MS (default 300000 = 5 min)
//      AND the whole tree burned no CPU across that window — which is precisely the true wedge, where every
//      process sits idle in `ep_poll` at zero CPU. `ORB_TEST_HANG_MAX_MS` (default 30 min) is the absolute
//      ceiling: past it the group dies even if something is still spinning.
//   3. WEDGE DUMP. Before the kill, `reports/test-wedge-<project>-<attempt>-<timestamp>.txt` records the
//      parent pid, its `/proc` state/wchan/threads, the whole surviving descendant tree with the same per
//      pid detail, the open-fd listing, the count + tail of files that COMPLETED, and — the only root-cause
//      lead an intermittent wedge leaves — the SUSPECT list: files the PREVIOUS run of this shard reported
//      that this run never announced as finished. (Each shard's prior report is moved to `<name>.prev.json`
//      rather than deleted, purely to feed that diff; the live path is still removed, so freshness holds.)
//      Attempt-suffixed, so a re-run never overwrites the first wedge's evidence.
//   4. ONE RE-RUN. A shard the watchdog killed is re-run EXACTLY ONCE — and only when its own fresh report
//      is NOT a complete pass. (A wedge whose report is already a complete pass has self-healed; re-running
//      it would just buy another wedge lottery ticket.) A wedge is a TOOL ERROR, not a verdict, so this is
//      not "retry until green": a shard that FAILS tests is never re-run, and the second attempt's verdict
//      is final.
//
// VERDICT — never a false green (#345 non-negotiable, unchanged): each shard's report is deleted before its
// run, so its presence means THAT attempt wrote it. exit 0 is returned ONLY for a clean, COMPLETE pass: a
// crashed worker leaves `success:true` with the crashed test VANISHED (counted in numTotalTests but in no
// passed/failed/pending/todo bucket — empirically confirmed, #345), so the predicate also requires every
// test to be accounted for. A missing report, a vanished test, or any failure is exit 1. The overall exit
// code is 0 only if EVERY shard's verdict is 0, and the merged report carries the same shape (plus an
// `orbShards` provenance array) so it satisfies the same predicate.
//
// HONESTY: a shard that had to be re-run is announced loudly on stderr AND recorded in the merged report's
// `orbShards[].wedges` — a green that hides a wedge would read as "fixed" when it is only "contained".
//
// OVERRIDES: `ORB_TEST_HANG_TIMEOUT_MS` raises/lowers the no-output-and-no-CPU limit · `ORB_TEST_HANG_MAX_MS`
// the absolute silence ceiling · `ORB_VITEST_BIN` the vitest entry (the guard test points it at a fake).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import process from "node:process";

const DEFAULT_HANG_MS = 300_000;
const MS_PER_SEC = 1000;
const WATCHDOG_MIN_MS = 1000;
const WATCHDOG_MAX_MS = 15_000;
const WATCHDOG_DIVISOR = 4;
const OUTPUT_FILE_RE = /^--outputFile\.json=(.+)$/u;
const PROJECT_RE = /^--project=(.+)$/u;
/** A default-reporter per-file result line: `  ✓ |integration| tests/x/y.int.test.ts (3 tests) 12ms`. */
const RESULT_LINE_RE = /^\s*[✓×❯↓]\s+\|[^|]*\|\s+(\S+)/u;
const COMPLETED_TAIL = 8;
const MAX_ATTEMPTS = 2;
/** CPU jiffies (10 ms each) the process tree must burn between ticks to count as ALIVE. A wedged tree sits
 *  in `ep_poll` at exactly 0; any real work is orders of magnitude above this. */
const CPU_PROGRESS_JIFFIES = 5;
const DEFAULT_HARD_CEILING_MS = 1_800_000;

const root = process.cwd();
const vitestArgs = process.argv.slice(2);

/** The inactivity limit (ms). A non-finite or non-positive override falls back to the 5-min default. */
function hangLimitMs() {
  // biome-ignore lint/style/noProcessEnv: the ORB_TEST_HANG_TIMEOUT_MS knob is this script's contract.
  const raw = Number(process.env["ORB_TEST_HANG_TIMEOUT_MS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HANG_MS;
}

/** The absolute silence ceiling (ms). Past this the tree is killed even if something is still burning CPU —
 *  the backstop for a runaway that never reports. Override: `ORB_TEST_HANG_MAX_MS`. */
function hardCeilingMs() {
  // biome-ignore lint/style/noProcessEnv: the ORB_TEST_HANG_MAX_MS knob is this script's contract.
  const raw = Number(process.env["ORB_TEST_HANG_MAX_MS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HARD_CEILING_MS;
}

/** The liveness decision, as a pure function of the two clocks and the CPU burned since the last tick.
 *  `alive` ⇒ keep going and push the no-CPU timer forward; `kill` ⇒ the shard is wedged (or past the
 *  ceiling); neither ⇒ silent but still inside the window, so just wait. */
function liveness({ sinceOutput, sinceProgress, burned, limit }) {
  const ceilinged = sinceOutput >= hardCeilingMs();
  if (ceilinged) {
    return { alive: false, kill: true, ceilinged: true };
  }
  if (burned >= CPU_PROGRESS_JIFFIES) {
    return { alive: true, kill: false, ceilinged: false };
  }
  return { alive: false, kill: sinceProgress >= limit, ceilinged: false };
}

/** The human reason a shard was declared wedged, for the log line and the dump header. `sinceOutput` and
 *  `sinceProgress` are DIFFERENT clocks on purpose — see the watchdog. */
function wedgeReason(sinceOutput, sinceProgress) {
  const ceiling = hardCeilingMs();
  return sinceOutput >= ceiling
    ? `no output for ${Math.round(sinceOutput / MS_PER_SEC)}s — past the ${Math.round(ceiling / MS_PER_SEC)}s hard ceiling`
    : `no output for ${Math.round(sinceProgress / MS_PER_SEC)}s AND zero CPU across the whole process tree`;
}

function resolveUnder(p) {
  return isAbsolute(p) ? p : join(root, p);
}

function log(line) {
  process.stderr.write(`[vitest-supervised] ${line}\n`);
}

/** Split the passthrough argv into the projects to shard over, the args every shard shares, and the ONE
 *  report path the merged verdict is written to. Both `--x=v` and `--x v` spellings are accepted. */
function parseArgs() {
  const projects = [];
  const baseArgs = [];
  let report = null;
  for (let i = 0; i < vitestArgs.length; i += 1) {
    const a = vitestArgs[i];
    const projectEq = a.match(PROJECT_RE);
    if (projectEq) {
      projects.push(projectEq[1]);
      continue;
    }
    if (a === "--project" && i + 1 < vitestArgs.length) {
      projects.push(vitestArgs[i + 1]);
      i += 1;
      continue;
    }
    const outEq = a.match(OUTPUT_FILE_RE);
    if (outEq) {
      report = resolveUnder(outEq[1]);
      continue;
    }
    if (a === "--outputFile.json" && i + 1 < vitestArgs.length) {
      report = resolveUnder(vitestArgs[i + 1]);
      i += 1;
      continue;
    }
    baseArgs.push(a);
  }
  return { projects, baseArgs, report: report ?? resolveUnder("reports/test-report.json") };
}

/** Read a json report and return the process exit code it implies. Missing / unparseable / an incomplete
 *  run (a vanished test — the worker-crash signature) / any failure ⇒ 1. A COMPLETE all-pass ⇒ 0. */
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

function readProc(pid, file) {
  try {
    return readFileSync(`/proc/${pid}/${file}`, "utf-8").trim();
  } catch {
    return "<unreadable>";
  }
}

/** Every live descendant pid of `pid`, depth-first, via /proc's per-thread `children` lists. */
function descendants(pid) {
  const out = [];
  let tids = [];
  try {
    tids = readdirSync(`/proc/${pid}/task`);
  } catch {
    return out;
  }
  for (const tid of tids) {
    const raw = readProc(pid, `task/${tid}/children`);
    if (raw === "<unreadable>") {
      continue;
    }
    for (const child of raw.split(/\s+/u).filter(Boolean)) {
      out.push(Number(child), ...descendants(Number(child)));
    }
  }
  return [...new Set(out)];
}

/** Total CPU jiffies (utime + stime) burned by `pid` and every descendant. `/proc/<pid>/stat` fields 14/15,
 *  read past the parenthesised comm (which can itself contain spaces). Unreadable/dead pids contribute 0. */
function treeCpuJiffies(pid) {
  let total = 0;
  for (const p of [pid, ...descendants(pid)]) {
    const stat = readProc(p, "stat");
    const tail = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    // After the comm, field 3 is `state`; utime/stime are the overall fields 14/15 ⇒ indices 11/12 here.
    total += (Number(tail[11]) || 0) + (Number(tail[12]) || 0);
  }
  return total;
}

/** One pid's forensic block: state, threads, what the kernel is blocked in, argv, and its open fds. */
function procBlock(pid, label) {
  const status = readProc(pid, "status")
    .split("\n")
    .filter((l) => /^(Name|State|Threads|PPid):/u.test(l))
    .join(" | ");
  let fds = "<unreadable>";
  try {
    fds = readdirSync(`/proc/${pid}/fd`).join(",");
  } catch {
    /* the process may have already gone, or /proc is not Linux-shaped */
  }
  const cmd = readProc(pid, "cmdline").replaceAll("\0", " ");
  return [`${label} pid=${pid}`, `  status : ${status}`, `  wchan  : ${readProc(pid, "wchan")}`, `  cmdline: ${cmd}`, `  fds    : ${fds}`].join("\n");
}

/** The wedge evidence file. Attempt-suffixed so a re-run never overwrites the first wedge's dump. */
function writeWedgeDump(ctx) {
  const { label, attempt, pid, completed, previousFiles, reportFile, sinceOutput, sinceProgress, startedAt } = ctx;
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const path = resolveUnder(join("reports", `test-wedge-${label}-attempt${attempt}-${stamp}.txt`));
  const tree = descendants(pid);
  // The only root-cause lead an intermittent wedge leaves: files the PREVIOUS run of this shard reported
  // that this run never announced as finished. `Pool.run`'s unbounded await is per FILE, so the wedge is
  // one of these.
  const suspects = previousFiles.filter((f) => !completed.has(f));
  const lines = [
    "vitest-supervised WEDGE DUMP",
    `when       : ${new Date().toISOString()}`,
    `shard      : ${label} (attempt ${attempt})`,
    `verdict    : ${wedgeReason(sinceOutput, sinceProgress)}`,
    `shard ran  : ${Math.round((Date.now() - startedAt) / MS_PER_SEC)}s before the kill`,
    `report     : ${reportFile} (${existsSync(reportFile) ? "written" : "ABSENT — the run never finalized"})`,
    `completed  : ${completed.size} files`,
    `last files : ${[...completed].slice(-COMPLETED_TAIL).join("\n             ") || "<none>"}`,
    previousFiles.length === 0
      ? "suspects   : <no previous shard report on disk — rerun once to populate the diff>"
      : `suspects   : ${suspects.length} of ${previousFiles.length} files from the previous run never finished:\n             ${suspects.join("\n             ") || "<none — the wedge is in shutdown, after every file finished>"}`,
    "",
    procBlock(pid, "PARENT"),
    "",
    tree.length === 0 ? "DESCENDANTS: none alive (every worker already exited)" : "DESCENDANTS:",
    ...tree.map((child) => procBlock(child, "  worker")),
  ];
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${lines.join("\n")}\n`);
    log(`wedge dump → ${path}`);
  } catch (error) {
    log(`could not write the wedge dump: ${error.message}`);
  }
}

/** The vitest ESM ENTRY (`vitest.mjs`, a `#!/usr/bin/env node` module), NOT the `.bin/vitest` npm shim —
 *  the shim is a `#!/bin/sh` script and `node <shim>` throws a SyntaxError. ORB_VITEST_BIN (a real node
 *  module) overrides it for the guard test. */
function vitestBin() {
  // biome-ignore lint/style/noProcessEnv: the ORB_VITEST_BIN knob lets the guard test point at a fake vitest.
  return resolveUnder(process.env["ORB_VITEST_BIN"] ?? "node_modules/vitest/vitest.mjs");
}

let activeChild = null;

/** SIGKILL a child's whole process group (negative pid). Best-effort — the group may already be gone. */
function killGroup(child) {
  try {
    if (child?.pid !== undefined) {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    /* ESRCH: already dead */
  }
}

/** Run ONE vitest process to completion or to a wedge. Resolves `{ wedged, code }` — `code` is the child's
 *  own exit code on a natural exit, or the report-derived verdict on a wedge. Never throws. */
function runOnce({ args, reportFile, label, attempt, previousFiles }) {
  const limit = hangLimitMs();
  // Freshness guarantee: a STALE report must never be read as this attempt's verdict.
  rmSync(reportFile, { force: true });
  mkdirSync(dirname(reportFile), { recursive: true });
  // `nice -19` preserves the homelab-protecting priority floor. `detached` makes the child a process-group
  // leader so a wedge can SIGKILL the WHOLE group (parent + orphaned workers).
  const child = spawn("nice", ["-n", "19", process.execPath, vitestBin(), ...args], {
    cwd: root,
    detached: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  activeChild = child;
  const completed = new Set();
  // TWO clocks, and they must stay separate: `lastOutput` only moves on real output, `lastProgress` also
  // moves on CPU burn. The no-output-and-no-CPU rule reads `lastProgress`; the ABSOLUTE ceiling reads
  // `lastOutput` — sharing one clock made the ceiling unreachable, because a busy tree reset it every tick.
  let lastOutput = Date.now();
  let lastProgress = Date.now();
  let carry = "";
  function absorb(chunk) {
    lastOutput = Date.now();
    lastProgress = lastOutput;
    const text = carry + chunk.toString();
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      const m = line.match(RESULT_LINE_RE);
      if (m) {
        completed.add(m[1]);
      }
    }
  }
  child.stdout.on("data", (c) => {
    process.stdout.write(c);
    absorb(c);
  });
  child.stderr.on("data", (c) => {
    process.stderr.write(c);
    absorb(c);
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(watchdog);
      activeChild = null;
      resolve(value);
    };
    const tickMs = Math.max(WATCHDOG_MIN_MS, Math.min(WATCHDOG_MAX_MS, Math.floor(limit / WATCHDOG_DIVISOR)));
    const startedAt = Date.now();
    let lastCpu = child.pid === undefined ? 0 : treeCpuJiffies(child.pid);
    const watchdog = setInterval(() => {
      // PROGRESS, not silence, is the liveness signal (2026-09-01 capture — see the header). A single long
      // test file emits nothing for its whole duration, so CPU burned anywhere in the process tree counts
      // as activity exactly like output does.
      const cpu = child.pid === undefined ? lastCpu : treeCpuJiffies(child.pid);
      const burned = cpu - lastCpu;
      lastCpu = cpu;
      const sinceOutput = Date.now() - lastOutput;
      const sinceProgress = Date.now() - lastProgress;
      const { alive, kill, ceilinged } = liveness({ sinceOutput, sinceProgress, burned, limit });
      if (alive) {
        lastProgress = Date.now(); // CPU progress counts as activity, exactly like output.
        return;
      }
      if (!kill) {
        return;
      }
      log(`${label}: ${wedgeReason(sinceOutput, sinceProgress)} — WEDGED`);
      log(
        ceilinged
          ? "(the ceiling backstop: something is still running but has reported nothing for far too long). Dumping + killing."
          : "(#345/#1012: a task resolver never settled, so ctx.exit()'s teardown backstop was never armed). Dumping + killing.",
      );
      if (child.pid !== undefined) {
        writeWedgeDump({ label, attempt, pid: child.pid, completed, previousFiles, reportFile, sinceOutput, sinceProgress, startedAt });
      }
      killGroup(child);
      finish({ wedged: true, code: verdictFromReport(reportFile) });
    }, tickMs).unref();

    child.on("error", (err) => {
      log(`${label}: failed to spawn vitest: ${err.message}`);
      finish({ wedged: false, code: 1 });
    });
    // A signal-terminated child (not by us — the wedge path settles first) is a failure, never a silent pass.
    child.on("exit", (code, signal) => finish({ wedged: false, code: signal ? 1 : (code ?? 1) }));
  });
}

/** Every test file the previous run of this shard reported, used for the wedge dump's suspect diff. The
 *  previous report is MOVED aside (not read in place) so the freshness guarantee is untouched. */
function rotatePrevious(reportFile) {
  const prev = reportFile.replace(/\.json$/u, ".prev.json");
  if (existsSync(reportFile)) {
    try {
      renameSync(reportFile, prev);
    } catch {
      /* a rotate failure only costs the suspect diff */
    }
  }
  try {
    const parsed = JSON.parse(readFileSync(prev, "utf-8"));
    return (parsed.testResults ?? []).map((r) => r.name).filter((n) => typeof n === "string");
  } catch {
    return [];
  }
}

/** Run one shard, with ONE automatic re-run if the watchdog had to kill it AND its report is not a complete
 *  pass. A shard that FAILS TESTS is never re-run — a wedge is a tool error, a red is a verdict. */
async function runShard({ args, reportFile, label }) {
  const previousFiles = rotatePrevious(reportFile);
  let result = await runOnce({ args, reportFile, label, attempt: 1, previousFiles });
  let wedges = result.wedged ? 1 : 0;
  if (result.wedged && result.code !== 0) {
    log(`${label}: WEDGED with an incomplete report — re-running this shard once (attempt ${MAX_ATTEMPTS}).`);
    result = await runOnce({ args, reportFile, label, attempt: MAX_ATTEMPTS, previousFiles });
    if (result.wedged) {
      wedges += 1;
    }
  }
  // A run that EXITED mirrors vitest's own exit code (unchanged from #345): vitest finalized, so its code
  // is a verdict. The report is only consulted when the watchdog had to kill a wedged parent.
  return { label, code: result.code, wedges, reportFile };
}

/** Fold the shard reports into the ONE `--outputFile.json` contract the rest of the repo reads. Numeric
 *  `num*` counters sum, `testResults` concatenate, and `success` is true only when every shard's own
 *  verdict is 0 — so the merged file satisfies the SAME predicate a single run's report does. */
function foldShardInto(merged, shard) {
  merged.orbShards.push({ project: shard.label, exitCode: shard.code, wedges: shard.wedges });
  let report;
  try {
    report = JSON.parse(readFileSync(shard.reportFile, "utf-8"));
  } catch {
    merged.success = false; // a shard that wrote no report can never make the merged file complete.
    return;
  }
  for (const [key, value] of Object.entries(report)) {
    if (key.startsWith("num") && typeof value === "number") {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  if (Array.isArray(report.testResults)) {
    merged.testResults.push(...report.testResults);
  }
  const earliest = merged.startTime;
  if (typeof report.startTime === "number" && (earliest === undefined || report.startTime < earliest)) {
    merged.startTime = report.startTime;
  }
}

function mergeReports(shards, out) {
  const merged = { success: shards.every((s) => s.code === 0), testResults: [], orbShards: [] };
  for (const shard of shards) {
    foldShardInto(merged, shard);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(merged));
}

async function main() {
  const { projects, baseArgs, report } = parseArgs();
  // Forward terminal signals to the running child group (detached children don't receive them automatically).
  const onSignal = () => {
    killGroup(activeChild);
    process.exit(1);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  // Fewer than two projects: nothing to shard. Run once, at the caller's own report path.
  if (projects.length < 2) {
    const args = [...baseArgs, ...projects.flatMap((p) => ["--project", p]), `--outputFile.json=${report}`];
    const shard = await runShard({ args, reportFile: report, label: projects[0] ?? "all" });
    if (shard.wedges > 0) {
      log(`WEDGE CONTAINED: the run was killed ${shard.wedges}× by the watchdog — this green is contained, not clean.`);
    }
    process.exit(shard.code);
  }

  const shardDir = join(dirname(report), "test-shards");
  const shards = [];
  for (const project of projects) {
    const reportFile = join(shardDir, `${project}.json`);
    const args = [...baseArgs, "--project", project, `--outputFile.json=${reportFile}`];
    log(`shard ${shards.length + 1}/${projects.length}: ${project}`);
    // Sequential ON PURPOSE: one vitest process at a time is the whole containment mechanism (a wedge is a
    // per-process shutdown race), and the projects share one worker budget on a co-hosted box.
    shards.push(await runShard({ args, reportFile, label: project }));
  }
  mergeReports(shards, report);
  const rerun = shards.filter((s) => s.wedges > 0);
  if (rerun.length > 0) {
    log(`WEDGE CONTAINED — ${rerun.map((s) => `${s.label} (killed ${s.wedges}×)`).join(", ")}. Evidence: reports/test-wedge-*.txt.`);
    log("This verdict is CONTAINED, not clean: the shard(s) above hit the vitest #345/#1012 shutdown wedge.");
  }
  for (const shard of shards) {
    log(`shard ${shard.label}: exit ${shard.code}${shard.wedges > 0 ? ` (after ${shard.wedges} wedge kill(s))` : ""}`);
  }
  process.exit(shards.every((s) => s.code === 0) ? 0 : 1);
}

await main();
