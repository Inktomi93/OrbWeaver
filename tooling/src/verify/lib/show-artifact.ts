// `check:show`'s artifact reader and consumability refusals. Reader-view shapes live in
// `contract/show-artifact.ts`; this module owns I/O and decisions, while `show-policy.ts` owns FINAL rendering.
import { readFileSync } from "node:fs";
import { abandonedRuns, reportsPath } from "@orb/tooling/_shared/artifacts";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { GateReport, PopulationAlarmView, RunManifestView, StructureReport } from "../contract/show-artifact.ts";
import type { FinalPolicyRow } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import type { ShowInk } from "./show-policy.ts";
import { finalBrokenEvidenceCount } from "./show-policy.ts";

const INSTRUMENT = "structure";

export function isFinalRow(g: GateReport): g is FinalPolicyRow {
  return g.contract === "final";
}

/** How a run identifies itself to a reader: the id, and the slot it wrote when it carries one. */
export function describeRun(run: RunManifestView | undefined): string {
  if (run === undefined) {
    return "<pre-#410 artifact — no run manifest>";
  }
  return run.artifactDir === undefined ? run.runId : `${run.runId} → ${run.artifactDir}`;
}

/** The misuse text for "there is no artifact here at all" — ONE spelling, raised both by the read below and
 *  by the caller's own null branch, so the two can never drift into two different instructions. */
export function missingReportRefusal(root: string): string {
  return `check:show — couldn't read ${reportsPath(root, STRUCTURE_REPORT_NAME)}\n  Run \`pnpm check:structure\` first to generate it.`;
}

export function readReport(root: string): StructureReport | null {
  const path = reportsPath(root, STRUCTURE_REPORT_NAME);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    // A missing pointer with a DEAD run behind it is a killed run, not misuse — the caller checks
    // `abandonedRuns` first and only falls through to this when nothing ran here at all.
    if (abandonedRuns(root, INSTRUMENT).length > 0) {
      return null;
    }
    // A missing report is MISUSE (3): run `pnpm check:structure` first to generate it.
    throw new UsageError(missingReportRefusal(root), { cause: err });
  }
  return JSON.parse(raw) as StructureReport;
}

/** #410 AFTER #1029 — the killed-run refusal, re-rooted. The in-flight stub no longer sits at the fixed
 *  path (concurrent runs clobbered it; that was the defect #1029 closed), so the tell a fixed-path reader
 *  needs is an ABANDONED SLOT: an in-flight marker whose pid is gone. One is refused whenever it is NEWER
 *  than the run the pointer resolves to — that is exactly "your last run died and you are about to read
 *  somebody else's (or an older) verdict as its result". A LIVE sibling run is deliberately not a refusal:
 *  it has not died, and the pointer it will publish is still a complete verdict. */
export function refuseAbandoned(root: string, report: StructureReport | null, ink: ShowInk): string | null {
  const dead = abandonedRuns(root, INSTRUMENT)[0];
  if (dead === undefined) {
    return null;
  }
  const publishedAt = report?.run?.startedAt;
  if (publishedAt !== undefined && publishedAt >= dead.startedAt) {
    return null; // a later run finished after that death — the pointer is the newer fact
  }
  return ink.red(
    `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict for this checkout's last run (run ${dead.runId})\n` +
      `      ‼ that run never finished — it left the IN-FLIGHT stub at ${dead.dir}/${STRUCTURE_REPORT_NAME}; it was killed, OOM-aborted or timed out\n` +
      `      ‼ ${report === null ? "no completed run has published a pointer here at all" : `the pointer resolves to the OLDER run ${describeRun(report.run)}`}\n` +
      "      Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#410/#1029).",
  );
}

/** #410: an artifact whose run did not finish (or did not reconcile) is NOT a verdict at any exit code —
 *  it is either the in-flight stub a killed run left behind, or a pass that ran fewer gates than the corpus
 *  holds. Returns the operator line to print, or null when the artifact is consumable. */
export function refuseIncomplete(report: StructureReport, ink: ShowInk): string | null {
  const run = report.run;
  if (run === undefined) {
    return null; // a pre-#410 artifact carries no manifest — readable, just older
  }
  // #2167: a run can FINISH and still not be a statement about the real tree — a fixture-mode run, a run that
  // observed a planter's paths, or a slot an operator tombstoned. That axis is `verdict`, not `complete`; the
  // two are orthogonal and this is the only reader that must not collapse them.
  if (run.verdict === "non-verdict") {
    return ink.red(
      `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict about the real tree (run ${run.runId})\n` +
        `      ‼ ${run.nonVerdictReason ?? "this run was marked a non-verdict and recorded no reason — treat it as unusable"}\n` +
        "      Do not derive real-tree facts from it. Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#2167).",
    );
  }
  if (run.complete && (run.incompleteReasons ?? []).length === 0) {
    return null;
  }
  const why = run.complete
    ? (run.incompleteReasons ?? []).map((r) => `      ‼ ${r}`).join("\n")
    : `      ‼ the run never finished — this is the IN-FLIGHT stub (ran ${run.ran}/${run.active}); it was killed, OOM-aborted or timed out`;
  return ink.red(
    `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict (run ${run.runId})\n${why}\n` +
      "      Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#410).",
  );
}

/** The member-population refusal, in the artifact reader's voice. HISTORICAL ONLY since #2176 Phase F
 *  (2026-09-14): no writer emits `populationAlarms` any more — the policy dispatcher refuses an empty
 *  declared population at the source (`contract/policy-pass.ts#POLICY_PASS_REFUSALS`) instead of publishing
 *  an alarm beside a finished verdict. This reader stays because artifacts written before that cutover are
 *  still on disk and still readable, and a reader that dropped the field would render them as clean. */
export function populationAlarmText(a: PopulationAlarmView): string {
  if (a.reason === "empty") {
    return `population "${a.source}" resolved ZERO members — the gate's subject derivation came back empty, so its verdict is a placebo (GATE-AUTHORING.md §1).`;
  }
  return `population "${a.source}" left ${a.unresolved} declaration(s) UNRESOLVED beside ${a.members} member(s) — the denominator silently shrank (GATE-AUTHORING.md §1).`;
}

/** How many "the run is not a verdict" signals the artifact carries. The first three terms are HISTORICAL
 *  (see `populationAlarmText`) and read as 0 on anything written after #2176 Phase F; the final side's
 *  count is the live one. ONE spelling, so the header, the exit code and the pass line can never disagree. */
export function brokenEvidenceCount(report: StructureReport): number {
  return (report.toolErrors?.length ?? 0) + (report.scanAlarms?.length ?? 0) + (report.populationAlarms?.length ?? 0) + finalBrokenEvidenceCount(report.policy);
}
