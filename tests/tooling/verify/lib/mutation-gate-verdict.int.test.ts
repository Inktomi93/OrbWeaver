// #2505 — THE EXIT-CLASS HALF. `quality:mutation-gate` classifies Stryker with `asViolations`: any non-zero
// becomes a violation. Stryker's exit 1 has two causes and that mapping cannot tell them apart —
//
//   • the mutation score fell under the break threshold (a VERDICT, a real red), and
//   • Stryker died before running a mutant (NO VERDICT: the run is not a measurement).
//
// On 2026-09-20 the second happened and `reports/verify.json` recorded "violations" over ZERO tested
// mutants. Under the repo's exit contract (0 clean · 1 violations · 2 tool error · 3 misuse) that is a
// tool error wearing a verdict's clothes, and a barrier reading the red count cannot see it.
//
// THE RED-FIRST TRANSCRIPT BELOW IS A REAL CAPTURE — the head of
// `reports/runs/verify/main-913391-2026-09-20T22-20-00-576Z/stages/quality-mutation-gate.log`, the run that
// exposed this. The verdict transcripts are built from the EXACT sentences `determineExitCode` logs
// (`@stryker-mutator/core@10.0.0 dist/src/reporters/mutation-test-report-helper.js:136,141`), and the last
// test in this file is their SOURCE KEEPER: if a Stryker bump changes that wording, the audit would refuse
// every run forever, so the pin reds on the installed package rather than waiting for the outage.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { StageDef } from "../../../../tooling/src/verify/index.ts";
import { auditedExit, auditOf, mutationGateStageAudit, parseMutantProgress, REGISTRY, reachedMutationVerdict } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/** The measured #2505 failure: Stryker crashed in sandbox setup after instrumenting 1177 mutants, node
 *  exited 1 on the uncaught rejection, and NOT ONE mutant ran. */
const CRASHED = [
  "$ nice -n 19 stryker run stryker.gate.config.js",
  "INFO ProjectReader No incremental result file found at reports/stryker-gate-incremental.json, a full mutation testing run will be performed.",
  "INFO ProjectReader Found 4 of 10431 file(s) to be mutated.",
  "INFO Instrumenter Instrumented 4 source file(s) with 1177 mutant(s)",
  "ERROR Stryker Unexpected error occurred while running Stryker Error: ENOENT: no such file or directory, scandir '/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-aaa9b6274e7956db3'",
  "node:internal/process/promises:324",
  "[ELIFECYCLE] Command failed with exit code 1.",
].join("\n");

/** A crash PART-WAY THROUGH: mutants ran, but the run still never reached a score. Refusal too — and the
 *  message must name how far it got, because "it failed" is the sentence that let the first one sit. */
const CRASHED_MIDWAY = `${CRASHED}\nMutation testing 41% (elapsed: ~30m, remaining: ~42m) 484/1177 tested (61 survived, 2 timed out)\n`;

const SCORE_UNDER_THRESHOLD =
  "Mutation testing 100% 1177/1177 tested (140 survived, 6 timed out)\nERROR MutationTestReportHelper Final mutation score 78.41 under breaking threshold 82, setting exit code to 1 (failure).\n";
const SCORE_MET = "INFO MutationTestReportHelper Final mutation score of 84.02 is greater than or equal to break threshold 82\n";
const REPORT_READY_ONLY = "Ran 3.71 tests per mutant on average.\n";

function gateStage(): StageDef {
  const stage = REGISTRY.find((row) => row.name === "quality:mutation-gate");
  if (stage === undefined) {
    throw new Error("quality:mutation-gate is not in the registry");
  }
  return stage;
}

test("a crash before the first mutant is a TOOL ERROR, not a violation", () => {
  const audit = mutationGateStageAudit(CRASHED);
  expect(audit?.kind).toBe("refusal");
  expect(audit?.message).toContain("ZERO mutants were tested");
  // The exit-class repair itself: what `asViolations` called 1, the audit makes 2.
  expect(auditedExit(1, audit)).toBe(2);
});

test("a crash PART-WAY names how far the run got", () => {
  const audit = mutationGateStageAudit(CRASHED_MIDWAY);
  expect(audit?.kind).toBe("refusal");
  expect(audit?.message).toContain("only 484 of 1177 mutants were tested");
  expect(parseMutantProgress(CRASHED_MIDWAY)).toEqual({ tested: 484, total: 1177 });
});

test("a real break-threshold failure stays a VIOLATION — the audit does not cry wolf", () => {
  expect(mutationGateStageAudit(SCORE_UNDER_THRESHOLD)).toBeNull();
  expect(auditedExit(1, mutationGateStageAudit(SCORE_UNDER_THRESHOLD))).toBe(1);
});

test("a met threshold and a bare report-ready summary both count as verdicts", () => {
  expect(reachedMutationVerdict(SCORE_MET)).toBe(true);
  // `thresholds.break: null` prints neither decision line, so the reporter's closer is the third marker.
  expect(reachedMutationVerdict(REPORT_READY_ONLY)).toBe(true);
  expect(mutationGateStageAudit(SCORE_MET)).toBeNull();
});

test("the registry row carries the audit, and the runner's authority turns its refusal into exit 2", () => {
  const stage = gateStage();
  expect(stage.auditTranscript).toBeDefined();
  expect(auditedExit(1, auditOf(stage, 1, CRASHED, ROOT))).toBe(2);
  expect(auditedExit(1, auditOf(stage, 1, SCORE_UNDER_THRESHOLD, ROOT))).toBe(1);
  // A stage already classified as a tool error is not re-audited (run.ts `auditOf`), so a refusal cannot
  // be the reason a 2 is a 2 — the disjunction in `producedNoVerdict` stays two independent facts.
  expect(auditOf(stage, 2, CRASHED, ROOT)).toBeNull();
});

test("SOURCE KEEPER: the installed Stryker still logs the sentences this audit reads", () => {
  const require = createRequire(import.meta.url);
  const helper = join(dirname(require.resolve("@stryker-mutator/core/package.json")), "dist", "src", "reporters", "mutation-test-report-helper.js");
  const clearText = join(dirname(require.resolve("@stryker-mutator/core/package.json")), "dist", "src", "reporters", "clear-text-reporter.js");
  const helperSrc = readFileSync(helper, "utf8");
  expect(helperSrc).toContain("under breaking threshold");
  expect(helperSrc).toContain("is greater than or equal to break threshold");
  // ...and it is still the ONLY place Stryker sets its own exit code, which is what makes "no decision
  // line ⇒ no verdict" exact rather than heuristic.
  expect(helperSrc.split("setExitCode(").length - 1).toBe(1);
  expect(readFileSync(clearText, "utf8")).toContain("tests per mutant on average.");
});
