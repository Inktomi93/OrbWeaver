// Browser-free validation of analyzer-owned problem rows. Thresholds are written by the analyzer that
// owns them; this reader preserves and renders those facts without importing or re-running verdict code.
import { readFile } from "node:fs/promises";
import type { SnapAnalyzerProblem, SnapAnalyzerProblemKind, SnapAnalyzerProducer } from "../contract/analyzer.ts";
import { isSnapAnalyzerProducer, SNAP_ANALYZER_PROBLEM_KINDS, snapAnalyzerArm } from "../contract/analyzer.ts";
import type { SnapRunArtifact } from "../contract/run-index.ts";

type AnalyzerArm = SnapAnalyzerProblem["arm"];

function isProblemKind(value: unknown): value is SnapAnalyzerProblemKind {
  return SNAP_ANALYZER_PROBLEM_KINDS.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function problemRow(value: unknown, path: string, producer: SnapAnalyzerProducer): SnapAnalyzerProblem {
  if (!isRecord(value)) {
    throw new Error(`${path} contains a malformed analyzer problem row`);
  }
  const { arm, kind, metric, subject, observed, threshold, detail } = value;
  const expectedArm: AnalyzerArm = snapAnalyzerArm(producer);
  if (
    arm !== expectedArm ||
    !isProblemKind(kind) ||
    typeof metric !== "string" ||
    typeof subject !== "string" ||
    typeof observed !== "string" ||
    typeof threshold !== "string" ||
    typeof detail !== "string"
  ) {
    throw new Error(`${path} contains a malformed analyzer problem row`);
  }
  return { arm: expectedArm, kind, metric, subject, observed, threshold, detail };
}

export interface SnapAnalyzerProblemRead {
  readonly artifact: SnapRunArtifact;
  readonly problems: readonly SnapAnalyzerProblem[];
  readonly legacyMissing: boolean;
}

function missingProblems(artifact: SnapRunArtifact): SnapAnalyzerProblemRead {
  if (artifact.schema === "json") {
    return { artifact, problems: [], legacyMissing: true };
  }
  throw new Error(`${artifact.path} is missing current analyzer problem evidence`);
}

export async function readSnapAnalyzerProblems(artifact: SnapRunArtifact): Promise<SnapAnalyzerProblemRead | null> {
  const schema = artifact.schema;
  const producer = isSnapAnalyzerProducer(artifact.producer) ? artifact.producer : null;
  const compatibleSchema =
    schema === "json" ||
    (artifact.producer === "motion" && schema === "snap-motion-v1") ||
    (artifact.producer === "perf" && schema === "snap-interaction-perf-v1") ||
    (artifact.producer === "heap" && ["snap-heap-snapshot-v1", "snap-heap-comparison-v1", "snap-heap-retainers-v1"].includes(schema ?? "")) ||
    (artifact.producer === "design-audit" && schema === "snap-design-audit-v1");
  if (producer === null || !compatibleSchema) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(artifact.path, "utf8"));
  } catch (error) {
    throw new Error(`${artifact.path} has corrupt analyzer problem evidence (${error instanceof Error ? error.message : String(error)})`, { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new Error(`${artifact.path} has malformed analyzer evidence`);
  }
  const problems = parsed["problems"];
  if (problems === undefined) {
    return missingProblems(artifact);
  }
  if (!Array.isArray(problems)) {
    throw new Error(`${artifact.path} has malformed analyzer problem evidence`);
  }
  return { artifact, problems: problems.map((row) => problemRow(row, artifact.path, producer)), legacyMissing: false };
}
