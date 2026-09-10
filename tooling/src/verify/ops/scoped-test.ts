// Scoped tests verify explicit path claims before native runner execution. Direct node/CT filters must
// contribute a collected test; related-source inputs must exist but can have zero runtime dependents.
// Vitest node runs keep watchdog supervision. CT keeps its exclusive runner lease and private cold build.
//
// Native collection owns matching semantics. Use --json=<owned scratch path>: a bare --json followed by
// a test operand makes Vitest treat that operand as an OUTPUT path and can overwrite the test file.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { openRunSlot } from "@orb/tooling/_shared/artifacts";
import { CT_CACHE_DIR_ENV, CT_RUN_RACING_ENV, CT_RUN_SLOT_ENV } from "@orb/tooling/_shared/ct-run-slot";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runMarkerEnv } from "@orb/tooling/_shared/run-marker";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { ScopedOperand } from "@orb/tooling/_shared/scoped-run-paths";
import {
  barrenOperands,
  barrenRefusal,
  isPathShaped,
  resolveOperand,
  toRepoRelative,
  unresolvedOperands,
  unresolvedRefusal,
} from "@orb/tooling/_shared/scoped-run-paths";
import type { ScopedTestCollection, ScopedTestRunner } from "../contract/scoped-test.ts";
import { SCOPED_TEST_RUNNERS } from "../contract/scoped-test.ts";
import { acquireCtRunnerSlots } from "../lib/ct-runner-lock.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped <paths…>  /  pnpm test:ct <paths…>");

export const SCOPED_TEST_USAGE =
  `usage: node tooling/src/verify/cli.ts scoped-test <${SCOPED_TEST_RUNNERS.join("|")}> [paths…] [runner flags…]\n` +
  "  node = the vitest projects (pnpm test:scoped) · ct = the playwright CT config (pnpm test:ct).\n" +
  "  node --related <sources…> = Vitest's dependency graph through the supervised node runner.\n" +
  "  Every path-shaped operand must EXIST (else exit 3). Direct test filters must contribute a collected\n" +
  "  test (else exit 2); related source inputs may have zero runtime dependents, reported explicitly.";

/** Playwright's `--list --reporter=json` dumps the whole resolved config beside the specs; vitest's list
 *  file is small. 64MiB so a large CT selection can never come back as an ENOBUFS kill read as "no tests". */
const LIST_MAX_BUFFER = 67_108_864; // 64MiB — matches tests-execution-membership's listing headroom.
const MS_PER_SECOND = 1000;

const CT_CONFIG = "playwright-ct.config.ts";
const NODE_RELATED = "--related";

function vitestBin(root: string): string {
  return join(root, "node_modules", "vitest", "vitest.mjs");
}

function playwrightBin(root: string): string {
  return join(root, "node_modules", "@playwright", "test", "cli.js");
}

/** `vitest list --filesOnly --json=<file>` → the test files the caller's filters actually select.
 *  `--filesOnly` is load-bearing for speed (without it `list` enumerates every CASE in the tree), and the
 *  `=`-joined json path is load-bearing for SAFETY — see the header hazard. */
function collectNode(root: string, rest: readonly string[]): ScopedTestCollection {
  const dir = mkdtempSync(join(tmpdir(), "orb-scoped-test-"));
  const out = join(dir, "list.json");
  try {
    const res = runNicedSync(process.execPath, [vitestBin(root), "list", "--filesOnly", `--json=${out}`, ...rest], {
      cwd: root,
      maxBuffer: LIST_MAX_BUFFER,
    });
    if (res.status !== 0) {
      return { error: `\`vitest list --filesOnly\` failed (status ${String(res.status)})\n${res.stderr}` };
    }
    const parsed: unknown = JSON.parse(readFileSync(out, "utf8"));
    if (!Array.isArray(parsed)) {
      return { error: "`vitest list --filesOnly` did not produce an array" };
    }
    const files: string[] = [];
    for (const entry of parsed) {
      const file = readField(entry, "file");
      if (file !== undefined) {
        files.push(toRepoRelative(root, file));
      }
    }
    return { files };
  } catch (err) {
    return { error: `\`vitest list --filesOnly\` produced no readable listing: ${String(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A string property of an unknown record, or undefined — the runners' JSON is vendor data, not our shape. */
function readField(entry: unknown, key: string): string | undefined {
  if (typeof entry !== "object" || entry === null || !(key in entry)) {
    return;
  }
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Walk the playwright JSON suite tree collecting every `file`. Nested suites repeat the field, so one
 *  recursive read covers both the top-level grouping and per-describe nesting. */
function walkSuiteFiles(node: unknown, rootDir: string, root: string, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkSuiteFiles(child, rootDir, root, out);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const file = readField(node, "file");
  if (file !== undefined) {
    out.add(toRepoRelative(root, resolve(rootDir, file)));
  }
  for (const key of ["suites", "specs"]) {
    if (key in node) {
      walkSuiteFiles((node as Record<string, unknown>)[key], rootDir, root, out);
    }
  }
}

/** `playwright test --list --reporter=json` → the specs the caller's filters select. Exit 1 with a parsable
 *  body is the "matched nothing" case and stays a COLLECTION (an empty one), which the barren arm then
 *  reports per-operand; only an unparsable body is a collection failure. */
function collectCt(root: string, rest: readonly string[]): ScopedTestCollection {
  // Config is adoption-only: collection gets a disposable identity so asking Playwright what it would
  // select cannot mint a real run or leave an abandoned reports/runs/ct slot.
  const dir = mkdtempSync(join(tmpdir(), "orb-ct-list-"));
  let res: ReturnType<typeof runNicedSync>;
  try {
    res = runNicedSync(process.execPath, [playwrightBin(root), "test", "-c", CT_CONFIG, "--list", "--reporter=json", ...rest], {
      cwd: root,
      env: inheritedProcessEnv({ [CT_RUN_SLOT_ENV]: dir, [CT_RUN_RACING_ENV]: "" }),
      maxBuffer: LIST_MAX_BUFFER,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const start = res.stdout.indexOf("{");
  const end = res.stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: `\`playwright test --list\` produced no JSON (status ${String(res.status)})\n${res.stderr || res.stdout}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout.slice(start, end + 1));
  } catch (err) {
    return { error: `\`playwright test --list\` produced invalid JSON: ${String(err)}` };
  }
  const report = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const rootDir = readField(report["config"], "rootDir") ?? root;
  const files = new Set<string>();
  walkSuiteFiles(report["suites"], rootDir, root, files);
  return { files: [...files] };
}

function collect(runner: ScopedTestRunner, root: string, rest: readonly string[]): ScopedTestCollection {
  return runner === "node" ? collectNode(root, rest) : collectCt(root, rest);
}

/** The CT run, streamed to the operator's terminal, in the lease's per-invocation cold cache. */
function spawnCt(root: string, rest: readonly string[], lease: { readonly cacheDir: string; readonly runMarker: string }): number {
  const slot = openRunSlot(root, "ct");
  const ct = runNicedSync(process.execPath, [playwrightBin(root), "test", "-c", CT_CONFIG, ...rest], {
    cwd: root,
    env: inheritedProcessEnv({
      [CT_RUN_SLOT_ENV]: slot.dir,
      [CT_RUN_RACING_ENV]: slot.racing.join("\n"),
      ...runMarkerEnv(lease.runMarker),
      [CT_CACHE_DIR_ENV]: lease.cacheDir,
    }),
    stdio: "inherit",
  });
  return ct.status ?? EXIT.toolError;
}

/** The node run always enters the watchdog supervisor. Related-source emptiness is explicit and local to
 * that mode; direct test claims retain the repo-wide zero-match refusal. */
function spawnNode(root: string, rest: readonly string[], mode: "run" | "related"): number {
  const nodeArgs = mode === "related" ? ["related", ...rest, "--run", "--passWithNoTests"] : ["run", ...rest];
  const node = runNicedSync(process.execPath, [join(root, "scripts", "vitest-supervised.mjs"), ...nodeArgs, "--reporter=default", "--reporter=json"], {
    cwd: root,
    stdio: "inherit",
  });
  return node.status ?? EXIT.toolError;
}

function runNodeScoped(root: string, rawRest: readonly string[]): number {
  const related = rawRest[0] === NODE_RELATED;
  const rest = related ? rawRest.slice(1) : rawRest;
  if (!related) {
    const operands = rest.filter(isPathShaped).map((arg) => resolveOperand(root, arg));
    const refused = preflight("node", root, rest, operands);
    return refused ?? spawnNode(root, rest, "run");
  }
  const firstFlag = rest.findIndex((arg) => arg.startsWith("-"));
  const sourceArgs = firstFlag === -1 ? rest : rest.slice(0, firstFlag);
  const operands = sourceArgs.map((arg) => resolveOperand(root, arg));
  const unresolved = unresolvedOperands(operands, "claim");
  if (unresolved.length > 0) {
    throw new UsageError(unresolvedRefusal(unresolved));
  }
  const directories = operands.filter((operand) => operand.isDirectory);
  if (directories.length > 0) {
    throw new UsageError(
      `--related accepts source files, not directories: ${directories.map((operand) => operand.raw).join(", ")}\n` +
        "use verify --scope <folder> or name explicit source files",
    );
  }
  if (operands.length === 0) {
    throw new UsageError("--related needs at least one source path");
  }
  return spawnNode(root, rest, "related");
}

/** The preflight verdict: `undefined` = cleared to run, otherwise the exit code to return instead. */
function preflight(runner: ScopedTestRunner, root: string, rest: readonly string[], operands: readonly ScopedOperand[]): number | undefined {
  const unresolved = unresolvedOperands(operands, "runner");
  if (unresolved.length > 0) {
    // The ARGV is wrong — misuse (3), the same verdict `verify --file` gives this class. Thrown rather
    // than returned so the operator reads it through run-tool's one `ARG ERROR` channel.
    throw new UsageError(unresolvedRefusal(unresolved));
  }
  if (operands.length === 0) {
    return; // no path claims to audit (a bare `--grep` run) — nothing to certify, nothing to refuse
  }
  const collected = collect(runner, root, rest);
  if ("error" in collected) {
    warn(`TOOL ERROR   the scoped-test preflight could not ask the runner what it would collect:\n${collected.error}`);
    return EXIT.toolError;
  }
  const barren = barrenOperands(operands, collected.files);
  if (barren.length === 0) {
    return;
  }
  warn(`UNFED PATH   ${barrenRefusal(barren, collected.files)}`);
  return EXIT.toolError;
}

/** `cli.ts scoped-test <runner> …` — preflight the caller's path claims, then delegate to the runner.
 *
 *  THE CT ARM IS EXCLUSIVE PER WORKTREE (#1581). The lock is taken BEFORE the preflight, so a second runner
 *  refuses instantly and spawns nothing at all, and it is released in a `finally` so a refused preflight
 *  (or a throw) never wedges the tree. The node arm is untouched: vitest runs do not share a build dir. */
export async function runScopedTest(root: string, argv: readonly string[]): Promise<number> {
  const [runner, ...rawRest] = argv;
  if (runner === undefined || !(SCOPED_TEST_RUNNERS as readonly string[]).includes(runner)) {
    throw new UsageError(`unknown runner ${runner === undefined ? "(none given)" : JSON.stringify(runner)}\n${SCOPED_TEST_USAGE}`);
  }
  const tier = runner as ScopedTestRunner;
  const rest = rawRest;
  const operands = rest.filter(isPathShaped).map((arg) => resolveOperand(root, arg));
  if (tier === "node") {
    return runNodeScoped(root, rest);
  }
  const lock = await acquireCtRunnerSlots(root, {
    argv: rest,
    // The sweeps' receipts share the runner's one operator channel — a teardown that killed a stranded
    // browser fleet, or found none, must not be silent (#1848).
    notice: (message) => {
      warn(message);
    },
    host: {
      // The HOST-WIDE half WAITS rather than refusing (#1835) — see acquireCtRunnerSlots. A lane that
      // sits here is not stuck; it is being told, on one line, exactly what it is behind.
      onQueued: (holder) => {
        warn(
          `CT RUNNER QUEUED   waiting for a host-wide CT slot — ${holder.label} (pid ${String(holder.pid)}) has held one since ${holder.startedAt}. Two chromium fleets per box is the cap; this run starts as soon as one frees.`,
        );
      },
      onNotice: (message) => {
        warn(`CT RUNNER SLOTS   ${message}`);
      },
    },
  });
  if (lock.kind === "busy") {
    // Exit-2 class: a run that never happened is not a verdict about anything.
    warn(`CT RUNNER BUSY   ${lock.refusal}`);
    return EXIT.toolError;
  }
  if (lock.lease.stolenFrom !== null) {
    warn(`CT RUNNER LOCK   stole a stale lock from pid ${String(lock.lease.stolenFrom)} (no such process) — a killed run must never wedge the next one.`);
  }
  const hostWaitedMs = lock.lease.hostWaitedMs ?? 0;
  if (hostWaitedMs > 0) {
    warn(`CT RUNNER SLOTS   host slot ${String(lock.lease.hostSlot)} acquired after ${String(Math.round(hostWaitedMs / MS_PER_SECOND))}s of queueing.`);
  }
  try {
    const refused = preflight(tier, root, rest, operands);
    return refused ?? spawnCt(root, rest, lock.lease);
  } finally {
    lock.lease.release();
  }
}
