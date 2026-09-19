// @instrument-proof: `--perf`'s worst-long-task column says ENTRY POINT, in the header, in the cell and
// in a legend printed above every table.
// @instrument-absence-proof: a step with no LoAF script attribution may not print an `entry=` token.
//
// #2439, and it cost #2427 a profiling pass the day before this landed. The column was headed `script` and
// carried a bare function name, which reads as "this function spent that time". LoAF means the opposite:
// `scripts[].sourceFunctionName` names the script that ENTERED the task, and the duration beside it is the
// whole synchronous subtree that entry drove — so a DOM handler calling one setState owns the entire
// re-render, and a lane profiled `row-roving.ts` on the strength of this column while its own self time was
// 6 of 43,269 samples. The fix is not a new number (`--perf` REFUSES to combine with `--cpu-profile`:
// sampling overhead contaminates the interaction rates this very table reports, snap/ops/parse.ts), it is
// the label, and the legend that names the arm which does answer "which function is hot".
//
// ASSERTED THROUGH `printTable`'s BYTES, not through the new pure builder, so this spec compiles against
// the pre-fix source and goes RED there rather than failing to build (red-first receipt: the HEAD run
// printed `... blocking  script  click(...)` and a bare `plantedHot` cell, with no legend line at all).
import { installOutputSink } from "../../../../tooling/src/_shared/log.ts";
import type { StepReport } from "../../../../tooling/src/cpu-profile/index.ts";
import { printTable } from "../../../../tooling/src/cpu-profile/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STEP: StepReport = {
  idx: 1,
  label: "click [data-slot=composer-chat-actions]",
  longTaskCount: 1,
  longTaskTotalMs: 70,
  longTaskWorstMs: 70,
  worstBlockingMs: 20,
  worstScript: "plantedHot",
  clickDurMs: 75,
  clickInputDelayMs: 7,
  clickProcessingMs: 61,
  worstRafGapMs: 45,
  shiftScore: 0.02,
};

function tableLines(reports: readonly StepReport[]): string[] {
  const lines: string[] = [];
  const release = installOutputSink({ line: (s) => lines.push(s), warn: () => undefined });
  try {
    printTable(reports);
  } finally {
    release();
  }
  return lines;
}

test("the table declares the entry-point semantics before any number (#2439)", () => {
  const [legend = "", header = ""] = tableLines([STEP]);

  expect(legend).toContain("ENTRY POINT");
  expect(legend).toContain("NOT its self time");
  // The reader is pointed at the arm that answers the question this column does not.
  expect(legend).toContain("--cpu-profile");
  expect(header).toContain("task-entry");
  // The old header word is what made the cell read as a cost.
  expect(header).not.toContain("  script  ");
});

test("the attributed cell carries its own entry= token, so a quoted row stays honest (#2439 red-first)", () => {
  const row = tableLines([STEP]).at(-1) ?? "";

  expect(row).toContain("entry=plantedHot");
  expect(row).not.toContain("  plantedHot  ");
  // and the rest of the row is untouched by the relabel
  expect(row).toContain("20ms");
  expect(row).toContain("click [data-slot=composer-chat-actions]");
});

test("a step with no LoAF attribution prints a dash, never an empty entry= (#2439 absence control)", () => {
  const row = tableLines([{ ...STEP, worstScript: null, longTaskCount: 0, longTaskTotalMs: 0, longTaskWorstMs: 0, worstBlockingMs: null }]).at(-1) ?? "";

  expect(row).toContain("—");
  expect(row).not.toContain("entry=");
});
