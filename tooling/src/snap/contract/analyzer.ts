// Analyzer artifact vocabulary shared by the analyzer writers and browser-free run-bundle readers.
// This stays below both heap receipts and the aggregate run index so neither contract owns the other.
import type { Arm } from "./arm-vocabulary.ts";

/** One analyzer-owned, browser-free problem row embedded in its structured artifact. Threshold policy
 * stays with the analyzer writer; the report reader validates and renders this evidence without
 * re-deriving private budgets. */
export interface SnapAnalyzerProblem {
  readonly arm: Extract<Arm, "motion" | "interaction-perf" | "heap">;
  readonly kind: "threshold" | "failure" | "evidence-gap";
  readonly metric: string;
  readonly subject: string;
  readonly observed: string;
  readonly threshold: string;
  readonly detail: string;
}

const SNAP_ANALYZER_PRODUCERS = ["motion", "perf", "heap"] as const;
export type SnapAnalyzerProducer = (typeof SNAP_ANALYZER_PRODUCERS)[number];

export function isSnapAnalyzerProducer(value: string): value is SnapAnalyzerProducer {
  return SNAP_ANALYZER_PRODUCERS.some((producer) => producer === value);
}

export function snapAnalyzerArm(producer: SnapAnalyzerProducer): SnapAnalyzerProblem["arm"] {
  return producer === "perf" ? "interaction-perf" : producer;
}
