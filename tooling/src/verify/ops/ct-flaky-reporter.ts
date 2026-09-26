// CT flake announcer — a custom Playwright reporter wired into playwright-ct.config.ts alongside the
// html reporter. The gate CT lane runs `pnpm test:ct --retries=2`, so a test that FAILS then PASSES on
// retry is scored `passed` and vanishes into a green bar — exactly how four real races stayed invisible
// until a full-battery run happened to catch them (root-caused 2026-07-18; this is the systemic guard).
//
// This reporter makes every retry-masked pass ANNOUNCE itself:
//   1. a LOUD end-of-run summary block (one line per flaky test: file:line + title + retries burned) that
//      cannot be missed in the output;
//   2. a machine-readable artifact at reports/ct-flaky.json (ALWAYS written — deterministic path for the
//      verify harness / orchestrator to read; flakyCount 0 + empty list on a clean run).
//
// Posture (decided against the CT harness in tooling/src/verify/lib/registry.ts): DEFAULT = WARN loudly — retries
// stay, so the suite stays green on transient infra (the 500-test-parallelism drawer/chart/RO artifacts the
// gate retries around). OPT-IN STRICT = `CT_NO_FLAKES=1` (decoded by playwright-ct.config.ts, which owns
// env, and passed in as the `strict` option) → onEnd overrides the run status to `failed` (nonzero exit)
// whenever any test needed a retry, for the orchestrator's flake-hunt passes.
//
// A `flaky` outcome is precisely failed-then-passed (Playwright's own classification); `unexpected` (hard
// fail) already fails the run, and `expected`/`skipped` are not retries. Retries burned = results.length-1
// (fails attempt 0..n-1, passes attempt n).
//
// UNFED-READ CENSUS (added 2026-08-24, #629): the SAME failure shape one layer down. `routeTrpc`
// deliberately answers an unlisted procedure `null` rather than 404ing an incidental read — but `null` is
// not a view, so a section that SUSPENDS on an unstubbed read throws, its QueryBoundary swaps the body for
// `QueryErrorState`, and every assertion outside that boundary (a Section heading, a tab strip) still
// passes. A whole CT file scored green for weeks with its subject never rendering. `routeTrpc` warns
// `[routeTrpc] UNSTUBBED <proc>` on stderr for each such procedure; this reporter collects those per test
// FILE and prints one end-of-run census.
//
// …AND IT IS A RATCHET NOW (#637). Diagnostics-only was the right posture for one night: the census found 14
// chat CT files running their display-script and send-availability pipelines INERT, and a census that only
// PRINTS is a census the next sweep has to re-pay from zero. The judging lives in `ct-unfed-ratchet.ts` (pure,
// pinned by tests/tooling/verify/ops/ct-unfed-ratchet.test.ts); this reporter is its EYES — it supplies the
// three run facts nothing else can see (which files executed, which announced `[routeTrpc] ACTIVE`, and what
// each left unfed) and turns the verdict into run status. A refusal is TOOL-ERROR class and fails the run
// exactly like a violation: a census that could not observe must never read as "zero unfed reads".
//
// FAILURE SURFACING (added 2026-07-20): a HARD failure under --retries=0 previously produced only
// `[ELIFECYCLE] Command failed with exit code 1` with no test name — a truncated log lost the actual
// failure and the diagnosis stalled. onEnd now ALWAYS prints a terminal summary block at the very end of
// the run (pass/fail/flaky/skip counts), and on any hard failure lists each failing test's file:line +
// title. Printed LAST so it survives a `tail`. This is diagnostics only — it never changes run status on a
// hard fail (Playwright already fails); STRICT flake-fail behavior is unchanged.
//
// THE COUNTING IS NOT HERE (#1006). That summary is the receipt every merge floor quotes, so when it was
// accused of lying the counting moved to `ct-run-tally.ts` — a pure `readRun(suite, root)` pinned by
// tests/tooling/verify/ops/ct-run-tally.test.ts (mixed pass/fail/retry-then-pass across several workers).
// This reporter reads the run's facts ONCE per `onEnd` and renders the summary, the FAILED list, the flake
// block, the artifact and the ratchet's executed-file input from that single walk: two independent walks
// are the only way a summary and its own failure list could ever describe different sets.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { adoptRunSlot } from "@orb/tooling/_shared/artifact-out";
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { publishRunSlot, transferRunSlotOwnership } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { LOAD_SUSPECT_ANNOTATION } from "@orb/tooling/_shared/load-budget";
import { readBudgetRows } from "@orb/tooling/_shared/ratchet-rows";
import type { FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import type { CtFlakyTest, CtLoadSuspectTest, CtRunFacts } from "../contract/ct-run.ts";
import { RULE, readRun, summaryLines } from "./ct-run-tally.ts";
import type { UnfedRatchetVerdict } from "./ct-unfed-ratchet.ts";
import { ACTIVE_MARKER, BASELINE_REL, judgeUnfedReads, owesActiveMarker } from "./ct-unfed-ratchet.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:ct (playwright loads this module as a reporter)");

const ARTIFACT_NAME = "ct-flaky.json";

interface CtFlakyReporterOptions {
  readonly strict?: boolean;
  readonly slotDir?: string;
  readonly racing?: readonly string[];
}

interface FlakyArtifact {
  readonly generatedAt: string;
  readonly flakyCount: number;
  readonly strict: boolean;
  readonly flaky: readonly CtFlakyTest[];
}

function writeArtifact(flaky: readonly CtFlakyTest[], strict: boolean, slot: RunSlot, artifactPath: string): void {
  const artifact: FlakyArtifact = {
    generatedAt: new Date().toISOString(),
    flakyCount: flaky.length,
    strict,
    flaky,
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, undefined, 2)}\n`);
  // Published only now, with the run over: `reports/ct-flaky.json` therefore always resolves to a FINISHED
  // CT run's census — its own, or a concurrent sibling's, never a half-written one (#1029).
  publishRunSlot(process.cwd(), slot, [{ alias: ARTIFACT_NAME, target: ARTIFACT_NAME }]);
  if (slot.racing.length > 0) {
    process.stderr.write(`[ct-flaky] CONCURRENT CT run(s) on this checkout: ${slot.racing.join(", ")} — this census is ${slot.relDir}/${ARTIFACT_NAME}\n`);
  }
}

function announce(flaky: readonly CtFlakyTest[], strict: boolean, artifactPath: string): void {
  const posture = strict ? "STRICT (CT_NO_FLAKES=1) — FAILING the run" : "WARN (suite stays green; set CT_NO_FLAKES=1 to fail)";
  const lines = ["", RULE, `  CT FLAKES DETECTED — ${flaky.length} test(s) passed ONLY on retry (masked by --retries)`, `  posture: ${posture}`, RULE];
  for (const t of flaky) {
    lines.push(`  • ${t.file}:${t.line}  ${t.title}  (${t.retries} retr${t.retries === 1 ? "y" : "ies"})`);
  }
  lines.push(RULE, `  machine-readable: ${relative(process.cwd(), artifactPath)}`, RULE, "");
  process.stdout.write(`${lines.join("\n")}\n`);
}

// The marker `routeTrpc` writes to stderr, once per (route registration, procedure). Matched on the whole
// line so an assertion message quoting the phrase can never be mistaken for a sighting.
const UNSTUBBED_LINE = /^\[routeTrpc\] UNSTUBBED (?<proc>\S+)/;

/** Print the RATCHET's verdict — violations first, then refusals under their own heading, because they are
 *  different claims: a violation says "the tree is wrong", a refusal says "this run is not a verdict". */
function announceRatchet(verdict: UnfedRatchetVerdict): void {
  const lines = ["", RULE, `  UNFED-READ RATCHET — ${String(verdict.violations.length)} violation(s) · ${String(verdict.refusals.length)} refusal(s)`, RULE];
  for (const v of verdict.violations) {
    lines.push(`  ✗ ${v}`);
  }
  if (verdict.refusals.length > 0) {
    lines.push(RULE, "  COULD NOT OBSERVE — the run is NOT a verdict (tool-error class), not a clean census:");
    for (const r of verdict.refusals) {
      lines.push(`  ! ${r}`);
    }
  }
  lines.push(RULE, `  the committed ledger: ${BASELINE_REL}`, RULE, "");
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Print the unfed-read census — one line per test FILE, listing the procedures its mounts asked for and
 *  nobody stubbed. Printed BEFORE the terminal summary so the summary stays last (tail-surviving). */
function announceUnstubbed(byFile: ReadonlyMap<string, ReadonlySet<string>>): void {
  const lines = ["", RULE, `  UNFED tRPC READS — ${byFile.size} CT file(s) mounted a tree that asked for a procedure they never stubbed`, RULE];
  for (const [file, procs] of byFile) {
    lines.push(`  • ${file}  →  ${[...procs].sort().join(", ")}`);
  }
  lines.push(
    RULE,
    "  routeTrpc answered each `null`, which is NOT a view: a SUSPENDING reader throws on it and its",
    "  QueryBoundary renders QueryErrorState while the heading outside the boundary still passes (#629).",
    RULE,
    "",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Print the LOAD-SUSPECT arms (#1232 §7.1 as amended by #1616). A CT whose verdict is a measured RATE now
 *  MEASURES on a contended box and LABELS the number (`annotateRateLoad`, _shared/load-budget.ts) — but a
 *  bare annotation is INVISIBLE in a green bar, which is the same disappearing act this reporter exists to
 *  end for retry-masked flakes. So each one is announced by name with the loadavg that caused it.
 *
 *  NOT run status. A load-suspect number is "measured, unpromotable", so it must not fail the run — it must
 *  be READABLE, so the next reader knows which arm's number is about the box. */
function announceLoadSuspect(suspect: readonly CtLoadSuspectTest[]): void {
  const lines = ["", RULE, `  LOAD-SUSPECT — ${String(suspect.length)} rate-measuring test(s) measured on a loaded box`, RULE];
  for (const w of suspect) {
    lines.push(`  ~ ${w.file}  ${w.title}`, `      ${w.reason}`);
  }
  lines.push(RULE, '  load-suspect is NOT a failure and NOT a pass (#1616 "label, don\'t withhold") — re-run on a quiet tree to judge.', RULE, "");
  process.stdout.write(`${lines.join("\n")}\n`);
}

class CtFlakyReporter implements Reporter {
  readonly #strict: boolean;
  readonly #slot: RunSlot;
  readonly #artifactPath: string;
  #rootSuite: Suite | undefined;
  /** Unfed reads (#629), keyed by the test FILE that mounted them — the census announceUnstubbed prints. */
  readonly #unstubbed = new Map<string, Set<string>>();
  /** Files that announced `[routeTrpc] ACTIVE` (#637) — the proof the census could observe them at all. */
  readonly #instrumented = new Set<string>();
  /** Rate-measuring tests that WITHHELD on this box (#1232). Collected from the reporter-visible
   *  annotation channel rather than from stderr: a skip carries no output at all. */
  readonly #loadSuspect: CtLoadSuspectTest[] = [];

  constructor(options: CtFlakyReporterOptions = {}) {
    if (options.slotDir === undefined) {
      throw new Error("CT reporter received no run slot from playwright-ct.config.ts");
    }
    this.#strict = options.strict === true;
    const adopted = { ...adoptRunSlot(process.cwd(), "ct", options.slotDir), racing: options.racing ?? [] };
    this.#slot = transferRunSlotOwnership(process.cwd(), adopted);
    this.#artifactPath = join(this.#slot.dir, ARTIFACT_NAME);
  }

  onBegin(_config: unknown, suite: Suite): void {
    this.#rootSuite = suite;
  }

  // The withhold annotation can be stamped at RUNTIME (`test.info().annotations.push`), so it lands on the
  // RESULT; a statically declared one lands on the CASE. Read both — a withhold seen in only one place
  // would make the census depend on where the arm happened to declare itself.
  onTestEnd(test: TestCase, result: TestResult): void {
    const note = [...result.annotations, ...test.annotations].find((a) => a.type === LOAD_SUSPECT_ANNOTATION);
    if (note !== undefined) {
      this.#loadSuspect.push({ file: relative(process.cwd(), test.location.file), title: test.title, reason: note.description ?? LOAD_SUSPECT_ANNOTATION });
    }
  }

  // routeTrpc's marker arrives on the WORKER's stderr, attributed to the running test (#629). A chunk can
  // carry several lines and a Buffer, so normalise before matching.
  onStdErr(chunk: string | Buffer, test: TestCase | undefined): void {
    if (test === undefined) {
      return;
    }
    const file = relative(process.cwd(), test.location.file);
    for (const raw of chunk.toString().split(/\r?\n/u)) {
      const line = raw.trim();
      // The liveness half (#637): every `routeTrpc` registration announces itself, so a file that calls the
      // stub and produces NO marker is a file the census could not observe — a refusal, not a clean zero.
      if (line.startsWith(ACTIVE_MARKER)) {
        this.#instrumented.add(file);
        continue;
      }
      // Bracketed: `groups` is an index signature, so `noPropertyAccessFromIndexSignature` refuses the dot.
      const proc = UNSTUBBED_LINE.exec(line)?.groups?.["proc"];
      if (proc === undefined) {
        continue;
      }
      const seen = this.#unstubbed.get(file) ?? new Set<string>();
      seen.add(proc);
      this.#unstubbed.set(file, seen);
    }
  }

  /** Judge this run against the committed ledger (#637). Returns the verdict so `onEnd` can both print it
   *  and fail the run — a ratchet that only prints is the diagnostics posture this replaced. */
  #judge(facts: CtRunFacts): UnfedRatchetVerdict {
    const root = process.cwd();
    return judgeUnfedReads(
      {
        executedFiles: facts.executedFiles,
        instrumentedFiles: this.#instrumented,
        unfedByFile: new Map([...this.#unstubbed].map(([file, procs]) => [file, [...procs].sort()])),
      },
      readBudgetRows(root, BASELINE_REL),
      { owesMarker: (file): boolean => owesActiveMarker(root, file), fileExists: (file): boolean => existsSync(join(root, file)) },
    );
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    await Promise.resolve();
    const suite = this.#rootSuite;
    // ONE read of the run's facts, and every number, list and artifact below is rendered from it — a
    // second independent walk is how a summary and its own FAILED list could ever disagree (#1006).
    const facts = suite === undefined ? undefined : readRun(suite, process.cwd());
    const flaky = facts?.flaky ?? [];
    writeArtifact(flaky, this.#strict, this.#slot, this.#artifactPath);
    if (flaky.length > 0) {
      announce(flaky, this.#strict, this.#artifactPath);
    }
    if (this.#unstubbed.size > 0) {
      announceUnstubbed(this.#unstubbed);
    }
    if (this.#loadSuspect.length > 0) {
      announceLoadSuspect(this.#loadSuspect);
    }
    // The RATCHET (#637). Judged whenever there is a suite to judge, and printed only when it has something
    // to say — a silent ratchet on a clean run is the point.
    const verdict = facts === undefined ? { refusals: [], violations: [] } : this.#judge(facts);
    const ratchetFailed = verdict.violations.length > 0 || verdict.refusals.length > 0;
    if (ratchetFailed) {
      announceRatchet(verdict);
    }
    // Terminal summary LAST — the un-buried, tail-surviving record of what happened this run. On a hard
    // fail it names every failing test (the exit-1-with-no-name gap this reporter closes). It reports the
    // EFFECTIVE status, not playwright's: a run whose every test passed but whose ratchet fired exits 1, and
    // a tail-surviving summary that said PASS beside that exit would be the last line lying about the run.
    if (facts !== undefined) {
      process.stdout.write(`${summaryLines(facts.tally, facts.failed, ratchetFailed ? "failed" : result.status).join("\n")}\n`);
    }
    // A refusal fails the run exactly like a violation: "the census could not observe" must never be
    // indistinguishable from "the census found nothing".
    return ratchetFailed || (this.#strict && flaky.length > 0) ? { status: "failed" } : undefined;
  }
}

export default CtFlakyReporter;
