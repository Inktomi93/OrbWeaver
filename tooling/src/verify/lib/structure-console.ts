// `cli.ts structure`'s ONE console write, composed — split out of ops/structure.ts under the tooling line
// cap (#2247).
//
// IT RETURNS THE TEXT, IT DOES NOT WRITE IT. That is what lets it live in lib/ at all (Core-Tooling-Law
// §2: pure logic to lib/), and it is the same contract lib/render.ts already keeps — `renderPass` returns a
// string too. ops/structure.ts does the single `process.stdout.write`, so "the ONE console write" stays a
// true statement about one call site rather than a comment above four of them.
import type { SelectedGateCorpus } from "../contract/gate-corpus.ts";
import type { RunManifest } from "../contract/run-manifest.ts";
import type { StructureCountReconciliation } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import { renderPolicyPass } from "./render.ts";
import type { FinalSide } from "./structure-report.ts";
import { structureCountLine } from "./structure-report.ts";
import { policyTimingLine } from "./timing.ts";

export interface StructureConsoleInput {
  readonly selected: SelectedGateCorpus;
  readonly final: FinalSide;
  readonly reconciliation: StructureCountReconciliation;
  readonly run: RunManifest;
  readonly slotRelDir: string;
}

/** THE NON-VERDICT BANNER (#2167), printed at BOTH ends of the console write (#2222).
 *
 *  It used to print once, between the rosters and the counts. Its own comment said "BEFORE the counts, not
 *  after … a reader must not meet the roster before the disclaimer" — and the code did the opposite of the
 *  second half: the two rosters are hundreds of lines and they printed FIRST, so a reader scrolling from the
 *  top consumed a full gate roster about planted `__g_` props with nothing telling them so. That is the exact
 *  #2167 incident repeating one layer out.
 *
 *  The old placement's RATIONALE survives — a `tail` reader must still meet it — so the fix is not a move, it
 *  is BOTH: the head placement is what stops the roster being read as real-tree, the tail placement is what a
 *  truncated read still sees. A banner is cheap; a roster mistaken for a verdict is not. */
function nonVerdictBanner(run: RunManifest): string {
  return `\n‼ THIS RUN IS NOT A VERDICT — ${run.nonVerdictReason ?? "no reason recorded"}\n`;
}

/** The whole console text, in the order a reader scans: the non-verdict banner when there is one, the
 *  roster, the banner again, then what the run WAS, then cost. `slotRelDir` names the artifact the per-policy
 *  table lives in, so the cost line is a POINTER rather than a second, shorter ledger. */
export function structureConsole({ selected, final, reconciliation, run, slotRelDir }: StructureConsoleInput): string {
  const banner = run.nonVerdictReason !== null ? nonVerdictBanner(run) : "";
  return [
    banner,
    final.report === null ? "" : renderPolicyPass(final.rows, final.report, selected.gates),
    banner,
    `\nfinding count: ${structureCountLine(reconciliation)}\n`,
    `\n${completenessLine(run)}\n`,
    `  (per-policy timing: ${slotRelDir}/${STRUCTURE_REPORT_NAME})\n`,
    final.result === null ? "" : `${policyTimingLine(final.result.timing, final.rows)}\n`,
  ].join("");
}

/** The visible half of the #410 guarantee: the console says how many of the corpus actually ran. */
function completenessLine(run: RunManifest): string {
  const split = `${run.final.ran}/${run.final.registered} policies`;
  if (run.selection.kind !== "all") {
    // A selected run's own line says what it is NOT, in the same place a reader looks for the verdict.
    return [
      `check:structure: SELECTED RUN (--${run.selection.kind} ${run.selection.names.join(`, --${run.selection.kind} `)}) — ran ${run.ran}/${run.active} selected gate(s) (${split}) of ${run.corpusFiles} corpus file(s)`,
      `  this is NOT a whole-corpus verdict and reports/${STRUCTURE_REPORT_NAME} was NOT republished — read ${run.artifactDir}/${STRUCTURE_REPORT_NAME}`,
      ...(run.incompleteReasons.length === 0 ? [] : ["  the SELECTED run is itself INCOMPLETE:", ...run.incompleteReasons.map((r) => `  ‼ ${r}`)]),
    ].join("\n");
  }
  if (run.incompleteReasons.length === 0) {
    return `check:structure: ran ${run.ran}/${run.active} registered gate(s) (${split}) of ${run.corpusFiles} corpus file(s) — run COMPLETE (run ${run.runId} → ${run.artifactDir}/${STRUCTURE_REPORT_NAME})`;
  }
  return [
    `check:structure: run INCOMPLETE — the report is NOT a verdict (run ${run.runId}; ${split}):`,
    ...run.incompleteReasons.map((r) => `  ‼ ${r}`),
    "  See tooling/src/verify/contract/run-manifest.ts (#410).",
  ].join("\n");
}
