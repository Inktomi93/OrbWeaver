// snap/lib/scenario-values — two pure helpers the scenario runner (ops/scenario.ts) uses on its per-checkpoint
// arrays: a labelled indexer that refuses a missing element loudly, and the CSS-failure predicate over one
// checkpoint outcome. Split out at the tooling-size cap (Core-Tooling-Law §4.3); no I/O, no browser.
import type { CaptureOutcome } from "../contract/types.ts";

export function scenarioValue<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`INSTRUMENT ERROR: scenario ${label} is missing at checkpoint ${String(index)}`);
  }
  return value;
}

export function checkpointCssFailed(outcome: CaptureOutcome): boolean {
  return (
    outcome.deadCss.length > 0 ||
    outcome.emptyCss.length > 0 ||
    (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0 ||
    outcome.cssEvidence?.status === "instrument-error"
  );
}
