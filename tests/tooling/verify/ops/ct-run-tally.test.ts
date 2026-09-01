// THE PERMANENT PIN for the CT summary counts (#1006) — the block every merge floor and every lane report
// quotes as its receipt ("N passed · N failed"). On 2026-09-01 it was ACCUSED of inverting a scoped run
// ("2 passed / 51 failed" against a `--reporter=list` reading of "52 passed / 1 failed"), and no live
// reproduction found a defect: three arms (trivial pass/fail, 51 retry-then-pass flakes, the real tests/ui
// suites) all agreed with the json reporter's own counts from the SAME run. What the investigation did find
// is that nothing could ever have cleared or convicted the counter — it was a private function over a
// Playwright `Suite`. So the counting became pure (`ct-run-tally.ts`) and this is the test that judges it.
//
// EVERY ARM IS A WAY THE RECEIPT COULD LIE:
//   • the MIXED census — pass/fail/retry-then-pass/skip in one run, across several worker indices, must
//     bucket exactly. A retried-then-passed test is `flaky` and NOT also `passed`; a run's four numbers
//     always sum to its test count.
//   • WORKERS ARE NOT A DIMENSION — the accusation's shape (a big scoped multi-worker run) is exactly where
//     a per-worker accumulator would double-count or drop. The same tests re-attributed to one worker must
//     produce identical facts.
//   • ONE WALK — the summary's counts and its FAILED list are read from a single pass, so `failed.length`
//     and `tally.failed` can never disagree. The old reporter walked the suite three separate times.
//   • THE RENDERED LINE — the numbers reaching stdout are asserted on the rendered text, not just the
//     struct, because a receipt nobody can read is not a receipt.
import type { CtOutcome, CtSuiteFacts, CtTestFacts } from "../../../../tooling/src/verify/contract/ct-run.ts";
import { CT_OUTCOMES } from "../../../../tooling/src/verify/contract/ct-run.ts";
import { readRun, summaryLines } from "../../../../tooling/src/verify/ops/ct-run-tally.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const FILE = "tests/ui/density-tier.suite.ct.tsx";
const OTHER = "tests/ui/touch-target-floor.suite.ct.tsx";

interface CaseSpec {
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly outcome: CtOutcome;
  /** Attempts Playwright recorded — one per try, so retries burned = attempts - 1. */
  readonly attempts?: number;
  readonly workerIndex?: number;
}

/** One synthetic Playwright test case: an outcome, an attempt count, and the worker that ran it. */
function testCase(spec: CaseSpec): CtTestFacts {
  const { file, line, title, outcome, attempts = 1, workerIndex = 0 } = spec;
  return {
    location: { file: `${ROOT}/${file}`, line, column: 1 },
    outcome: (): CtOutcome => outcome,
    titlePath: (): readonly string[] => ["", "chromium", file, title],
    results: Array.from({ length: attempts }, () => ({ workerIndex })),
  };
}

function suiteOf(cases: readonly CtTestFacts[]): CtSuiteFacts {
  return { allTests: (): readonly CtTestFacts[] => cases };
}

/** The accusation's own shape, at its own scale: the run whose truth was 52 passed / 1 failed and which was
 *  read as "2 passed / 51 failed" — spread over `workers` workers the way a real scoped run spreads it.
 *  DELIBERATELY ASYMMETRIC in every column: a fixture with equal passes and failures survives the exact
 *  inversion it exists to catch (measured — a 1-pass/1-fail arm stayed green under a swapped bucket map). */
function accusationShapedRun(workers: number): readonly CtTestFacts[] {
  const passes = Array.from({ length: 50 }, (_unused, i) =>
    testCase({ file: FILE, line: 10 + i, title: `pass ${String(i)}`, outcome: "expected", workerIndex: i % workers }),
  );
  return [
    ...passes,
    testCase({ file: FILE, line: 200, title: "retry-masked pass", outcome: "flaky", attempts: 2, workerIndex: 2 % workers }),
    testCase({ file: FILE, line: 210, title: "another retry-masked pass", outcome: "flaky", attempts: 3, workerIndex: 1 % workers }),
    testCase({ file: OTHER, line: 300, title: "hard fail", outcome: "unexpected", attempts: 3, workerIndex: 3 % workers }),
  ];
}

test("MIXED CENSUS: pass / hard-fail / retry-then-pass / skip bucket exactly, and the four numbers total the run", () => {
  // Every column a different number — equal columns survive the very inversion this arm exists to catch.
  const cases = [
    testCase({ file: FILE, line: 5, title: "passes", outcome: "expected" }),
    testCase({ file: FILE, line: 10, title: "passes too", outcome: "expected", workerIndex: 1 }),
    testCase({ file: FILE, line: 20, title: "fails after every retry", outcome: "unexpected", attempts: 3 }),
    testCase({ file: FILE, line: 30, title: "fails then passes", outcome: "flaky", attempts: 2, workerIndex: 1 }),
    testCase({ file: OTHER, line: 40, title: "never ran", outcome: "skipped", attempts: 0 }),
    testCase({ file: OTHER, line: 50, title: "never ran either", outcome: "skipped", attempts: 0 }),
    testCase({ file: OTHER, line: 60, title: "also never ran", outcome: "skipped", attempts: 0 }),
  ];

  const facts = readRun(suiteOf(cases), ROOT);

  expect(facts.tally).toEqual({ passed: 2, failed: 1, flaky: 1, skipped: 3 });
  expect(facts.tally.passed + facts.tally.failed + facts.tally.flaky + facts.tally.skipped).toBe(cases.length);
  // A retry-masked pass is flaky and NOT also passed — the whole reason the announcer exists.
  expect(facts.flaky.map((f) => f.title)).toEqual([`chromium › ${FILE} › fails then passes`]);
  expect(facts.failed.map((f) => f.line)).toEqual([20]);
  // A skipped test observed nothing, so its file did not execute — the unfed-read ratchet's scoped-run
  // safety rests on this exact set (a file wrongly listed here would red a file nobody ran).
  expect(facts.executedFiles).toEqual([FILE]);
});

test("THE ACCUSED SHAPE: a 53-test scoped run over four workers reads as itself, never as the inverted columns", () => {
  const facts = readRun(suiteOf(accusationShapedRun(4)), ROOT);

  expect(facts.tally).toEqual({ passed: 50, failed: 1, flaky: 2, skipped: 0 });
  // The reported lie was a swap of the pass and fail columns; assert the RENDERED line, which is the
  // artefact a merge floor actually quotes.
  const rendered = summaryLines(facts.tally, facts.failed, "failed").join("\n");
  expect(rendered).toContain("CT SUMMARY — FAILED  ·  50 passed · 1 failed · 2 flaky · 0 skipped");
  expect(rendered).toContain(`✗ ${OTHER}:300  chromium › ${OTHER} › hard fail`);
});

test("WORKERS ARE NOT A DIMENSION: the same run spread over four workers and over one reads identically", () => {
  const spread = readRun(suiteOf(accusationShapedRun(4)), ROOT);
  const single = readRun(suiteOf(accusationShapedRun(1)), ROOT);

  expect(single.tally).toEqual(spread.tally);
  expect(single.flaky.map((f) => f.retries)).toEqual(spread.flaky.map((f) => f.retries));
  expect(single.failed).toEqual(spread.failed);
  expect(single.executedFiles).toEqual(spread.executedFiles);
});

test("ONE WALK: the summary's counts and its own FAILED list describe the same set", () => {
  const cases = [
    testCase({ file: FILE, line: 10, title: "a", outcome: "unexpected" }),
    testCase({ file: FILE, line: 20, title: "b", outcome: "unexpected", attempts: 2 }),
    testCase({ file: OTHER, line: 30, title: "c", outcome: "expected" }),
  ];

  const facts = readRun(suiteOf(cases), ROOT);

  expect(facts.failed).toHaveLength(facts.tally.failed);
  const rendered = summaryLines(facts.tally, facts.failed, "failed").join("\n");
  expect(rendered).toContain("1 passed · 2 failed · 0 flaky · 0 skipped");
  expect(rendered).toContain("FAILED (2):");
});

test("RETRIES BURNED are attempts minus one, and a flake reported with no attempt history still reads as one retry", () => {
  const cases = [
    testCase({ file: FILE, line: 10, title: "three attempts", outcome: "flaky", attempts: 3 }),
    testCase({ file: FILE, line: 20, title: "no history", outcome: "flaky", attempts: 0 }),
  ];

  const facts = readRun(suiteOf(cases), ROOT);

  expect(facts.flaky.map((f) => f.retries)).toEqual([2, 1]);
});

test("PATHS ARE REPO-RELATIVE: the receipt names a path a reader can open", () => {
  const facts = readRun(suiteOf([testCase({ file: FILE, line: 10, title: "x", outcome: "unexpected" })]), ROOT);

  expect(facts.failed[0]?.file).toBe(FILE);
});

// The DENOMINATOR arm: the axis is declared once as a tuple, and every member of it must land in a
// counted bucket. Without this, adding a fifth Playwright outcome would compile (the bucket map is keyed by
// the union) but a test carrying it could silently fall out of the totals — the exact hole the tuple exists
// to close, asserted rather than assumed.
test("EVERY declared outcome is counted: the four buckets total the run for each member of the axis", () => {
  for (const outcome of CT_OUTCOMES) {
    const facts = readRun(suiteOf([testCase({ file: FILE, line: 1, title: outcome, outcome, attempts: 2 })]), ROOT);
    const total = facts.tally.passed + facts.tally.failed + facts.tally.flaky + facts.tally.skipped;
    expect({ outcome, total }).toEqual({ outcome, total: 1 });
  }
});

test("A GREEN RUN renders PASS with no FAILED block", () => {
  const cases = [testCase({ file: FILE, line: 10, title: "x", outcome: "expected" }), testCase({ file: OTHER, line: 20, title: "y", outcome: "expected" })];
  const facts = readRun(suiteOf(cases), ROOT);
  const rendered = summaryLines(facts.tally, facts.failed, "passed").join("\n");

  expect(rendered).toContain("CT SUMMARY — PASS  ·  2 passed · 0 failed · 0 flaky · 0 skipped");
  expect(rendered).not.toContain("FAILED (");
});
