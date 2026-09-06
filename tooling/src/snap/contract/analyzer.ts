// Analyzer artifact vocabulary shared by the analyzer writers and browser-free run-bundle readers.
// This stays below both heap receipts and the aggregate run index so neither contract owns the other.
import type { Arm } from "./arm-vocabulary.ts";

/** The row's NATURE, in the order a reader triages it. ONE importable tuple: the reader's zod enum
 *  (`contract/heap.ts`), its hand-rolled twin (`lib/run-report-problems.ts`) and the display rank
 *  (`lib/run-report-analyzers.ts`) all key off this rather than re-spelling the members.
 *
 *  `exemption` is the one NON-FAILING member (#1780): a measurement that WOULD have been a threshold row
 *  was excused by a named, bounded carve-out, and a reader who sees only the excused `0` cannot tell that
 *  from an unqualified clean run. It is rendered as an `annotation`, never an error. */
export const SNAP_ANALYZER_PROBLEM_KINDS = ["evidence-gap", "failure", "threshold", "exemption"] as const;
export type SnapAnalyzerProblemKind = (typeof SNAP_ANALYZER_PROBLEM_KINDS)[number];

/** One analyzer-owned, browser-free problem row embedded in its structured artifact. Threshold policy
 * stays with the analyzer writer; the report reader validates and renders this evidence without
 * re-deriving private budgets. */
export interface SnapAnalyzerProblem {
  readonly arm: Extract<Arm, "motion" | "interaction-perf" | "heap" | "design-audit">;
  readonly kind: SnapAnalyzerProblemKind;
  readonly metric: string;
  readonly subject: string;
  readonly observed: string;
  readonly threshold: string;
  readonly detail: string;
}

const SNAP_ANALYZER_PRODUCERS = ["motion", "perf", "heap", "design-audit"] as const;
export type SnapAnalyzerProducer = (typeof SNAP_ANALYZER_PRODUCERS)[number];

export function isSnapAnalyzerProducer(value: string): value is SnapAnalyzerProducer {
  return SNAP_ANALYZER_PRODUCERS.some((producer) => producer === value);
}

export function snapAnalyzerArm(producer: SnapAnalyzerProducer): SnapAnalyzerProblem["arm"] {
  return producer === "perf" ? "interaction-perf" : producer;
}
