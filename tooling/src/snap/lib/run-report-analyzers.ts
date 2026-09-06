// Browser-free rendering for analyzer-owned problem rows. The analyzer artifacts own threshold policy;
// this module only preserves severity, caps terminal output and points to the full immutable population.
import { print } from "../../_shared/artifacts.ts";
import type { SnapAnalyzerProblemKind } from "../contract/analyzer.ts";
import { isSnapAnalyzerProducer, snapAnalyzerArm } from "../contract/analyzer.ts";
import type { SnapReportQuery, SnapRunIndex } from "../contract/run-index.ts";
import { readSnapAnalyzerProblems } from "./run-report-problems.ts";

const DISPLAY_CAP = 20;
/** Mapped over the kind union, so a new member fails `tsc` here rather than sorting as `undefined`.
 *  `exemption` ranks LAST: it explains a measurement that did NOT fail, so it never displaces a row that
 *  did under the display cap. */
const PROBLEM_RANK: Record<SnapAnalyzerProblemKind, number> = { "evidence-gap": 0, failure: 1, threshold: 2, exemption: 3 };

export async function reportAnalyzerProblems(index: SnapRunIndex, query: SnapReportQuery, showRows = true): Promise<void> {
  const artifacts = index.artifacts.filter(
    (artifact) =>
      isSnapAnalyzerProducer(artifact.producer) && (query.arm === null || artifact.producer === query.arm || snapAnalyzerArm(artifact.producer) === query.arm),
  );
  const reads = (await Promise.all(artifacts.map(readSnapAnalyzerProblems))).filter((read) => read !== null);
  const rows = reads.flatMap((read) => read.problems).toSorted((left, right) => PROBLEM_RANK[left.kind] - PROBLEM_RANK[right.kind]);
  if (showRows) {
    for (const problem of rows.slice(0, DISPLAY_CAP)) {
      print(
        `PROBLEM      arm=${problem.arm} kind=${problem.kind} metric=${problem.metric} subject=${JSON.stringify(problem.subject)} observed=${JSON.stringify(problem.observed)} threshold=${problem.threshold} detail=${JSON.stringify(problem.detail)}`,
      );
    }
    if (rows.length > DISPLAY_CAP) {
      print(
        `PROBLEMS     omitted=${String(rows.length - DISPLAY_CAP)} of ${String(rows.length)} analyzer-owned rows; full rows remain in the indexed artifacts`,
      );
    }
  }
  const failed = new Set(
    index.verdict.arms
      .filter(
        (arm) =>
          ["motion", "interaction-perf", "heap"].includes(arm.arm) &&
          ["failed", "refused"].includes(arm.state) &&
          (query.arm === null || query.arm === arm.arm),
      )
      .map((arm) => arm.arm),
  );
  for (const read of showRows ? reads : []) {
    if (read.legacyMissing && isSnapAnalyzerProducer(read.artifact.producer) && failed.has(snapAnalyzerArm(read.artifact.producer))) {
      print(
        `PROBLEM      arm=${snapAnalyzerArm(read.artifact.producer)} kind=evidence-gap metric=structured-problems subject="legacy artifact" observed="absent" threshold=required detail="rerun with current Snap; this older artifact predates analyzer-owned problem rows"`,
      );
    }
  }
}
