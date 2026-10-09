#!/usr/bin/env node
// Sequential native project runs retain complete reports and contain stalled process groups.
// Output and process-tree CPU activity have separate deadlines; an active but silent tree still has a ceiling.
// A killed or crashed final attempt is a tool error, never an assertion verdict or proof of a shutdown hang.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as pathResolve, relative } from "node:path";
import process from "node:process";
import type { RunAlias } from "@orb/tooling/_shared/artifacts";
import { openRunSlot, publishRunSlot, reportsPath, runFile } from "@orb/tooling/_shared/artifacts";
import { readStageBudgets } from "@orb/tooling/_shared/concurrency-profile";
import { LOAD_SUSPECT_META_KEY } from "@orb/tooling/_shared/load-budget";
import { listProcesses, processDiagnostics, processTreeCpuMs } from "@orb/tooling/_shared/platform";
import { signalOfExitCode } from "@orb/tooling/_shared/proc-signals";
import { processEnvValue, testProcessEnv } from "@orb/tooling/_shared/process-env";
import { nicedCommand } from "@orb/tooling/_shared/process-priority";

const DEFAULT_HANG_MS = 300_000;
const MS_PER_SEC = 1000;
const WATCHDOG_MIN_MS = 1000;
const WATCHDOG_MAX_MS = 15_000;
const WATCHDOG_DIVISOR = 4;
const OUTPUT_FILE_RE = /^--outputFile\.json=(.+)$/u;
const PROJECT_RE = /^--project=(.+)$/u;
const CONFIG_RE = /^--config=(.+)$/u;
/** A default-reporter per-file result line: `  ✓ |integration| tests/x/y.int.test.ts (3 tests) 12ms`. */
const RESULT_LINE_RE = /^\s*[✓×❯↓]\s+\|[^|]*\|\s+(\S+)/u;
const COMPLETED_TAIL = 8;
const OUTPUT_TAIL = 12;
const OUTPUT_LINE_LIMIT = 2048;
const MAX_ATTEMPTS = 2;
/** THE SECOND NON-VERDICT SHAPE (#2472). A WEDGE is not the only way vitest fails to produce a verdict: a
 *  worker fork can DIE — SIGKILL, a heap abort, an OOM reap — and vitest then FINALIZES NORMALLY and exits
 *  1, the same number a real `expect` failure exits with. Measured 2026-09-20 with a spec that SIGKILLs its
 *  own fork: exit 1, the lines below on stderr, and NO json report written at all, so nothing downstream
 *  can tell the two apart. That made `tests:instrument-affected` record `ok:false, exitCode:1` — "your
 *  tests failed" — over a harness that died, which is the exact reading the owner ruling forbids ("a
 *  checker OOM / kill / timeout is exit-2 class; THE RUN IS NOT A VERDICT").
 *
 *  The #1490 ruling in the header is not reversed, it is EXTENDED: its mechanism (a run that never
 *  finalized is a TOOL ERROR, never a number) was keyed on the one non-verdict shape known then. The input
 *  changed — there is a second one, and it needs no watchdog because vitest announces it. These patterns
 *  are the pool's OWN framing, matched on the stream `absorb()` already reads for the watchdog; each
 *  carries the sentence the refusal prints, so the exit says WHAT died and not merely that something did. */
const NON_VERDICT_PATTERNS = [
  { re: /\[vitest-pool\]:/u, what: "the vitest worker pool raised an unhandled error" },
  { re: /Worker exited unexpectedly/u, what: "a vitest worker fork exited without reporting its files" },
  { re: /JavaScript heap out of memory/u, what: "a vitest process aborted on a JavaScript heap OOM" },
  { re: /ERR_IPC_CHANNEL_CLOSED/u, what: "a vitest worker's IPC channel closed mid-run" },
];
/** CPU jiffies (10 ms each) the process tree must burn between ticks to count as ALIVE. A wedged tree sits
 *  in `ep_poll` at exactly 0; any real work is orders of magnitude above this. */
const CPU_PROGRESS_JIFFIES = 5;
const DEFAULT_HARD_CEILING_MS = readStageBudgets().vitestHardCeilingMs;
/** The repo's exit-code contract (`UNIFIED-VERIFICATION-DESIGN.md`): 0 clean · 1 violations · 2 TOOL ERROR
 *  · 3 misuse. A run whose LAST attempt had to be KILLED never finished, so its number is 2 — see the
 *  "A CONTAINED WEDGE IS A TOOL ERROR" note in the header. */
const EXIT_TOOL_ERROR = 2;
const EXIT_MISUSE = 3;
const RUNTIME_ONLY_FLAG = "--runtime-only";
const ROOT_CONFIG = join(process.cwd(), "vitest.config.ts");
const RUNTIME_CONFIG = join(process.cwd(), "vitest.runtime.config.ts");

const root = process.cwd();

/** One `vitest --reporter=json` report, read only through the fields this runner consumes. Every field is
 *  optional because a crashed or foreign report is exactly the input the verdict must survive, and the
 *  counters are `unknown` because the verdict coerces them with `Number()` rather than trusting the file. */
interface VitestJsonReport {
  success?: boolean;
  numTotalTests?: unknown;
  numPassedTests?: unknown;
  numFailedTests?: unknown;
  numPendingTests?: unknown;
  numTodoTests?: unknown;
  numFailedTestSuites?: unknown;
  startTime?: unknown;
  testResults?: readonly VitestFileResult[];
  orbShards?: readonly ShardEvidence[];
}

interface VitestFileResult {
  name?: string;
  assertionResults?: readonly { fullName?: string; title?: string; meta?: Readonly<Record<string, unknown>> }[];
}

/** One attempt's outcome. `unreported` is present only when the child EXITED (a wedge settles first). */
interface AttemptResult {
  wedged: boolean;
  code: number;
  nonVerdict: string | null;
  unreported?: readonly string[];
}

interface ShardResult {
  label: string;
  code: number;
  wedged: boolean;
  wedges: number;
  reportFile: string;
  nonVerdict: string | null;
  unreported: readonly string[];
  loadSuspect: readonly string[];
}

/** The `orbShards[]` provenance row both the merged report and a stamped unsharded report carry. */
interface ShardEvidence {
  project: string;
  exitCode: number;
  wedges: number;
  nonVerdict: string | null;
  unreported: readonly string[];
  loadSuspect: readonly string[];
}

/** The merged verdict this runner WRITES: its own counters are numbers, unlike the reports it reads. */
interface MergedReport {
  success: boolean;
  testResults: VitestFileResult[];
  orbShards: ShardEvidence[];
  startTime?: number;
  [counter: `num${string}`]: number | undefined;
}

interface WedgeDumpContext {
  label: string;
  attempt: number;
  pid: number;
  completed: ReadonlySet<string>;
  previousFiles: readonly string[];
  reportFile: string;
  sinceOutput: number;
  sinceProgress: number;
  startedAt: number;
  recentOutput: readonly string[];
}

interface AttemptRequest {
  args: readonly string[];
  reportFile: string;
  label: string;
  attempt: number;
  previousFiles: readonly string[];
}

/** A parsed json report, or null when the file is missing or not JSON. */
function readReport(path: string): VitestJsonReport | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as VitestJsonReport;
  } catch {
    return null;
  }
}
/** THIS invocation's private artifact slot (#1029, `_shared/artifacts.ts`). Every shard report, the merged
 *  report and every wedge dump land under `reports/runs/test/<runId>/`; `reports/test-report.json` and
 *  `reports/test-shards/` are `latest` symlinks published at the END of the run. Two `pnpm test` runs on one
 *  checkout therefore cannot overwrite each other's verdict — before this, both wrote the same three paths
 *  and the second run's merge silently became the first run's evidence. */
const slot = openRunSlot(root, "test");
const vitestArgs = process.argv.slice(2);

/** The inactivity limit (ms). A non-finite or non-positive override falls back to the 5-min default. */
function hangLimitMs(): number {
  const raw = Number(processEnvValue("ORB_TEST_HANG_TIMEOUT_MS"));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HANG_MS;
}

/** The absolute silence ceiling (ms). Past this the tree is killed even if something is still burning CPU —
 *  the backstop for a runaway that never reports. Override: `ORB_TEST_HANG_MAX_MS`. */
function hardCeilingMs(): number {
  const raw = Number(processEnvValue("ORB_TEST_HANG_MAX_MS"));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HARD_CEILING_MS;
}

/** The liveness decision, as a pure function of the two clocks and the CPU burned since the last tick.
 *  `alive` ⇒ keep going and push the no-CPU timer forward; `kill` ⇒ the shard is wedged (or past the
 *  ceiling); neither ⇒ silent but still inside the window, so just wait. */
function liveness({ sinceOutput, sinceProgress, burned, limit }: { sinceOutput: number; sinceProgress: number; burned: number; limit: number }): {
  alive: boolean;
  kill: boolean;
  ceilinged: boolean;
} {
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
function wedgeReason(sinceOutput: number, sinceProgress: number): string {
  const ceiling = hardCeilingMs();
  return sinceOutput >= ceiling
    ? `no output for ${Math.round(sinceOutput / MS_PER_SEC)}s — past the ${Math.round(ceiling / MS_PER_SEC)}s hard ceiling`
    : `no output for ${Math.round(sinceProgress / MS_PER_SEC)}s AND zero CPU across the whole process tree`;
}

function resolveUnder(p: string): string {
  return isAbsolute(p) ? p : pathResolve(root, p);
}

/** The merged report's published name, and the shard directory's. */
const REPORT_NAME = "test-report.json";
const SHARDS_DIR = "test-shards";

/** The `reports/`-relative alias a caller-named report path publishes as, or null when the caller pointed
 *  the report OUTSIDE `reports/` — an explicit path is honored where NAMED (the `artifactFilePath`
 *  precedent), and only paths inside `reports/` take part in the `latest` pointer layout. */
function aliasFor(reportPath: string): string | null {
  const rel = relative(reportsPath(root, "."), reportPath);
  return rel.startsWith("..") || isAbsolute(rel) ? null : rel;
}

function log(line: string): void {
  process.stderr.write(`[vitest-supervised] ${line}\n`);
}

/** Split the passthrough argv into the projects to shard over, the args every shard shares, and the ONE
 *  report path the merged verdict is written to. Both `--x=v` and `--x v` spellings are accepted. */
function parseArgs(): { projects: string[]; baseArgs: string[]; report: string; runtimeOnly: boolean; unsupportedConfig: string | undefined } {
  const projects: string[] = [];
  const baseArgs: string[] = [];
  let report: string | null = null;
  let runtimeOnly = false;
  for (let i = 0; i < vitestArgs.length; i += 1) {
    const a = vitestArgs[i] as string;
    if (a === RUNTIME_ONLY_FLAG) {
      runtimeOnly = true;
      continue;
    }
    const projectEq = a.match(PROJECT_RE);
    if (projectEq?.[1] !== undefined) {
      projects.push(projectEq[1]);
      continue;
    }
    if (a === "--project" && i + 1 < vitestArgs.length) {
      projects.push(vitestArgs[i + 1] as string);
      i += 1;
      continue;
    }
    const outEq = a.match(OUTPUT_FILE_RE);
    if (outEq?.[1] !== undefined) {
      report = resolveUnder(outEq[1]);
      continue;
    }
    if (a === "--outputFile.json" && i + 1 < vitestArgs.length) {
      report = resolveUnder(vitestArgs[i + 1] as string);
      i += 1;
      continue;
    }
    baseArgs.push(a);
  }
  const unsupportedConfig = runtimeOnly ? configuredPaths(baseArgs).find((config) => config !== ROOT_CONFIG) : undefined;
  return { projects: [...new Set(projects)], baseArgs, report: report ?? reportsPath(root, REPORT_NAME), runtimeOnly, unsupportedConfig };
}

/** Config paths are observed without consuming them; Vitest remains the parser and rejects malformed forms. */
function configuredPaths(args: readonly string[]): string[] {
  const configs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const equalForm = args[i]?.match(CONFIG_RE);
    if (equalForm?.[1] !== undefined) {
      configs.push(resolveUnder(equalForm[1]));
    } else if (args[i] === "--config" && i + 1 < args.length) {
      configs.push(resolveUnder(args[i + 1] as string));
      i += 1;
    }
  }
  return configs;
}

/** Replace an optional explicit root config with the runtime entry point. A malformed bare `--config`
 * remains misuse instead of being silently repaired into a different command. */
function runtimeConfigArgs(args: readonly string[]): string[] | null {
  const runtimeArgs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (CONFIG_RE.test(arg)) {
      continue;
    }
    if (arg === "--config") {
      if (i + 1 >= args.length) {
        return null;
      }
      i += 1;
      continue;
    }
    runtimeArgs.push(arg);
  }
  runtimeArgs.push(`--config=${RUNTIME_CONFIG}`);
  return runtimeArgs;
}

/** Only literal project names are safe to shard. Filters must stay together because Vitest evaluates
 * repeated selectors as one union; splitting them changes selection and can execute a project twice. */
function exactProjectSelector(project: string): boolean {
  return !(project.startsWith("!") || project.includes("*"));
}

/** Read a json report and return the process exit code it implies. Missing / unparseable / an incomplete
 *  run (a vanished test — the worker-crash signature) / any failure ⇒ 1. A COMPLETE all-pass ⇒ 0. */
function verdictFromReport(path: string): number {
  const report = readReport(path);
  if (report === null) {
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

/** Every load-suspect arm in a shard report, as `<file> › <test title>` lines. Read from `meta` because
 *  the stderr line is attributed to no test. A missing/unparseable report yields none — that case is
 *  already a verdict-level failure via `verdictFromReport`. */
function loadSuspectFromReport(path: string): string[] {
  const report = readReport(path);
  if (report === null) {
    return [];
  }
  const out: string[] = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (typeof assertion.meta?.[LOAD_SUSPECT_META_KEY] === "string") {
        out.push(`${relative(root, file.name ?? "<unknown file>")} › ${assertion.fullName ?? assertion.title}`);
      }
    }
  }
  return out;
}

/** Every live descendant pid of `pid`, from one process-table read. */
function descendants(pid: number): number[] {
  const children = new Map<number, number[]>();
  for (const entry of listProcesses()) {
    if (entry.ppid !== null) {
      children.set(entry.ppid, [...(children.get(entry.ppid) ?? []), entry.pid]);
    }
  }
  const out: number[] = [];
  const queue = [pid];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (!out.includes(child)) {
        out.push(child);
        queue.push(child);
      }
    }
  }
  return out;
}

/** One pid's forensic block: what the platform can say about it (state, threads, wchan and fds on Linux;
 *  the command line everywhere). */
function procBlock(pid: number, label: string): string {
  return [`${label} pid=${pid}`, processDiagnostics(pid)].join("\n");
}

/** The wedge evidence file. Attempt-suffixed so a re-run never overwrites the first wedge's dump. */
function writeWedgeDump(ctx: WedgeDumpContext): void {
  const { label, attempt, pid, completed, previousFiles, reportFile, sinceOutput, sinceProgress, startedAt } = ctx;
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const path = runFile(slot, `test-wedge-${label}-attempt${attempt}-${stamp}.txt`);
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
    `last output: ${ctx.recentOutput.join("\n             ") || "<none>"}`,
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
    log(`could not write the wedge dump: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The vitest ESM ENTRY (`vitest.mjs`, a `#!/usr/bin/env node` module), NOT the `.bin/vitest` npm shim —
 *  the shim is a `#!/bin/sh` script and `node <shim>` throws a SyntaxError. ORB_VITEST_BIN (a real node
 *  module) overrides it for the guard test. */
function vitestBin(): string {
  return resolveUnder(processEnvValue("ORB_VITEST_BIN") ?? "node_modules/vitest/vitest.mjs");
}

/** The spec operands a caller NAMED that never printed a result line (#2472). "Not a verdict" must never
 *  degrade to "no information": when a fork dies, the reader needs the files that went down with it, not
 *  just the fact that something did. Only positional operands can be enumerated — a whole-project run
 *  names no files, and this correctly answers `[]` there rather than inventing a set. `completed` holds the
 *  paths the default reporter printed, which are repo-relative exactly like the operands. */
function unreportedSpecs(args: readonly string[], completed: ReadonlySet<string>): string[] {
  // The operand block is the run of non-flag arguments IMMEDIATELY after the `run` subcommand, and nothing
  // else. Anything looser mistakes a flag's VALUE for a file (`--project tooling`, `--config <path>`) and
  // names a spec that never existed, which is a worse lie than the one being fixed. Under-claiming is safe:
  // it degrades to the honest "the file set was not enumerated by operand" line.
  const start = args.indexOf("run") + 1;
  const operands: string[] = [];
  for (let i = start; i > 0 && i < args.length && !(args[i] as string).startsWith("-"); i += 1) {
    operands.push(args[i] as string);
  }
  return operands.filter((operand) => ![...completed].some((done) => done === operand || done.endsWith(operand) || operand.endsWith(done)));
}

let activeChild: ChildProcess | null = null;

function retainOutput(lines: string[], line: string): void {
  if (line.trim().length === 0) {
    return;
  }
  lines.push(line.length > OUTPUT_LINE_LIMIT ? `${line.slice(0, OUTPUT_LINE_LIMIT)} [truncated]` : line);
  if (lines.length > OUTPUT_TAIL) {
    lines.shift();
  }
}

/** SIGKILL a child's whole process group (negative pid). Best-effort — the group may already be gone. */
function killGroup(child: ChildProcess | null): void {
  try {
    if (child?.pid !== undefined) {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    /* ESRCH: already dead */
  }
}

/** Run ONE vitest process to completion or to a wedge. Resolves `{ wedged, code, nonVerdict }` — `code` is
 *  the child's own exit code on a natural exit, or the report-derived verdict on a wedge; `nonVerdict` is
 *  the sentence naming what DIED when this attempt produced no verdict at all (#2472), else null. Never
 *  throws. */
function runOnce({ args, reportFile, label, attempt, previousFiles }: AttemptRequest): Promise<AttemptResult> {
  const limit = hangLimitMs();
  // Freshness guarantee: a STALE report must never be read as this attempt's verdict.
  rmSync(reportFile, { force: true });
  mkdirSync(dirname(reportFile), { recursive: true });
  // `nicedCommand` keeps the homelab-protecting priority floor. `detached` makes the child a process-group
  // leader so a wedge can SIGKILL the WHOLE group (parent + orphaned workers).
  const niced = nicedCommand(process.execPath, [vitestBin(), ...args]);
  const child = spawn(niced.command, niced.args, {
    cwd: root,
    env: testProcessEnv(),
    detached: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  activeChild = child;
  const completed = new Set<string>();
  const recentOutput: string[] = [];
  // TWO clocks, and they must stay separate: `lastOutput` only moves on real output, `lastProgress` also
  // moves on CPU burn. The no-output-and-no-CPU rule reads `lastProgress`; the ABSOLUTE ceiling reads
  // `lastOutput` — sharing one clock made the ceiling unreachable, because a busy tree reset it every tick.
  let lastOutput = Date.now();
  let lastProgress = Date.now();
  let carry = "";
  // The FIRST non-verdict sentence this attempt printed, or null. First rather than last on purpose: the
  // pool's own framing line comes before the stack that repeats it, and one crash is already enough to
  // disqualify the run's number.
  let nonVerdict: string | null = null;
  function absorb(chunk: Buffer): void {
    lastOutput = Date.now();
    lastProgress = lastOutput;
    const text = carry + chunk.toString();
    const lines = text.split(/\r?\n/u);
    carry = lines.pop() ?? "";
    for (const line of lines) {
      retainOutput(recentOutput, line);
      const m = line.match(RESULT_LINE_RE);
      if (m?.[1] !== undefined) {
        completed.add(m[1]);
      }
      if (nonVerdict === null) {
        nonVerdict = NON_VERDICT_PATTERNS.find((pattern) => pattern.re.test(line))?.what ?? null;
      }
    }
  }
  child.stdout.on("data", (c: Buffer) => {
    process.stdout.write(c);
    absorb(c);
  });
  child.stderr.on("data", (c: Buffer) => {
    process.stderr.write(c);
    absorb(c);
  });

  return new Promise<AttemptResult>((resolve) => {
    let settled = false;
    const finish = (value: AttemptResult): void => {
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
    let lastCpu = child.pid === undefined ? 0 : processTreeCpuMs(child.pid);
    const watchdog = setInterval(() => {
      // PROGRESS, not silence, is the liveness signal (2026-09-01 capture — see the header). A single long
      // test file emits nothing for its whole duration, so CPU burned anywhere in the process tree counts
      // as activity exactly like output does.
      const cpu = child.pid === undefined ? lastCpu : processTreeCpuMs(child.pid);
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
          : "(no observed output or process-tree CPU progress; the stalled phase is not established). Dumping + killing.",
      );
      if (child.pid !== undefined) {
        writeWedgeDump({ label, attempt, pid: child.pid, completed, previousFiles, reportFile, sinceOutput, sinceProgress, startedAt, recentOutput });
      }
      killGroup(child);
      finish({ wedged: true, code: verdictFromReport(reportFile), nonVerdict });
    }, tickMs).unref();

    child.on("error", (err) => {
      log(`${label}: failed to spawn vitest: ${err.message}`);
      finish({ wedged: false, code: 1, nonVerdict: `vitest could not be spawned at all (${err.message})` });
    });
    // A signal-terminated child (not by us — the wedge path settles first) is a failure, never a silent
    // pass — and since #2472 it is not a VERDICT either. A vitest the kernel killed (SIGKILL from an OOM
    // reap, SIGABRT from a heap abort, SIGSEGV) never finalized, which is the owner's exit-2 class in its
    // purest form: "exit 134/137, a heap abort, or a wall-clock kill … means THE RUN IS NOT A VERDICT".
    // On win32 the direct child is the niced-exec launcher, which mirrors vitest's signal death as 128+N; read
    // the signal back through that convention too, or a kernel-killed vitest reads as a product red.
    child.on("exit", (code, signal) => {
      const died = signal ?? (code === null ? null : signalOfExitCode(code));
      finish({
        wedged: false,
        code: died === null ? (code ?? 1) : 1,
        nonVerdict: died === null ? nonVerdict : `the vitest process itself was terminated by ${died} before it finalized`,
        unreported: unreportedSpecs(args, completed),
      });
    });
  });
}

/** Every test file the PREVIOUS run of this shard reported, for the wedge dump's suspect diff. Read through
 *  the published `reports/test-shards/<label>.json` pointer (#1029): this run writes into its own slot, so
 *  the previous run's report is a different file — the rotate-aside dance that used to protect freshness is
 *  structurally unnecessary now, and rotating would have corrupted a concurrent run's evidence. */
function previousShardFiles(label: string): string[] {
  const parsed = readReport(reportsPath(root, SHARDS_DIR, `${label}.json`));
  return (parsed?.testResults ?? []).map((r) => r.name).filter((n) => typeof n === "string");
}

/** Run one shard, with ONE automatic re-run if the watchdog had to kill it AND its report is not a complete
 *  pass. A shard that FAILS TESTS is never re-run — a wedge is a tool error, a red is a verdict. */
async function runShard({ args, reportFile, label }: { args: readonly string[]; reportFile: string; label: string }): Promise<ShardResult> {
  const previousFiles = previousShardFiles(label);
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
  //
  // `wedged` is the LAST attempt's state, and it is NOT the same fact as `wedges > 0` (#1490). A shard that
  // wedged and then RE-RAN to a natural exit has a real verdict — vitest finalized on attempt 2 — while a
  // shard whose final attempt was killed has only a report we read off the floor. The caller's exit code
  // keys on `wedged`; the count stays for the evidence line.
  // `nonVerdict` is the LAST attempt's, for the same reason `wedged` is: a shard that crashed a fork and
  // then RE-RAN to a clean finalize has a real verdict on the attempt that counts (#2472).
  return {
    label,
    code: result.code,
    wedged: result.wedged,
    wedges,
    reportFile,
    nonVerdict: result.nonVerdict ?? null,
    unreported: result.unreported ?? [],
    loadSuspect: loadSuspectFromReport(reportFile),
  };
}

/** Fold the shard reports into the ONE `--outputFile.json` contract the rest of the repo reads. Numeric
 *  `num*` counters sum, `testResults` concatenate, and `success` is true only when every shard's own
 *  verdict is 0 — so the merged file satisfies the SAME predicate a single run's report does. */
function foldShardInto(merged: MergedReport, shard: ShardResult): void {
  merged.orbShards.push({
    project: shard.label,
    exitCode: shard.code,
    wedges: shard.wedges,
    // The #2472 evidence lands in the ARTIFACT too, not only on stderr: a reader parsing the report must be
    // able to tell a dead harness from a red without having kept the scrollback.
    nonVerdict: shard.nonVerdict,
    unreported: shard.unreported,
    loadSuspect: shard.loadSuspect,
  });
  const report = readReport(shard.reportFile);
  if (report === null) {
    merged.success = false; // a shard that wrote no report can never make the merged file complete.
    return;
  }
  for (const [key, value] of Object.entries(report)) {
    if (key.startsWith("num") && typeof value === "number") {
      const counter = key as `num${string}`;
      merged[counter] = (merged[counter] ?? 0) + value;
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

/** THE RUN'S ONE EXIT CODE (#1490). A CONTAINED WEDGE IS A TOOL ERROR, never a verdict: the watchdog had
 *  to SIGKILL a vitest that never finalized, and the code we hand back was read off whatever report the
 *  corpse happened to leave. Before this, a shard that wedged AFTER writing a complete-pass report finished
 *  as `{ wedged: true, code: 0 }`, was not re-run (the re-run only fires on a non-zero code), and
 *  `process.exit(shard.code)` shipped a 0 — so `pnpm verify --push`, which keys on the exit code, read a
 *  killed run as green. The containment MECHANISM is unchanged (kill · dump · consult the report · one
 *  re-run); only the number is honest now. A shard that wedged and then RE-RAN to a natural exit is still
 *  0/1: that attempt finalized, which is exactly what the re-run is for.
 *
 *  #2472 EXTENDS THAT RULING WITHOUT REVERSING IT. The wedge was the only non-verdict shape this function
 *  knew, because it was the only one that needed a watchdog to notice. A DEAD WORKER FORK needs none —
 *  vitest announces it, finalizes normally, and exits 1, the same number a real `expect` failure exits
 *  with. Same mechanism ("a run that never finalized is not a number"), new input. A shard that crashed a
 *  fork AND has genuine reds is still 2: the files that went down with the fork never reported, so what
 *  survives is a partial observation, not a verdict — `announceNonVerdicts` prints both halves so
 *  "not a verdict" never degrades into "no information". */
function exitCodeFor(shards: readonly ShardResult[]): number {
  if (shards.some((s) => s.wedged || s.nonVerdict !== null)) {
    return EXIT_TOOL_ERROR;
  }
  return shards.every((s) => s.code === 0) ? 0 : 1;
}

function mergeReports(shards: readonly ShardResult[], out: string): void {
  // `success` obeys the same rule as the exit code: a run whose final attempt was killed is not a pass,
  // whatever the report the corpse left behind says (#1490).
  // …and a shard whose fork died is not a pass either, for the same reason: some files never reported (#2472).
  const merged: MergedReport = { success: shards.every((s) => s.code === 0 && !s.wedged && s.nonVerdict === null), testResults: [], orbShards: [] };
  for (const shard of shards) {
    foldShardInto(merged, shard);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(merged));
}

/** Publish this run's `latest` pointers — at the END, so a reader at `reports/test-report.json` always
 *  resolves to a run that FINISHED. `alias === null` means the caller named a path outside `reports/` and
 *  the merged report already landed there. */
function publish(alias: string | null, sharded: boolean): void {
  if (alias === null) {
    return;
  }
  if (!existsSync(runFile(slot, REPORT_NAME))) {
    log(`no finalized report; available evidence is in ${slot.relDir}`);
    return;
  }
  const aliases: RunAlias[] = [{ alias, target: REPORT_NAME }];
  if (sharded) {
    aliases.push({ alias: SHARDS_DIR, target: SHARDS_DIR });
  }
  publishRunSlot(root, slot, aliases);
  log(`report → ${slot.relDir}/${REPORT_NAME} (published at reports/${alias})`);
}

/** Shout every wedge kill, and say what it costs the verdict. Both call sites (sharded and not) go through
 *  here so the containment story is spelled ONCE — a green that hides a wedge reads as "fixed" when it is
 *  only "contained", and since #1490 a run whose final attempt was killed is not even green. */
function announceWedges(shards: readonly ShardResult[]): void {
  const hit = shards.filter((s) => s.wedges > 0);
  if (hit.length === 0) {
    return;
  }
  log(`WEDGE CONTAINED — ${hit.map((s) => `${s.label} (killed ${s.wedges}×)`).join(", ")}. Evidence: ${slot.relDir}/test-wedge-*.txt.`);
  log("This run is CONTAINED, not clean: the watchdog stopped the shard(s); the dumps do not establish a shutdown hang.");
  const unfinished = shards.filter((s) => s.wedged);
  if (unfinished.length > 0) {
    log(
      `EXIT ${EXIT_TOOL_ERROR} (TOOL ERROR, not a verdict): ${unfinished.map((s) => s.label).join(", ")} — the LAST attempt was killed, so vitest never finalized. Re-run on a quiet tree.`,
    );
  }
}

/** Stamp the non-verdict into the report vitest itself wrote (#2472). The UNSHARDED path has no merge step
 *  — vitest writes the caller's report file directly — and its report is actively misleading after a fork
 *  death: measured 2026-09-20, a spec whose fork was SIGKILLed lands in `testResults` as `passed`, because
 *  nothing ever reported a failure for it. `success` and `orbShards` are the two keys every downstream
 *  reader already consults, so the correction goes THERE rather than into a second vocabulary. A report
 *  that cannot be read or written is not escalated: the exit code is already 2 and already correct. */
function stampNonVerdict(reportFile: string, shard: ShardResult): void {
  if (shard.nonVerdict === null) {
    return;
  }
  try {
    const report = JSON.parse(readFileSync(reportFile, "utf-8")) as VitestJsonReport;
    report.success = false;
    report.orbShards = [
      {
        project: shard.label,
        exitCode: shard.code,
        wedges: shard.wedges,
        nonVerdict: shard.nonVerdict,
        unreported: shard.unreported,
        loadSuspect: shard.loadSuspect,
      },
    ];
    writeFileSync(reportFile, JSON.stringify(report));
  } catch {
    /* no report, or an unwritable one — stderr and the exit code carry the refusal. */
  }
}

/** SHOUT EVERY NON-VERDICT (#2472) — a dead fork, a signal-killed vitest, a failed spawn. The refusal is
 *  deliberately three sentences and not one word: it names WHAT died, WHICH named spec operands never
 *  printed a result line, and — the part that must never be dropped — that whatever DID fail underneath is
 *  still in the report. "This is not a verdict" is a statement about completeness, never a reason to throw
 *  away the partial observation; a reader needs the crash AND the reds under it to know what to re-run. */
function announceNonVerdicts(shards: readonly ShardResult[]): void {
  const hit = shards.filter((s) => s.nonVerdict !== null && !s.wedged);
  if (hit.length === 0) {
    return;
  }
  log(`EXIT ${EXIT_TOOL_ERROR} (TOOL ERROR, not a verdict) — the harness died, this run did not fail:`);
  for (const shard of hit) {
    log(`  · ${shard.label}: ${shard.nonVerdict}.`);
    log(
      shard.unreported.length > 0
        ? `    never reported (${shard.unreported.length}): ${shard.unreported.join(", ")}`
        : "    no spec operands were named, so the files that went down cannot be enumerated — compare the report's testResults against the intended set.",
    );
  }
  log(
    `vitest exited ${hit.map((s) => String(s.code)).join("/")} here, which is the SAME number a real assertion failure exits with — that is the lie #2472 closes. ` +
      "Any failure that DID report is still in the report and is still real; re-run on a quiet tree to get a verdict on the rest.",
  );
}

/** Shout the #1616 load-suspect arms. Silence here is a claim that every measured rate was a verdict. */
function announceLoadSuspect(shards: readonly ShardResult[]): void {
  const all = shards.flatMap((s) => s.loadSuspect.map((row) => `${s.label}: ${row}`));
  if (all.length === 0) {
    return;
  }
  log(`MEASUREMENT LOAD-SUSPECT — ${all.length} measured-rate arm(s) measured on a loaded box, so their thresholds were not judged:`);
  for (const row of all) {
    log(`  · ${row}`);
  }
  log("This verdict is INCOMPLETE, not clean: those numbers exist but describe the box as much as the code. Re-run on a quiet tree to judge them.");
  log("(Reasons are in the report's testResults[].assertionResults[].meta.orbLoadSuspect.)");
}

async function main(): Promise<void> {
  const { projects, baseArgs, report, runtimeOnly, unsupportedConfig } = parseArgs();
  if (unsupportedConfig !== undefined) {
    log(`${RUNTIME_ONLY_FLAG} requires the repository root config; ${relative(root, unsupportedConfig)} cannot honor its runtime-only config mode.`);
    process.exit(EXIT_MISUSE);
  }
  const executionArgs = runtimeOnly ? runtimeConfigArgs(baseArgs) : baseArgs;
  if (executionArgs === null) {
    log(`${RUNTIME_ONLY_FLAG} received a malformed --config option.`);
    process.exit(EXIT_MISUSE);
  }
  // Forward terminal signals to the running child group (detached children don't receive them automatically).
  const onSignal = (): void => {
    killGroup(activeChild);
    process.exit(1);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const alias = aliasFor(report);
  // Inside `reports/`: write into this run's slot and publish the caller's path as the `latest` pointer.
  // Outside it (an explicit path the caller chose): land where NAMED, with no pointer.
  const mergedFile = alias === null ? report : runFile(slot, REPORT_NAME);
  if (slot.racing.length > 0) {
    log(`CONCURRENT test run(s) on this checkout: ${slot.racing.join(", ")}`);
    log(`this run writes to ${slot.relDir}; reports/${REPORT_NAME} is published by whichever finishes last.`);
  }

  // Filter-shaped project selectors stay together so Vitest applies their native union once.
  if (projects.length < 2 || !projects.every(exactProjectSelector)) {
    const args = [...executionArgs, ...projects.flatMap((p) => ["--project", p]), `--outputFile.json=${mergedFile}`];
    const shard = await runShard({ args, reportFile: mergedFile, label: projects.length === 1 ? (projects[0] as string) : "filtered" });
    stampNonVerdict(mergedFile, shard);
    announceWedges([shard]);
    announceNonVerdicts([shard]);
    announceLoadSuspect([shard]);
    publish(alias, false);
    process.exit(exitCodeFor([shard]));
  }

  const shards: ShardResult[] = [];
  for (const project of projects) {
    const reportFile = alias === null ? join(dirname(report), SHARDS_DIR, `${project}.json`) : runFile(slot, SHARDS_DIR, `${project}.json`);
    const args = [...executionArgs, "--project", project, `--outputFile.json=${reportFile}`];
    log(`shard ${shards.length + 1}/${projects.length}: ${project}`);
    // Sequential ON PURPOSE: one vitest process at a time is the whole containment mechanism (a wedge is a
    // per-process shutdown race), and the projects share one worker budget on a co-hosted box.
    shards.push(await runShard({ args, reportFile, label: project }));
  }
  mergeReports(shards, mergedFile);
  publish(alias, true);
  announceWedges(shards);
  announceNonVerdicts(shards);
  announceLoadSuspect(shards);
  for (const shard of shards) {
    log(`shard ${shard.label}: exit ${shard.code}${shard.wedges > 0 ? ` (after ${shard.wedges} wedge kill(s))` : ""}`);
  }
  process.exit(exitCodeFor(shards));
}

await main();
