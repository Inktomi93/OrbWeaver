// THE CT RUN TALLY — the pure judge behind the terminal summary block `ct-flaky-reporter.ts` prints.
//
// WHY IT IS ITS OWN MODULE (#1006). That summary is the RECEIPT every merge floor and every lane report
// quotes ("N passed · N failed"), and on 2026-09-01 it was ACCUSED of lying: a scoped run was read as
// "2 passed / 51 failed" where a `--reporter=list` run of the same selection read "52 passed / 1 failed".
// A counting surface nobody can test is a counting surface nobody can clear, so the counting moved here —
// a pure function over the run's facts — and the reporter kept only the eyes (the Playwright wiring:
// onBegin/onStdErr/onEnd, the artifact write, the announcements). Same split, and same reason, as
// `ct-unfed-ratchet.ts`: the judging is pinned by a committed test, the plumbing is not pinnable at all.
//
// THE SUITE WALK IS PART OF THE JUDGE, DELIBERATELY. An inversion in a summary would live in exactly one
// of two places — the per-test outcome→bucket mapping, or the walk that visits the tests — so a judge that
// took pre-bucketed counts would pin the half that cannot be wrong. The shapes it walks live in
// `../contract/ct-run.ts` (a minimal structural slice of Playwright's `Suite`/`TestCase`, not the vendor
// types), so the real reporter passes the real suite and the pin passes a synthetic one — mixed
// pass/fail/retry-then-pass across several workers, with no Playwright runtime in the test.
//
// RETRY ACCOUNTING. Playwright's own `outcome()` is the authority for every bucket: `expected` = passed,
// `unexpected` = a hard fail (failed even after every retry), `flaky` = failed-then-passed, `skipped`.
// The buckets are therefore DISJOINT and total: a retried-then-passed test is `flaky`, never also
// `passed`, so a run's four numbers always sum to its test count no matter how many attempts or workers
// produced them. Retries burned = attempts - 1 (a test fails attempts 0..n-1 and passes attempt n).
import { relative } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { CtFailedTest, CtFlakyTest, CtOutcome, CtRunFacts, CtRunTally, CtSuiteFacts } from "../contract/ct-run.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:ct (the CT reporter imports this judge; it has no CLI of its own)");

/** The width of the summary rules — one home, shared with the reporter's other announcement blocks. */
const RULE_WIDTH = 88;
/** The horizontal rule the CT announcement blocks are drawn with. */
export const RULE = "━".repeat(RULE_WIDTH);

const BUCKET: Record<CtOutcome, keyof CtRunTally> = {
  expected: "passed",
  unexpected: "failed",
  flaky: "flaky",
  skipped: "skipped",
};

/** Read one run's facts off the suite. ONE walk, so every number and list below describes the same set. */
export function readRun(suite: CtSuiteFacts, root: string): CtRunFacts {
  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const failed: CtFailedTest[] = [];
  const flaky: CtFlakyTest[] = [];
  const executedFiles = new Set<string>();
  for (const testCase of suite.allTests()) {
    const outcome = testCase.outcome();
    counts[BUCKET[outcome]] += 1;
    const { file, line, column } = testCase.location;
    const relFile = relative(root, file);
    const path = testCase.titlePath().filter(Boolean);
    const title = path.join(" › ");
    if (outcome !== "skipped") {
      executedFiles.add(relFile);
    }
    if (outcome === "unexpected") {
      failed.push({ file: relFile, line, title });
    }
    if (outcome === "flaky") {
      flaky.push({ file: relFile, line, column, title, titlePath: path, retries: Math.max(testCase.results.length - 1, 1) });
    }
  }
  return { tally: counts, failed, flaky, executedFiles: [...executedFiles] };
}

/** The terminal summary block, LAST in the run output so a truncated log still names what broke. `status`
 *  is the EFFECTIVE run status, not necessarily Playwright's — a run whose every test passed but whose
 *  unfed-read ratchet fired exits 1, and a tail-surviving PASS beside that exit would be a lying line. */
export function summaryLines(tally: CtRunTally, failed: readonly CtFailedTest[], status: string): readonly string[] {
  const verdict = status === "passed" ? "PASS" : status.toUpperCase();
  const lines = [
    "",
    RULE,
    `  CT SUMMARY — ${verdict}  ·  ${String(tally.passed)} passed · ${String(tally.failed)} failed · ${String(tally.flaky)} flaky · ${String(tally.skipped)} skipped`,
  ];
  if (failed.length > 0) {
    lines.push(RULE, `  FAILED (${String(failed.length)}):`);
    for (const f of failed) {
      lines.push(`  ✗ ${f.file}:${String(f.line)}  ${f.title}`);
    }
  }
  lines.push(RULE, "");
  return lines;
}
