// A runner exit is evidence of a kill only beside a complete, current report from every selected mirror.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SuiteEvidence, SuiteReportRequest, SuiteVerdict } from "../contract/types.ts";

const ASSERTION_STATUSES = ["passed", "failed", "skipped", "todo"] as const;
const COUNT = z.number().int().nonnegative();
const suiteReportSchema = z.object({
  success: z.boolean(),
  startTime: z.number(),
  numTotalTests: COUNT.positive(),
  numPassedTests: COUNT,
  numFailedTests: COUNT,
  numPendingTests: COUNT,
  numTodoTests: COUNT,
  numFailedTestSuites: COUNT,
  numRuntimeErrorTestSuites: COUNT.optional(),
  orbShards: z.array(z.object({ wedged: z.boolean(), nonVerdict: z.string().nullable(), unreported: z.array(z.string()) })).optional(),
  testResults: z
    .array(
      z.object({
        name: z.string().min(1),
        startTime: z.number(),
        endTime: z.number(),
        status: z.enum(["passed", "failed"]),
        assertionResults: z
          .array(
            z.object({
              status: z.enum(ASSERTION_STATUSES),
              title: z.string().trim().min(1),
              failureMessages: z.array(z.string()),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const ABSENT_EVIDENCE: SuiteEvidence = { complete: false, failedTests: [], attributionMissing: true };

function fileHasCompletedAssertions(file: z.infer<typeof suiteReportSchema>["testResults"][number], startedAt: number, finishedAt: number): boolean {
  if (file.startTime < startedAt || file.endTime < file.startTime || file.endTime > finishedAt) {
    return false;
  }
  const failures = file.assertionResults.filter((assertion) => assertion.status === "failed");
  return (
    (file.status === "failed") === failures.length > 0 && failures.every((assertion) => assertion.failureMessages.some((message) => message.trim() !== ""))
  );
}

/** Read only the completed evidence produced during this invocation for its exact mirror selection. */
export function readSuiteEvidence({ root, specs, path, startedAt, finishedAt }: SuiteReportRequest): SuiteEvidence {
  // @orb-waive caught-failure-ownership(catch): unreadable or invalid JSON is explicit incomplete evidence and cannot establish either verdict. Ends if incomplete evidence can be scored.
  try {
    const decoded = suiteReportSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!decoded.success) {
      return ABSENT_EVIDENCE;
    }
    const report = decoded.data;
    if (report.startTime < startedAt || report.startTime > finishedAt || (report.numRuntimeErrorTestSuites ?? 0) > 0) {
      return ABSENT_EVIDENCE;
    }
    if (report.orbShards?.some((shard) => shard.wedged || shard.nonVerdict !== null || shard.unreported.length > 0) === true) {
      return ABSENT_EVIDENCE;
    }
    const expected = new Set(specs.map((spec) => resolve(root, spec)));
    const actual = new Set(report.testResults.map((file) => resolve(root, file.name)));
    if (expected.size === 0 || actual.size !== report.testResults.length || actual.size !== expected.size || [...expected].some((file) => !actual.has(file))) {
      return ABSENT_EVIDENCE;
    }
    if (report.testResults.some((file) => !fileHasCompletedAssertions(file, report.startTime, finishedAt))) {
      return ABSENT_EVIDENCE;
    }
    const assertions = report.testResults.flatMap((file) => file.assertionResults);
    const counts = Object.fromEntries(ASSERTION_STATUSES.map((status) => [status, assertions.filter((assertion) => assertion.status === status).length]));
    if (
      assertions.length !== report.numTotalTests ||
      counts["passed"] !== report.numPassedTests ||
      counts["failed"] !== report.numFailedTests ||
      counts["skipped"] !== report.numPendingTests ||
      counts["todo"] !== report.numTodoTests ||
      report.numPassedTests + report.numFailedTests === 0 ||
      report.success !== (report.numFailedTests === 0) ||
      (report.numFailedTestSuites === 0) !== (report.numFailedTests === 0)
    ) {
      return ABSENT_EVIDENCE;
    }
    return {
      complete: true,
      failedTests: assertions.filter((assertion) => assertion.status === "failed").map((assertion) => assertion.title),
      attributionMissing: false,
    };
  } catch {
    return ABSENT_EVIDENCE;
  }
}

export function classifySuiteExit(status: number | null, evidence?: SuiteEvidence): SuiteVerdict {
  if (evidence?.complete !== true || (status !== EXIT.clean && status !== EXIT.violations)) {
    return "unmeasured";
  }
  if (status === EXIT.clean && evidence.failedTests.length === 0) {
    return "survived";
  }
  return status === EXIT.violations && evidence.failedTests.length > 0 ? "killed" : "unmeasured";
}
