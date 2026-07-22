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
// Posture (decided against the CT harness in scripts/verify/registry.ts): DEFAULT = WARN loudly — retries
// stay, so the suite stays green on transient infra (the 500-test-parallelism drawer/chart/RO artifacts the
// gate retries around). OPT-IN STRICT = `CT_NO_FLAKES=1` (decoded by playwright-ct.config.ts, which owns
// env, and passed in as the `strict` option) → onEnd overrides the run status to `failed` (nonzero exit)
// whenever any test needed a retry, for the orchestrator's flake-hunt passes.
//
// A `flaky` outcome is precisely failed-then-passed (Playwright's own classification); `unexpected` (hard
// fail) already fails the run, and `expected`/`skipped` are not retries. Retries burned = results.length-1
// (fails attempt 0..n-1, passes attempt n).
//
// FAILURE SURFACING (added 2026-07-20): a HARD failure under --retries=0 previously produced only
// `[ELIFECYCLE] Command failed with exit code 1` with no test name — a truncated log lost the actual
// failure and the diagnosis stalled. onEnd now ALWAYS prints a terminal summary block at the very end of
// the run (pass/fail/flaky/skip counts), and on any hard failure lists each failing test's file:line +
// title. Printed LAST so it survives a `tail`. This is diagnostics only — it never changes run status on a
// hard fail (Playwright already fails); STRICT flake-fail behavior is unchanged.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import type { FullResult, Reporter, Suite, TestCase } from "@playwright/test/reporter";

const ARTIFACT_PATH = join(process.cwd(), "reports", "ct-flaky.json");
const RULE_WIDTH = 88;
const RULE = "━".repeat(RULE_WIDTH);

type CtFlakyReporterOptions = { readonly strict?: boolean };

type FlakyTest = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly title: string;
  readonly titlePath: readonly string[];
  readonly retries: number;
};

type FlakyArtifact = {
  readonly generatedAt: string;
  readonly flakyCount: number;
  readonly strict: boolean;
  readonly flaky: readonly FlakyTest[];
};

type FailedTest = {
  readonly file: string;
  readonly line: number;
  readonly title: string;
};

type Tally = {
  readonly passed: number;
  readonly failed: number;
  readonly flaky: number;
  readonly skipped: number;
};

function collectFlaky(suite: Suite): FlakyTest[] {
  const flaky: FlakyTest[] = [];
  for (const testCase of suite.allTests()) {
    if (testCase.outcome() !== "flaky") {
      continue;
    }
    const { file, line, column } = testCase.location;
    const path = testCase.titlePath().filter(Boolean);
    flaky.push({
      file: relative(process.cwd(), file),
      line,
      column,
      title: path.join(" › "),
      titlePath: path,
      retries: Math.max(testCase.results.length - 1, 1),
    });
  }
  return flaky;
}

// `unexpected` is Playwright's hard-fail outcome (failed even after any retries). We list these by
// file:line + title so a truncated/tailed log still names what broke.
function collectFailed(suite: Suite): FailedTest[] {
  const failed: FailedTest[] = [];
  for (const testCase of suite.allTests()) {
    if (testCase.outcome() !== "unexpected") {
      continue;
    }
    const { file, line } = testCase.location;
    failed.push({
      file: relative(process.cwd(), file),
      line,
      title: testCase.titlePath().filter(Boolean).join(" › "),
    });
  }
  return failed;
}

function tally(suite: Suite): Tally {
  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const byOutcome: Record<ReturnType<TestCase["outcome"]>, keyof typeof counts> = {
    expected: "passed",
    unexpected: "failed",
    flaky: "flaky",
    skipped: "skipped",
  };
  for (const testCase of suite.allTests()) {
    counts[byOutcome[testCase.outcome()]] += 1;
  }
  return counts;
}

function writeArtifact(flaky: readonly FlakyTest[], strict: boolean): void {
  const artifact: FlakyArtifact = {
    generatedAt: new Date().toISOString(),
    flakyCount: flaky.length,
    strict,
    flaky,
  };
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, undefined, 2)}\n`);
}

function announce(flaky: readonly FlakyTest[], strict: boolean): void {
  const posture = strict ? "STRICT (CT_NO_FLAKES=1) — FAILING the run" : "WARN (suite stays green; set CT_NO_FLAKES=1 to fail)";
  const lines = ["", RULE, `  CT FLAKES DETECTED — ${flaky.length} test(s) passed ONLY on retry (masked by --retries)`, `  posture: ${posture}`, RULE];
  for (const t of flaky) {
    lines.push(`  • ${t.file}:${t.line}  ${t.title}  (${t.retries} retr${t.retries === 1 ? "y" : "ies"})`);
  }
  lines.push(RULE, `  machine-readable: ${relative(process.cwd(), ARTIFACT_PATH)}`, RULE, "");
  process.stdout.write(`${lines.join("\n")}\n`);
}

// The terminal summary — ALWAYS printed, LAST, so a hard failure survives a `tail`. `status` is the run's
// overall result ("passed" = green even with retries; "failed" = at least one hard fail / interruption).
function printSummary(t: Tally, failed: readonly FailedTest[], status: FullResult["status"]): void {
  const verdict = status === "passed" ? "PASS" : status.toUpperCase();
  const lines = ["", RULE, `  CT SUMMARY — ${verdict}  ·  ${t.passed} passed · ${t.failed} failed · ${t.flaky} flaky · ${t.skipped} skipped`];
  if (failed.length > 0) {
    lines.push(RULE, `  FAILED (${failed.length}):`);
    for (const f of failed) {
      lines.push(`  ✗ ${f.file}:${f.line}  ${f.title}`);
    }
  }
  lines.push(RULE, "");
  process.stdout.write(`${lines.join("\n")}\n`);
}

class CtFlakyReporter implements Reporter {
  readonly #strict: boolean;
  #rootSuite: Suite | undefined;

  constructor(options: CtFlakyReporterOptions = {}) {
    this.#strict = options.strict === true;
  }

  onBegin(_config: unknown, suite: Suite): void {
    this.#rootSuite = suite;
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    await Promise.resolve();
    const suite = this.#rootSuite;
    const flaky = suite === undefined ? [] : collectFlaky(suite);
    writeArtifact(flaky, this.#strict);
    if (flaky.length > 0) {
      announce(flaky, this.#strict);
    }
    // Terminal summary LAST — the un-buried, tail-surviving record of what happened this run. On a hard
    // fail it names every failing test (the exit-1-with-no-name gap this reporter closes).
    if (suite !== undefined) {
      printSummary(tally(suite), collectFailed(suite), result.status);
    }
    return this.#strict && flaky.length > 0 ? { status: "failed" } : undefined;
  }
}

export default CtFlakyReporter;
