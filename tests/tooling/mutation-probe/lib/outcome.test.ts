import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifySuiteExit, readSuiteEvidence } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SPEC_REL = "tests/tooling/subject.test.ts";
const STARTED_AT = 10;
const FINISHED_AT = 30;

const FAILED_REPORT = {
  success: false,
  startTime: 20,
  numTotalTests: 1,
  numPassedTests: 0,
  numFailedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  numFailedTestSuites: 1,
  testResults: [
    {
      name: SPEC_REL,
      startTime: 20,
      endTime: 25,
      status: "failed",
      assertionResults: [{ status: "failed", title: "witness", failureMessages: ["AssertionError: witness"] }],
    },
  ],
};

function reportFor(root: string, failed: boolean): typeof FAILED_REPORT {
  return {
    ...FAILED_REPORT,
    success: !failed,
    numPassedTests: failed ? 0 : 1,
    numFailedTests: failed ? 1 : 0,
    numFailedTestSuites: failed ? 1 : 0,
    testResults: FAILED_REPORT.testResults.map((file) => ({
      ...file,
      name: join(root, SPEC_REL),
      status: failed ? "failed" : "passed",
      assertionResults: file.assertionResults.map((assertion) => ({
        ...assertion,
        status: failed ? "failed" : "passed",
        failureMessages: failed ? assertion.failureMessages : [],
      })),
    })),
  };
}

test("a red suite is a kill and a green suite is a survivor", () => {
  expect(classifySuiteExit(1, { complete: true, failedTests: ["witness"], attributionMissing: false })).toBe("killed");
  expect(classifySuiteExit(0, { complete: true, failedTests: [], attributionMissing: false })).toBe("survived");
});

// THE RED-FIRST PIN. The obvious spelling is `status !== 0`, and `null !== 0` is true — so a suite the
// wall-clock ceiling KILLED (an infinite-loop mutant is the standing cause) was scored as though the
// tests had caught it. That hides a real survivor behind a confident kill.
test("a timeout-killed suite is UNMEASURED, never a kill", () => {
  expect(classifySuiteExit(null)).toBe("unmeasured");
  expect(classifySuiteExit(null)).not.toBe("killed");
});

test("tool errors, misuse and abnormal exits cannot establish a mutant kill", () => {
  for (const status of [2, 3, 42]) {
    expect(classifySuiteExit(status, { complete: true, failedTests: ["witness"], attributionMissing: false })).toBe("unmeasured");
  }
});

test("an exit alone or disagreement with the completed report refuses classification", () => {
  expect(classifySuiteExit(0)).toBe("unmeasured");
  expect(classifySuiteExit(1)).toBe("unmeasured");
  expect(classifySuiteExit(0, { complete: true, failedTests: ["witness"], attributionMissing: false })).toBe("unmeasured");
  expect(classifySuiteExit(1, { complete: true, failedTests: [], attributionMissing: false })).toBe("unmeasured");
});

test("a completed report accounts for legitimate skipped and todo assertions", ({ scratch }) => {
  const path = join(scratch, "suite.json");
  const report = reportFor(scratch, false);
  report.numTotalTests = 3;
  report.numPendingTests = 1;
  report.numTodoTests = 1;
  report.testResults = report.testResults.map((file) => ({
    ...file,
    assertionResults: [
      ...file.assertionResults,
      { status: "skipped", title: "skipped witness", failureMessages: [] },
      { status: "todo", title: "todo witness", failureMessages: [] },
    ],
  }));
  writeFileSync(path, JSON.stringify(report));
  const evidence = readSuiteEvidence({ root: scratch, specs: [SPEC_REL], path, startedAt: STARTED_AT, finishedAt: FINISHED_AT });
  expect(evidence).toEqual({ complete: true, failedTests: [], attributionMissing: false });
  expect(classifySuiteExit(0, evidence)).toBe("survived");
});

test("a named failed row without failure evidence cannot establish a kill", ({ scratch }) => {
  const path = join(scratch, "suite.json");
  const report = reportFor(scratch, true);
  report.testResults = report.testResults.map((file) => ({
    ...file,
    assertionResults: file.assertionResults.map((assertion) => ({ ...assertion, failureMessages: [] })),
  }));
  writeFileSync(path, JSON.stringify(report));
  const evidence = readSuiteEvidence({ root: scratch, specs: [SPEC_REL], path, startedAt: STARTED_AT, finishedAt: FINISHED_AT });
  expect(evidence.complete).toBe(false);
  expect(classifySuiteExit(1, evidence)).toBe("unmeasured");
});
