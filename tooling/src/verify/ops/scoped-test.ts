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
import { VITEST_TYPECHECK_GROUP_PREFIX } from "@orb/tooling/_shared/test-kinds";
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
/** The supervisor's own flag (scripts/vitest-supervised.mjs), which swaps in vitest.runtime.config.ts. */
const RUNTIME_ONLY = "--runtime-only";

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
    const projects = new Set<string>();
    for (const entry of parsed) {
      const file = readField(entry, "file");
      if (file !== undefined) {
        files.push(toRepoRelative(root, file));
      }
      // `projectName` is the NATIVE attribution and the #2232 door's whole input — see the type's header.
      const project = readField(entry, "projectName");
      if (project !== undefined) {
        projects.add(project);
      }
    }
    return { files, projects: [...projects].sort() };
  } catch (err) {
    return { error: `\`vitest list --filesOnly\` produced no readable listing: ${String(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A property of an unknown record, or undefined — the runners' JSON is vendor data, not our shape. */
function readProperty(entry: unknown, key: string): unknown {
  if (typeof entry !== "object" || entry === null || !(key in entry)) {
    return;
  }
  return (entry as Record<string, unknown>)[key];
}

/** The same read, narrowed to the string case, which is every field these two listings are read for. */
function readField(entry: unknown, key: string): string | undefined {
  const value = readProperty(entry, key);
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

/** What `playwright test --list` answered. Split out so the CLASSIFICATION below is a pure function the
 *  pin can drive in both directions without spawning a chromium config load. */
export interface CtListing {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Playwright's own refusal when its filters matched no spec at all — measured 2026-09-19 against
 *  playwright 1.61.1, whose load task throws `No tests found` (bare) or the `No tests found.` +
 *  "Make sure that arguments are regular expressions…" variant when the selection named locations. It
 *  arrives through the SAME report-level `errors` channel a LOAD FAILURE uses, which is why the classifier
 *  below discriminates on the message and never on emptiness or on the exit code: this one is a legitimate
 *  EMPTY collection the barren arm must still own, every other one means nothing was collected at all. */
const CT_NO_TESTS_FOUND = "No tests found";
/** How the reporter serializes a thrown `Error` into `message` — stripped before the match above. */
const CT_ERROR_PREFIX = "Error: ";
/** Playwright's placeholder when an error has no source position (a module-resolution failure names the
 *  importer inside its own message instead), so printing it as a location adds nothing. */
const CT_ANONYMOUS_LOCATION = "<anonymous>";

/** One reported error as a line an operator can act on — playwright's own message, with the source
 *  position when it carries one (a load failure does; the matched-nothing refusal does not). */
function formatCtError(error: unknown): string {
  const file = readField(readProperty(error, "location"), "file");
  const message = readField(error, "message") ?? readField(error, "value") ?? readField(error, "stack") ?? String(JSON.stringify(error));
  return file === undefined || file === CT_ANONYMOUS_LOCATION ? message : `${file}: ${message}`;
}

function isNoTestsFound(error: unknown): boolean {
  const message = readField(error, "message") ?? "";
  const thrown = message.startsWith(CT_ERROR_PREFIX) ? message.slice(CT_ERROR_PREFIX.length) : message;
  return thrown.startsWith(CT_NO_TESTS_FOUND);
}

/** `playwright test --list --reporter=json` → the specs the caller's filters select, or the reason the
 *  question was never answered.
 *
 *  THE LIE THIS CLASSIFIER EXISTS TO STOP (#2457, found by lane fold-V 2026-09-19). The first version read
 *  the suite tree and NOTHING else — not `status`, not the report's own `errors` array. A CT that fails to
 *  LOAD node-side (importing a feature front door out of an `@orb/client` subpath, say) collects zero
 *  suites, so the door printed `UNFED PATH` with three causes that were all wrong and DISCARDED
 *  playwright's real message; in a multi-path batch the whole selection was refused as barren and the other
 *  files never ran. A collection that failed is a TOOL ERROR carrying the vendor's own words, never a
 *  verdict about the caller's paths.
 *
 *  The discriminator is the CONTENT of `errors`, not its emptiness and not the exit code: listing runs with
 *  `failOnLoadErrors: true`, so a selection that matched nothing reports `No tests found` through the same
 *  array and exits non-zero. That case is a real (empty) collection which the barren arm then reports
 *  per-operand — the direction the pin plants alongside the load failure. */
export function classifyCtListing(root: string, listing: CtListing): ScopedTestCollection {
  const start = listing.stdout.indexOf("{");
  const end = listing.stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: `\`playwright test --list\` produced no JSON (status ${String(listing.status)})\n${listing.stderr || listing.stdout}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(listing.stdout.slice(start, end + 1));
  } catch (err) {
    return { error: `\`playwright test --list\` produced invalid JSON: ${String(err)}` };
  }
  const report = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const reported: readonly unknown[] = Array.isArray(report["errors"]) ? (report["errors"] as readonly unknown[]) : [];
  const failures = reported.filter((error) => !isNoTestsFound(error));
  if (failures.length > 0) {
    return {
      error:
        `\`playwright test --list\` reported ${String(failures.length)} error(s) (status ${String(listing.status)}) — the selection was never collected, ` +
        "so this run is not a verdict about any path in it:\n" +
        failures.map((error) => `  ${formatCtError(error)}`).join("\n"),
    };
  }
  const rootDir = readField(report["config"], "rootDir") ?? root;
  const files = new Set<string>();
  walkSuiteFiles(report["suites"], rootDir, root, files);
  // Playwright's suite tree carries no project attribution this door needs; the CT arm has one config and
  // no typecheck projects, so the #2232 runtime-only question does not arise for it.
  return { files: [...files], projects: [] };
}

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
  return classifyCtListing(root, res);
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

/** THE CONFIG-MODE DOOR (#2232). A scoped node run passed NO config-mode flag, so `vitest-supervised.mjs`
 *  took the ROOT config — which carries both `types-*` typecheck projects — and every `pnpm test:scoped`
 *  invocation carried them whether the caller had claimed a type test or not. The cost of an unclaimed
 *  typecheck project is not the ts7 pass (a project with ZERO matched files is instantiated and never runs
 *  the checker); it is that the project's WHOLE PROGRAM becomes part of the run's verdict, so a parse error
 *  in a file the caller never named exits the run 1 with every named test green. `test:node` and
 *  `test:tooling` already passed `--runtime-only`; this door was the one that did not.
 *
 *  THE SELECTION IS READ, NEVER GUESSED. `collected` is the vitest listing's own per-file `projectName`
 *  attribution, so a DIRECTORY operand holding a `.test-d.ts` is classified by the same authority that
 *  would run it — a filename test would have missed exactly that case. Four arms:
 *
 *  - THE CALLER ALREADY FILTERED (`--project` / `--project=…` anywhere in `rest`) → emit NOTHING. Their
 *    filter is authoritative and `--runtime-only` would silently contradict it: the runtime config has no
 *    typecheck project to select, so `test:scoped --project=types-node -t x` died
 *    `No projects matched the filter "types-node"` on an invocation that worked before the door existed
 *    (the #2232 rework's own regression, caught by cb-v-verify-lib-4).
 *  - `--related` → `--runtime-only`. Its operands are SOURCE files and the type-assertion lane has its own
 *    door (`pnpm test:types`). A caller wanting a source's type-test dependents runs that.
 *  - no `types-*` in the attribution (including an EMPTY attribution — a bare `--grep` claims nothing) →
 *    `--runtime-only`. The typecheck projects are absent BEFORE any `--project` filter applies, which is
 *    why `--project=!types-*` is not the same thing: vitest UNIONS a negative selector with the positives
 *    and widens the run.
 *  - otherwise → the UNION of the attributed projects, `--project=<each>`. This is the one arm that answers
 *    the row, and it covers the pure-type and the MIXED case with the same rule: it drops nothing the
 *    caller claimed and excludes the typecheck project they did NOT. The first draft emitted NOTHING for
 *    MIXED, which left both typecheck projects riding on every directory operand — the founding case, and
 *    the arm every lane's floor spelling actually goes through.
 *
 *  WHAT THIS DOOR DOES NOT FIX, stated because the founding command still reproduces through it. A
 *  typecheck project the caller DID claim brings its whole program with it, so a parse error anywhere in
 *  `tsconfig.json` still reds `test:scoped <a directory holding a .test-d.ts>`. That is vitest's
 *  `ignoreSourceErrors` default reporting a source error as a run failure, one lever over from this one,
 *  and narrowing it here would mean dropping a type test the caller named. */
export function nodeConfigModeArgs(collectedProjects: readonly string[], mode: "run" | "related", callerFilteredProjects: boolean): readonly string[] {
  if (callerFilteredProjects) {
    return [];
  }
  if (mode === "related" || !collectedProjects.some((name) => name.startsWith(VITEST_TYPECHECK_GROUP_PREFIX))) {
    return [RUNTIME_ONLY];
  }
  return collectedProjects.map((name) => `--project=${name}`);
}

/** Did the caller supply their OWN project filter? Both spellings vitest accepts, so a door that reads only
 *  `--project=x` would still contradict `--project x`. */
export function hasCallerProjectFilter(rest: readonly string[]): boolean {
  return rest.some((arg) => arg === "--project" || arg.startsWith("--project="));
}

/** The node run always enters the watchdog supervisor. Related-source emptiness is explicit and local to
 * that mode; direct test claims retain the repo-wide zero-match refusal. */
function spawnNode(root: string, rest: readonly string[], mode: "run" | "related", collectedProjects: readonly string[]): number {
  const nodeArgs = mode === "related" ? ["related", ...rest, "--run", "--passWithNoTests"] : ["run", ...rest];
  const node = runNicedSync(
    process.execPath,
    [
      join(root, "scripts", "vitest-supervised.mjs"),
      ...nodeArgs,
      ...nodeConfigModeArgs(collectedProjects, mode, hasCallerProjectFilter(rest)),
      "--reporter=default",
      "--reporter=json",
    ],
    { cwd: root, stdio: "inherit" },
  );
  return node.status ?? EXIT.toolError;
}

function runNodeScoped(root: string, rawRest: readonly string[]): number {
  const related = rawRest[0] === NODE_RELATED;
  const rest = related ? rawRest.slice(1) : rawRest;
  if (!related) {
    const operands = rest.filter(isPathShaped).map((arg) => resolveOperand(root, arg));
    const verdict = preflight("node", root, rest, operands);
    return "refused" in verdict ? verdict.refused : spawnNode(root, rest, "run", verdict.projects);
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
  return spawnNode(root, rest, "related", []);
}

/** THE CT TITLE FILTER NEEDS A PATH (#2457, second half of the same door). `pnpm test:ct -g='<title>'`
 *  with no path operand collects ZERO specs and exits 1 — even for a title a path-scoped run executes.
 *  Measured 2026-09-19 on the unmodified door: `pnpm test:ct -g='aria-expanded follows'` (a title that
 *  lives in tests/client/features/config/components/config-search-input.ct.tsx) printed
 *  `CT SUMMARY — FAILED · 0 passed · 0 failed · 0 flaky · 0 skipped` and exited 1 — a run that certifies
 *  nothing while LOOKING like a failing test. There is nothing for the
 *  preflight to audit either: with no path claims it returns early and never collects, so the barren arm
 *  cannot see it. Refuse at parse instead, naming the operand that makes the invocation real.
 *
 *  CT ONLY. A bare `-t` on the NODE tier is a supported shape (vitest scans its projects and the door
 *  records the empty attribution as "no type claim" — `nodeConfigModeArgs`), so the same refusal there
 *  would break a working invocation. */
export function bareCtGrepRefusal(rest: readonly string[], pathOperandCount: number): string | undefined {
  if (pathOperandCount > 0) {
    return;
  }
  const grep = rest.find((arg) => arg === "-g" || arg === "--grep" || arg.startsWith("-g=") || arg.startsWith("--grep="));
  if (grep === undefined) {
    return;
  }
  const flag = grep.includes("=") ? grep.slice(0, grep.indexOf("=")) : grep;
  return (
    `${flag} needs a path operand: the CT config answers a title filter with no spec path by collecting nothing and exiting 1,\n` +
    "  so a bare title filter is a run that says nothing about the title it named.\n" +
    "  name the spec(s) too: pnpm test:ct tests/ui/x.ct.tsx -g='<title>'"
  );
}

/** The preflight verdict: an exit code to return INSTEAD of running, or the runner's own project
 *  attribution for the selection it cleared. The projects travel out because the node arm's config-mode
 *  door is decided by what the runner said it would SELECT, never by a filename (#2232) — and a bare
 *  `--grep` run clears with an EMPTY attribution, which `nodeConfigModeArgs` reads as "no type claim". */
type PreflightVerdict = { readonly refused: number } | { readonly projects: readonly string[] };

function preflight(runner: ScopedTestRunner, root: string, rest: readonly string[], operands: readonly ScopedOperand[]): PreflightVerdict {
  const unresolved = unresolvedOperands(operands, "runner");
  if (unresolved.length > 0) {
    // The ARGV is wrong — misuse (3), the same verdict `verify --file` gives this class. Thrown rather
    // than returned so the operator reads it through run-tool's one `ARG ERROR` channel.
    throw new UsageError(unresolvedRefusal(unresolved));
  }
  if (operands.length === 0) {
    return { projects: [] }; // no path claims to audit (a bare `--grep` run) — nothing to certify, nothing to refuse
  }
  const collected = collect(runner, root, rest);
  if ("error" in collected) {
    warn(`TOOL ERROR   the scoped-test preflight could not ask the runner what it would collect:\n${collected.error}`);
    return { refused: EXIT.toolError };
  }
  const barren = barrenOperands(operands, collected.files);
  if (barren.length === 0) {
    return { projects: collected.projects };
  }
  warn(`UNFED PATH   ${barrenRefusal(barren, collected.files)}`);
  return { refused: EXIT.toolError };
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
  const bareGrep = bareCtGrepRefusal(rest, operands.length);
  if (bareGrep !== undefined) {
    // Before the lock: a refused argv must not take the worktree's CT lease even for an instant.
    throw new UsageError(bareGrep);
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
    const verdict = preflight(tier, root, rest, operands);
    return "refused" in verdict ? verdict.refused : spawnCt(root, rest, lock.lease);
  } finally {
    lock.lease.release();
  }
}
